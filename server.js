const express = require('express');
const path = require('path');
const axios = require('axios');
const ical = require('ical');
const { Pool } = require('pg');
const { Resend } = require('resend');
const stripeLib = require('stripe');
const crypto = require('crypto');

const app = express();

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

app.use(express.static(path.join(__dirname, 'public')));

const resend = new Resend(process.env.RESEND_API_KEY);
const stripe = stripeLib(process.env.STRIPE_SECRET_KEY);

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// -----------------------------------------------------------------------------
// HELPERS
// -----------------------------------------------------------------------------

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function normalizeText(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function isFonyodApartment(apt) {
    if (!apt) return false;

    const haystack = normalizeText([
        apt.name,
        apt.aptName,
        apt.location,
        apt.city,
        apt.address
    ].filter(Boolean).join(' '));

    return haystack.includes('fonyod');
}

function findApartmentForOrder(db, data) {
    const aptId = data.aptId || data.bookingAptId || data.apartmentId;
    const aptName = data.apartment || data.aptName || data.apartmentName;

    if (aptId) {
        const byId = (db.apartments || []).find(apt => String(apt.id) === String(aptId));
        if (byId) return byId;
    }

    if (aptName) {
        const normalizedAptName = normalizeText(aptName);

        return (db.apartments || []).find(apt => {
            return normalizeText(apt.name) === normalizedAptName;
        });
    }

    return null;
}

function getPublicBaseUrl() {
    return process.env.PUBLIC_BASE_URL || 'https://balatonessence.com';
}

function parseDateOnly(value) {
    if (!value) return null;

    const parts = String(value).slice(0, 10).split('-').map(Number);

    if (parts.length !== 3 || parts.some(Number.isNaN)) {
        return null;
    }

    return new Date(parts[0], parts[1] - 1, parts[2]);
}

function todayDateOnly() {
    return parseDateOnly(getDateStringHu());
}

function diffDays(fromDate, toDate) {
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.round((toDate - fromDate) / msPerDay);
}

function validateMinimumBookingLeadTime(checkInValue) {
    const checkInDate = parseDateOnly(checkInValue);

    if (!checkInDate) {
        return {
            valid: false,
            error: 'Hibás érkezési dátum.'
        };
    }

    const checkInDateTime = new Date(
        checkInDate.getFullYear(),
        checkInDate.getMonth(),
        checkInDate.getDate(),
        14,
        0,
        0,
        0
    );

    const minimumAllowedDateTime = new Date();
    minimumAllowedDateTime.setHours(minimumAllowedDateTime.getHours() + 48);

    if (checkInDateTime < minimumAllowedDateTime) {
        return {
            valid: false,
            error: 'Foglalást legalább 48 órával az érkezés, azaz 14:00 előtt lehet leadni.'
        };
    }

    return {
        valid: true
    };
}

function getBookingApartmentAddress(db, booking) {
    const apt = (db.apartments || []).find(a => String(a.id) === String(booking.aptId));

    return (
        booking.address ||
        booking.aptAddress ||
        apt?.address ||
        ''
    );
}

function getBookingLang(booking) {
    const lang = booking.lang || booking.language || 'hu';
    return ['hu', 'en', 'de'].includes(lang) ? lang : 'hu';
}

function getBookingApartmentName(db, booking) {
    if (booking.aptName) return booking.aptName;
    if (booking.apartment) return booking.apartment;

    const apt = (db.apartments || []).find(a => String(a.id) === String(booking.aptId));
    return apt?.name || 'Balaton Essence apartman';
}

async function sendEmailHtml({ to, subject, html }) {
    if (!to) return;

    if (typeof sendMail === 'function') {
        return sendMail({ to, subject, html });
    }

    if (typeof resend !== 'undefined') {
        return resend.emails.send({
            from: process.env.EMAIL_FROM || 'Balaton Essence <info@balatonessence.com>',
            to,
            subject,
            html
        });
    }

    throw new Error('Nincs elérhető email küldő függvény.');
}

function formatMoney(value) {
    return Number(value || 0).toLocaleString('hu-HU');
}

function generateId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

function requireAdmin(req, res, next) {
    const token = req.headers['x-admin-token'];

    if (!process.env.ADMIN_TOKEN) {
        return res.status(500).json({
            error: 'ADMIN_TOKEN nincs beállítva a szerveren.'
        });
    }

    if (token !== process.env.ADMIN_TOKEN) {
        return res.status(401).json({ error: 'Nincs jogosultság.' });
    }

    next();
}

function normalizeLang(lang) {
    return ['hu', 'en', 'de'].includes(lang) ? lang : 'hu';
}

function buildPreArrivalEmailHtml(db, booking) {
    const lang = getBookingLang(booking);
    const aptName = getBookingApartmentName(db, booking);
    const aptAddress = getBookingApartmentAddress(db, booking);
    const baseUrl = getPublicBaseUrl();

    const apartment = (db.apartments || []).find(a =>
        String(a.id) === String(booking.aptId)
    );

    const breakfastAvailable = isFonyodApartment(apartment);

    const morningUrl = `${baseUrl}/morningorder.html?id=${encodeURIComponent(booking.id)}&lang=${lang}`;

    const sunPath = lang === 'en'
        ? '/en/sun.html'
        : lang === 'de'
            ? '/de/sun.html'
            : '/sun.html';

    const sunUrl = `${baseUrl}${sunPath}?id=${encodeURIComponent(booking.id)}&lang=${lang}`;

    const keyHandover = apartment?.keyHandover || 'Érkezés előtt telefonon vagy üzenetben egyeztetve.';
    const parkingInfo = apartment?.parkingInfo || 'A parkolási információkról érkezés előtt adunk pontos tájékoztatást.';
    const arrivalContactPhone = apartment?.arrivalContactPhone || '+36 20 499 5484';
    const googleMapsUrl = apartment?.googleMapsUrl ||
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(aptAddress || aptName)}`;

    const t = {
        hu: {
            title: 'Információk az érkezéshez',
            hello: `Kedves ${booking.guestName || 'Vendégünk'}!`,
            intro: 'Szeretettel várjuk Önöket a Balaton Essence apartmanjaiban.',
            infoIntro: 'Az érkezésükkel kapcsolatos legfontosabb információkat az alábbiakban találják:',
            apt: 'Apartman',
            address: 'Cím',
            checkIn: 'Check-in',
            checkOut: 'Check-out',
            keyHandover: 'Kulcsátadás',
            parking: 'Parkolás',
            contact: 'Kapcsolat',
            contactNote: 'Kérjük, hogy érkezés előtt körülbelül 30 perccel vegyék fel velünk a kapcsolatot telefonon vagy üzenetben.',
            maps: 'Google Maps',
            mapsBtn: 'Megnyitás Google Maps-ben',
            extrasTitle: 'Tegye még kényelmesebbé a pihenést',
            breakfast: 'Moments / tálrendelés',
            breakfastText: 'Ha szeretne reggelit vagy különleges tálat rendelni a tartózkodás idejére, itt tudja leadni.',
            breakfastBtn: 'Tál rendelése',
            sun: 'SUP & SUN',
            sunText: 'SUP, napozószék, napernyő vagy hajó foglalása a balatoni napokhoz.',
            sunBtn: 'Strandfelszerelés foglalása',
            footer: 'Szeretettel várjuk Önöket!',
            signature: 'Balaton Essence',
            slogan: '„Ahol az élmények emlékké válnak.”'
        },
        en: {
            title: 'Arrival information',
            hello: `Dear ${booking.guestName || 'Guest'},`,
            intro: 'We look forward to welcoming you to Balaton Essence apartments.',
            infoIntro: 'Please find the most important arrival information below:',
            apt: 'Apartment',
            address: 'Address',
            checkIn: 'Check-in',
            checkOut: 'Check-out',
            keyHandover: 'Key handover',
            parking: 'Parking',
            contact: 'Contact',
            contactNote: 'Please contact us by phone or message approximately 30 minutes before your arrival.',
            maps: 'Google Maps',
            mapsBtn: 'Open in Google Maps',
            extrasTitle: 'Make your stay even more comfortable',
            breakfast: 'Moments / platter order',
            breakfastText: 'If you would like to order breakfast or a special platter for your stay, you can do it here.',
            breakfastBtn: 'Order a platter',
            sun: 'SUP & SUN',
            sunText: 'Book SUP, sunbeds, parasols or a boat for your days at Lake Balaton.',
            sunBtn: 'Book beach equipment',
            footer: 'We look forward to welcoming you!',
            signature: 'Balaton Essence',
            slogan: '“Where experiences become memories.”'
        },
        de: {
            title: 'Informationen zur Anreise',
            hello: `Liebe/r ${booking.guestName || 'Gast'},`,
            intro: 'Wir freuen uns, Sie in den Balaton Essence Apartments begrüßen zu dürfen.',
            infoIntro: 'Die wichtigsten Informationen zu Ihrer Anreise finden Sie unten:',
            apt: 'Apartment',
            address: 'Adresse',
            checkIn: 'Check-in',
            checkOut: 'Check-out',
            keyHandover: 'Schlüsselübergabe',
            parking: 'Parken',
            contact: 'Kontakt',
            contactNote: 'Bitte kontaktieren Sie uns etwa 30 Minuten vor Ihrer Ankunft telefonisch oder per Nachricht.',
            maps: 'Google Maps',
            mapsBtn: 'In Google Maps öffnen',
            extrasTitle: 'Machen Sie Ihren Aufenthalt noch komfortabler',
            breakfast: 'Moments / Plattenbestellung',
            breakfastText: 'Wenn Sie Frühstück oder eine besondere Platte für Ihren Aufenthalt bestellen möchten, können Sie dies hier tun.',
            breakfastBtn: 'Platte bestellen',
            sun: 'SUP & SUN',
            sunText: 'Buchen Sie SUP, Sonnenliegen, Sonnenschirme oder ein Boot für Ihre Tage am Plattensee.',
            sunBtn: 'Strandausrüstung buchen',
            footer: 'Wir freuen uns auf Sie!',
            signature: 'Balaton Essence',
            slogan: '„Wo Erlebnisse zu Erinnerungen werden.”'
        }
    }[lang];

    return `
        <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #2C3325; line-height: 1.6;">
            <h1 style="color:#5c7a4d; margin-bottom: 20px;">${escapeHtml(t.title)}</h1>

            <p>${escapeHtml(t.hello)}</p>
            <p>${escapeHtml(t.intro)}</p>
            <p>${escapeHtml(t.infoIntro)}</p>

            <div style="background:#f9fbf8; border:1px solid #e2e8df; border-radius:10px; padding:22px; margin:25px 0;">
                <p><strong>${escapeHtml(t.apt)}:</strong> ${escapeHtml(aptName)}</p>
                ${aptAddress ? `<p><strong>${escapeHtml(t.address)}:</strong> ${escapeHtml(aptAddress)}</p>` : ''}
                <p><strong>${escapeHtml(t.checkIn)}:</strong> ${escapeHtml(booking.checkIn || booking.start || '')}</p>
                <p><strong>${escapeHtml(t.checkOut)}:</strong> ${escapeHtml(booking.checkOut || booking.end || '')}</p>
                <p><strong>${escapeHtml(t.keyHandover)}:</strong> ${escapeHtml(keyHandover)}</p>
                <p><strong>${escapeHtml(t.parking)}:</strong> ${escapeHtml(parkingInfo)}</p>
                <p><strong>${escapeHtml(t.contact)}:</strong> ${escapeHtml(arrivalContactPhone)}</p>
            </div>

            <div style="background:#ffffff; border:1px solid #e2e8df; border-radius:10px; padding:20px; margin-bottom:25px;">
                <p style="margin-top:0;">${escapeHtml(t.contactNote)}</p>

                <p style="margin-bottom: 14px;"><strong>${escapeHtml(t.maps)}:</strong></p>

                <a href="${escapeHtml(googleMapsUrl)}" style="display:inline-block; background:#5c7a4d; color:white; text-decoration:none; padding:12px 22px; border-radius:24px; font-weight:bold;">
                    ${escapeHtml(t.mapsBtn)}
                </a>
            </div>

            <div style="background:#f9fbf8; border:1px solid #e2e8df; border-radius:10px; padding:22px; margin:25px 0;">
                <h3 style="margin-top:0; color:#5c7a4d;">${escapeHtml(t.extrasTitle)}</h3>

                ${breakfastAvailable ? `
                    <div style="padding:15px 0; border-bottom:1px solid #e2e8df;">
                        <p style="margin:0 0 6px 0; font-weight:bold;">${escapeHtml(t.breakfast)}</p>
                        <p style="margin:0 0 14px 0; color:#666; font-size:14px;">${escapeHtml(t.breakfastText)}</p>
                        <a href="${morningUrl}" style="display:inline-block; background:#5c7a4d; color:white; text-decoration:none; padding:10px 22px; border-radius:20px; font-weight:bold; font-size:13px;">
                            ${escapeHtml(t.breakfastBtn)}
                        </a>
                    </div>
                ` : ''}

                <div style="padding:15px 0 0 0;">
                    <p style="margin:0 0 6px 0; font-weight:bold;">${escapeHtml(t.sun)}</p>
                    <p style="margin:0 0 14px 0; color:#666; font-size:14px;">${escapeHtml(t.sunText)}</p>
                    <a href="${sunUrl}" style="display:inline-block; background:#5c7a4d; color:white; text-decoration:none; padding:10px 22px; border-radius:20px; font-weight:bold; font-size:13px;">
                        ${escapeHtml(t.sunBtn)}
                    </a>
                </div>
            </div>

            <p>${escapeHtml(t.footer)}</p>
            <p style="margin-bottom: 4px;"><strong>${escapeHtml(t.signature)}</strong></p>
            <p style="font-style: italic; color:#6a7063; margin-top: 0;">${escapeHtml(t.slogan)}</p>

            <p style="font-size:12px; color:#999; margin-top: 30px;">Balaton Essence</p>
        </div>
    `;
}

function buildArrivalDayEmailHtml(db, booking) {
    const lang = getBookingLang(booking);
    const aptName = getBookingApartmentName(db, booking);
    const aptAddress = getBookingApartmentAddress(db, booking);
    const baseUrl = getPublicBaseUrl();

    const apartment = (db.apartments || []).find(a =>
        String(a.id) === String(booking.aptId)
    );

    const breakfastAvailable = isFonyodApartment(apartment);

    const arrivalContactPhone = apartment?.arrivalContactPhone || '+36 20 499 5484';

    const morningUrl = `${baseUrl}/morningorder.html?id=${encodeURIComponent(booking.id)}&lang=${lang}`;

    const sunPath = lang === 'en'
        ? '/en/sun.html'
        : lang === 'de'
            ? '/de/sun.html'
            : '/sun.html';

    const sunUrl = `${baseUrl}${sunPath}?id=${encodeURIComponent(booking.id)}&lang=${lang}`;

    const t = {
        hu: {
            title: 'Jó utat kívánunk a Balatonhoz!',
            hello: `Kedves ${booking.guestName || 'Vendégünk'}!`,
            intro: 'Ma várjuk Önöket a Balaton Essence apartmanjaiban.',
            apt: 'Apartman',
            address: 'Cím',
            checkIn: 'Check-in',
            contact: 'Kapcsolat',
            contactNote: 'Kérjük, hogy érkezés előtt körülbelül 30 perccel jelezzenek telefonon vagy üzenetben.',
            extrasTitle: 'Még kényelmesebbé tenné a pihenést?',
            breakfast: 'Moments / tálrendelés',
            breakfastText: 'A tartózkodás további napjaira reggeli vagy különleges tál rendelését is leadhatják.',
            breakfastBtn: 'Tál rendelése',
            sun: 'SUP & SUN',
            sunText: 'SUP, napozószék, napernyő vagy hajó foglalása a balatoni napokhoz.',
            sunBtn: 'Strandfelszerelés foglalása',
            footer: 'Szeretettel várjuk Önöket!',
            signature: 'Balaton Essence',
            slogan: '„Ahol az élmények emlékké válnak.”'
        },
        en: {
            title: 'Have a safe trip to Lake Balaton!',
            hello: `Dear ${booking.guestName || 'Guest'},`,
            intro: 'We are looking forward to welcoming you today at Balaton Essence apartments.',
            apt: 'Apartment',
            address: 'Address',
            checkIn: 'Check-in',
            contact: 'Contact',
            contactNote: 'Please contact us by phone or message approximately 30 minutes before your arrival.',
            extrasTitle: 'Would you like to make your stay even more comfortable?',
            breakfast: 'Moments / platter order',
            breakfastText: 'You can still order breakfast or a special platter for the following days of your stay.',
            breakfastBtn: 'Order a platter',
            sun: 'SUP & SUN',
            sunText: 'Book SUP, sunbeds, parasols or a boat for your days at Lake Balaton.',
            sunBtn: 'Book beach equipment',
            footer: 'We look forward to welcoming you!',
            signature: 'Balaton Essence',
            slogan: '“Where experiences become memories.”'
        },
        de: {
            title: 'Wir wünschen Ihnen eine gute Reise zum Balaton!',
            hello: `Liebe/r ${booking.guestName || 'Gast'},`,
            intro: 'Wir erwarten Sie heute in den Balaton Essence Apartments.',
            apt: 'Apartment',
            address: 'Adresse',
            checkIn: 'Check-in',
            contact: 'Kontakt',
            contactNote: 'Bitte kontaktieren Sie uns etwa 30 Minuten vor Ihrer Ankunft telefonisch oder per Nachricht.',
            extrasTitle: 'Möchten Sie Ihren Aufenthalt noch komfortabler gestalten?',
            breakfast: 'Moments / Plattenbestellung',
            breakfastText: 'Für die weiteren Tage Ihres Aufenthalts können Sie weiterhin Frühstück oder eine besondere Platte bestellen.',
            breakfastBtn: 'Platte bestellen',
            sun: 'SUP & SUN',
            sunText: 'Buchen Sie SUP, Sonnenliegen, Sonnenschirme oder ein Boot für Ihre Tage am Plattensee.',
            sunBtn: 'Strandausrüstung buchen',
            footer: 'Wir freuen uns auf Sie!',
            signature: 'Balaton Essence',
            slogan: '„Wo Erlebnisse zu Erinnerungen werden.”'
        }
    }[lang];

    return `
        <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #2C3325; line-height: 1.6;">
            <h1 style="color:#5c7a4d; margin-bottom: 20px;">${escapeHtml(t.title)}</h1>

            <p>${escapeHtml(t.hello)}</p>
            <p>${escapeHtml(t.intro)}</p>

            <div style="background:#f9fbf8; border:1px solid #e2e8df; border-radius:10px; padding:22px; margin:25px 0;">
                <p><strong>${escapeHtml(t.apt)}:</strong> ${escapeHtml(aptName)}</p>
                ${aptAddress ? `<p><strong>${escapeHtml(t.address)}:</strong> ${escapeHtml(aptAddress)}</p>` : ''}
                <p><strong>${escapeHtml(t.checkIn)}:</strong> ${escapeHtml(booking.checkIn || booking.start || '')}</p>
                <p><strong>${escapeHtml(t.contact)}:</strong> ${escapeHtml(arrivalContactPhone)}</p>
            </div>

            <div style="background:#ffffff; border:1px solid #e2e8df; border-radius:10px; padding:20px; margin-bottom:25px;">
                <p style="margin:0;">${escapeHtml(t.contactNote)}</p>
            </div>

            <div style="background:#f9fbf8; border:1px solid #e2e8df; border-radius:10px; padding:22px; margin:25px 0;">
                <h3 style="margin-top:0; color:#5c7a4d;">${escapeHtml(t.extrasTitle)}</h3>

                ${breakfastAvailable ? `
                    <div style="padding:15px 0; border-bottom:1px solid #e2e8df;">
                        <p style="margin:0 0 6px 0; font-weight:bold;">${escapeHtml(t.breakfast)}</p>
                        <p style="margin:0 0 14px 0; color:#666; font-size:14px;">${escapeHtml(t.breakfastText)}</p>
                        <a href="${morningUrl}" style="display:inline-block; background:#5c7a4d; color:white; text-decoration:none; padding:10px 22px; border-radius:20px; font-weight:bold; font-size:13px;">
                            ${escapeHtml(t.breakfastBtn)}
                        </a>
                    </div>
                ` : ''}

                <div style="padding:15px 0 0 0;">
                    <p style="margin:0 0 6px 0; font-weight:bold;">${escapeHtml(t.sun)}</p>
                    <p style="margin:0 0 14px 0; color:#666; font-size:14px;">${escapeHtml(t.sunText)}</p>
                    <a href="${sunUrl}" style="display:inline-block; background:#5c7a4d; color:white; text-decoration:none; padding:10px 22px; border-radius:20px; font-weight:bold; font-size:13px;">
                        ${escapeHtml(t.sunBtn)}
                    </a>
                </div>
            </div>

            <p>${escapeHtml(t.footer)}</p>
            <p style="margin-bottom: 4px;"><strong>${escapeHtml(t.signature)}</strong></p>
            <p style="font-style: italic; color:#6a7063; margin-top: 0;">${escapeHtml(t.slogan)}</p>

            <p style="font-size:12px; color:#999; margin-top: 30px;">Balaton Essence</p>
        </div>
    `;
}

async function processScheduledGuestEmails() {
    try {
        const today = todayDateOnly();
        const db = await getDbContent();

        const bookings = db.bookings || [];
        const sentUpdates = [];

        for (const booking of bookings) {
            if (!booking || !booking.email) continue;
            if (booking.status === 'cancelled') continue;
            if (isBlockedBooking(booking) && booking.manualGuestData !== true) continue;

            const checkIn = parseDateOnly(booking.checkIn || booking.start);
            const checkOut = parseDateOnly(booking.checkOut || booking.end);

            if (!checkIn) continue;

            const daysUntilArrival = diffDays(today, checkIn);

            if (daysUntilArrival === 7 && !booking.preArrivalEmailSentAt) {
                const lang = getBookingLang(booking);

                const subject = {
                    hu: 'Információk az érkezéshez | Balaton Essence',
                    en: 'Arrival information | Balaton Essence',
                    de: 'Informationen zur Anreise | Balaton Essence'
                }[lang];

                try {
                    await sendEmailHtml({
                        to: booking.email,
                        subject,
                        html: buildPreArrivalEmailHtml(db, booking)
                    });

                    sentUpdates.push({
                        bookingId: booking.id,
                        field: 'preArrivalEmailSentAt'
                    });

                    console.log(`7 napos érkezési email elküldve: ${booking.id}`);
                } catch (err) {
                    console.error(`7 napos érkezési email hiba: ${booking.id}`, err);
                }
            }

            if (daysUntilArrival === 0 && !booking.arrivalDayEmailSentAt) {
                const lang = getBookingLang(booking);

                const subject = {
                    hu: 'Jó utat kívánunk a Balatonhoz! | Balaton Essence',
                    en: 'Have a safe trip to Lake Balaton! | Balaton Essence',
                    de: 'Gute Reise zum Balaton! | Balaton Essence'
                }[lang];

                try {
                    await sendEmailHtml({
                        to: booking.email,
                        subject,
                        html: buildArrivalDayEmailHtml(db, booking)
                    });

                    sentUpdates.push({
                        bookingId: booking.id,
                        field: 'arrivalDayEmailSentAt'
                    });

                    console.log(`Érkezés napi email elküldve: ${booking.id}`);
                } catch (err) {
                    console.error(`Érkezés napi email hiba: ${booking.id}`, err);
                }
            }

            if (checkOut) {
                const daysAfterCheckout = diffDays(checkOut, today);

                if (daysAfterCheckout === 1 && !booking.reviewEmailSentAt) {
                    const lang = getBookingLang(booking);

                    const subject = {
                        hu: 'Köszönjük, hogy nálunk pihent | Balaton Essence',
                        en: 'Thank you for staying with us | Balaton Essence',
                        de: 'Vielen Dank für Ihren Aufenthalt | Balaton Essence'
                    }[lang];

                    try {
                        await sendEmailHtml({
                            to: booking.email,
                            subject,
                            html: buildReviewEmailHtml(db, booking)
                        });

                        sentUpdates.push({
                            bookingId: booking.id,
                            field: 'reviewEmailSentAt'
                        });

                        console.log(`Értékelő email elküldve: ${booking.id}`);
                    } catch (err) {
                        console.error(`Értékelő email hiba: ${booking.id}`, err);
                    }
                }
            }
        }

        if (sentUpdates.length > 0) {
            await updateDbContent(async freshDb => {
                freshDb.bookings = (freshDb.bookings || []).map(booking => {
                    const updatesForBooking = sentUpdates.filter(
                        update => String(update.bookingId) === String(booking.id)
                    );

                    if (updatesForBooking.length === 0) return booking;

                    const updatedBooking = { ...booking };

                    updatesForBooking.forEach(update => {
                        updatedBooking[update.field] = new Date().toISOString();
                    });

                    return updatedBooking;
                });

                return freshDb;
            });
        }
    } catch (err) {
        console.error('Automata vendég email feldolgozási hiba:', err);
    }
}

function isBlockedBooking(booking) {
    const guest = normalizeText(booking.guestName || '');
    const type = normalizeText(booking.type || '');
    const status = normalizeText(booking.status || '');

    return (
        guest === 'zarolt idoszak' ||
        guest === 'zárolt időszak' ||
        type === 'blocked' ||
        type === 'manual-block' ||
        status === 'blocked'
    );
}

function isCancelledBooking(booking) {
    const status = normalizeText(booking?.status || booking?.paymentStatus || '');
    return status === 'cancelled' || status === 'canceled';
}

function isBookingOverlapping(bookings, newBooking, ignoreStripeId = null, ignoreBookingId = null) {
    return (bookings || []).some(oldB => {
        if (String(oldB.aptId) !== String(newBooking.aptId)) return false;
        if (isCancelledBooking(oldB)) return false;
        if (ignoreStripeId && oldB.stripeId === ignoreStripeId) return false;
        if (ignoreBookingId && String(oldB.id) === String(ignoreBookingId)) return false;

        const start1 = parseDateOnly(newBooking.checkIn || newBooking.start);
        const end1 = parseDateOnly(newBooking.checkOut || newBooking.end);
        const start2 = parseDateOnly(oldB.checkIn || oldB.start);
        const end2 = parseDateOnly(oldB.checkOut || oldB.end);

        if (!start1 || !end1 || !start2 || !end2) return false;

        return start1 < end2 && end1 > start2;
    });
}

function hasDisabledDateInBookingRange(apartment, booking) {
    const disabledDates = new Set(
        Array.isArray(apartment?.disabledDates) ? apartment.disabledDates : []
    );

    if (disabledDates.size === 0) return false;

    const start = parseDateOnly(booking.checkIn || booking.start);
    const end = parseDateOnly(booking.checkOut || booking.end);

    if (!start || !end) return true;

    const curr = new Date(start);

    while (curr < end) {
        const dateStr = `${curr.getFullYear()}-${pad2(curr.getMonth() + 1)}-${pad2(curr.getDate())}`;

        if (disabledDates.has(dateStr)) {
            return true;
        }

        curr.setDate(curr.getDate() + 1);
    }

    return false;
}

function getBookingDateString(value) {
    const date = parseDateOnly(value);

    if (!date) return '';

    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function getArrivalDepartureRestriction(apartment, booking) {
    const checkIn = getBookingDateString(booking.checkIn || booking.start);
    const checkOut = getBookingDateString(booking.checkOut || booking.end);

    if (!checkIn || !checkOut) {
        return {
            valid: false,
            error: 'Hibás dátumválasztás.'
        };
    }

    const noCheckInDates = new Set(
        Array.isArray(apartment?.noCheckInDates) ? apartment.noCheckInDates : []
    );

    const noCheckOutDates = new Set(
        Array.isArray(apartment?.noCheckOutDates) ? apartment.noCheckOutDates : []
    );

    if (noCheckInDates.has(checkIn)) {
        return {
            valid: false,
            error: 'A kiválasztott napon nem lehet érkezni. Kérjük, válasszon másik érkezési napot.'
        };
    }

    if (noCheckOutDates.has(checkOut)) {
        return {
            valid: false,
            error: 'A kiválasztott napon nem lehet távozni. Kérjük, válasszon másik távozási napot.'
        };
    }

    return { valid: true };
}

function pad2(num) {
    return String(num).padStart(2, '0');
}

function normalizeIcalDate(input) {
    if (!input) return null;

    if (input instanceof Date) {
        if (isNaN(input.getTime())) return null;
        return `${input.getFullYear()}-${pad2(input.getMonth() + 1)}-${pad2(input.getDate())}`;
    }

    if (typeof input === 'number') {
        const d = new Date(input);
        if (isNaN(d.getTime())) return null;
        return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    }

    if (typeof input === 'string') {
        const trimmed = input.trim();

        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

        if (/^\d{8}$/.test(trimmed)) {
            return `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`;
        }

        const d = new Date(trimmed);
        if (!isNaN(d.getTime())) {
            return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
        }

        return null;
    }

    if (typeof input === 'object') {
        if (typeof input.toJSDate === 'function') {
            const d = input.toJSDate();
            if (d instanceof Date && !isNaN(d.getTime())) {
                return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
            }
        }

        if (input.val) return normalizeIcalDate(input.val);
        if (input.date) return normalizeIcalDate(input.date);

        if (
            typeof input.year === 'number' &&
            typeof input.month === 'number' &&
            typeof input.day === 'number'
        ) {
            return `${input.year}-${pad2(input.month)}-${pad2(input.day)}`;
        }
    }

    return null;
}

function ensureDbShape(db) {
    if (!db || typeof db !== 'object') db = {};

    if (!Array.isArray(db.apartments)) db.apartments = [];
    if (!Array.isArray(db.owners)) db.owners = [];
    if (!Array.isArray(db.bookings)) db.bookings = [];
    if (!Array.isArray(db.extras)) db.extras = [];
    if (!Array.isArray(db.breakfasts)) db.breakfasts = [];
    if (!Array.isArray(db.reviews)) db.reviews = [];
    if (!Array.isArray(db.recommendations)) db.recommendations = [];
    if (!Array.isArray(db.todos)) db.todos = [];
    if (!Array.isArray(db.todoMessages)) db.todoMessages = [];
    if (!Array.isArray(db.pendingBookings)) db.pendingBookings = [];
    if (!Array.isArray(db.aboutHeritageImages)) db.aboutHeritageImages = [];
    if (typeof db.aboutTeamImage !== 'string') db.aboutTeamImage = '';

    if (!db.services || typeof db.services !== 'object') db.services = {};

    if (!db.siteContent || typeof db.siteContent !== 'object') {
        db.siteContent = {};
    }

    if (!Array.isArray(db.siteContent.aboutGalleryImages)) {
        db.siteContent.aboutGalleryImages = [];
    }

    if (!Array.isArray(db.services.sun)) {
    db.services.sun = [
        {
            id: 'sup',
            name_hu: 'SUP',
            name_en: 'SUP',
            name_de: 'SUP',
            price: 5900,
            unit_hu: 'nap',
            unit_en: 'day',
            unit_de: 'Tag',
            description_hu: '',
            description_en: '',
            description_de: '',
            image: 'img/sup.png',
            maxStock: 4,
            active: true
        },
        {
            id: 'sunbed',
            name_hu: 'Napozószék',
            name_en: 'Sunbed',
            name_de: 'Sonnenliege',
            price: 1500,
            unit_hu: 'nap',
            unit_en: 'day',
            unit_de: 'Tag',
            description_hu: '',
            description_en: '',
            description_de: '',
            image: 'img/napozoszek.png',
            maxStock: 8,
            active: true
        },
        {
            id: 'umbrella',
            name_hu: 'Napernyő',
            name_en: 'Parasol',
            name_de: 'Sonnenschirm',
            price: 1000,
            unit_hu: 'nap',
            unit_en: 'day',
            unit_de: 'Tag',
            description_hu: '',
            description_en: '',
            description_de: '',
            image: 'img/napernyo.png',
            maxStock: 8,
            active: true
        },
        {
            id: 'boat',
            name_hu: 'Hajó',
            name_en: 'Boat',
            name_de: 'Boot',
            price: 35000,
            unit_hu: 'nap',
            unit_en: 'day',
            unit_de: 'Tag',
            description_hu: '',
            description_en: '',
            description_de: '',
            image: 'img/hajo.png',
            maxStock: 1,
            active: true
        }
    ];
}

    if (!Array.isArray(db.services.moments)) {
        db.services.moments = [
            {
                id: 'breakfast_plate',
                name_hu: 'Reggeli tál',
                name_en: 'Breakfast plate',
                name_de: 'Frühstücksplatte',
                price: 4200,
                description_hu: 'Friss péksütemények, válogatott felvágottak és sajtok, szezonális zöldségek, gyümölcsök és apró finomságok. Kényelmes, bőséges reggeli, amely tökéletes indítása a napnak. A tál összeállítása szezonálisan változhat.',
                description_en: 'Fresh pastries, a selection of cold cuts and cheeses, seasonal vegetables, fruits, and small treats. A comfortable, hearty breakfast that is the perfect way to start your day. The contents of the platter may vary depending on the season.',
                description_de: 'Frisches Gebäck, ausgewählte Wurst- und Käsesorten, Gemüse und Obst der Saison sowie kleine Köstlichkeiten. Ein gemütliches, reichhaltiges Frühstück, das den Tag perfekt einläutet. Die Zusammensetzung der Platte kann je nach Saison variieren.',
                image: 'img/Reggeli tál.png',
                active: true
            },
            {
                id: 'cheese_plate',
                name_hu: 'Sajttál',
                name_en: 'Cheese plate',
                name_de: 'Käseplatte',
                price: 4800,
                description_hu: 'Gondosan válogatott sajtok, friss gyümölcsök és harmonizáló kiegészítők elegáns tálalásban, egy palack dél-balatoni borral kiegészítve. Tökéletes választás egy nyugodt estéhez vagy különleges pillanathoz. A tál összeállítása szezonálisan változhat.',
                description_en: 'Carefully selected cheeses, fresh fruits, and complementary accompaniments, elegantly presented and paired with a bottle of wine from the southern Balaton region. The perfect choice for a relaxing evening or a special occasion. The contents of the platter may vary seasonally.',
                description_de: 'Sorgfältig ausgewählte Käsesorten, frisches Obst und dazu passende Beilagen, elegant angerichtet und ergänzt durch eine Flasche Wein aus dem südlichen Balaton. Die perfekte Wahl für einen ruhigen Abend oder einen besonderen Moment. Die Zusammensetzung der Platte kann je nach Saison variieren.',
                image: 'img/Sajttál.png',
                active: true
            },
            {
                id: 'celebration_plate',
                name_hu: 'Ünnepi tál',
                name_en: 'Festive plate',
                name_de: 'Festliche Platte',
                price: 4800,
                description_hu: 'Egy üveg Prosecco, két szelet desszert és gondosan válogatott kiegészítők egy elegáns, meghitt pillanathoz. Ideális választás ünnepléshez, romantikus estékhez vagy évfordulóhoz. A tál összeállítása szezonálisan változhat.',
                description_en: 'A bottle of Prosecco, two dessert slices, and carefully selected accompaniments for an elegant, intimate moment. The perfect choice for celebrations, romantic evenings, or anniversaries. The contents of the platter may vary by season.',
                description_de: 'Eine Flasche Prosecco, zwei Dessertstücke und sorgfältig ausgewählte Beilagen für einen eleganten, gemütlichen Moment. Die ideale Wahl für Feierlichkeiten, romantische Abende oder Jahrestage. Die Zusammenstellung der Platte kann je nach Saison variieren.',
                image: 'img/Születésnap, évforduló.png',
                active: true
            }
        ];
    }

    return db;
}

// -----------------------------------------------------------------------------
// DATABASE
// -----------------------------------------------------------------------------

async function initDb() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS essence_data (
            key text PRIMARY KEY,
            content jsonb NOT NULL
        )
    `);

    const result = await pool.query("SELECT content FROM essence_data WHERE key = 'main_db'");

    if (result.rowCount === 0) {
        const initialDb = ensureDbShape({});
        await pool.query(
            "INSERT INTO essence_data (key, content) VALUES ('main_db', $1)",
            [initialDb]
        );
        console.log('Adatbázis inicializálva.');
    } else {
        const fixedDb = ensureDbShape(result.rows[0].content);
        await pool.query(
            "UPDATE essence_data SET content = $1 WHERE key = 'main_db'",
            [fixedDb]
        );
    }
}

async function getDbContent() {
    const result = await pool.query("SELECT content FROM essence_data WHERE key = 'main_db'");
    return ensureDbShape(result.rows[0]?.content || {});
}

async function saveDbContent(data) {
    await pool.query(
        "UPDATE essence_data SET content = $1 WHERE key = 'main_db'",
        [ensureDbShape(data)]
    );
}

async function updateDbContent(mutator) {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const result = await client.query(
            "SELECT content FROM essence_data WHERE key = 'main_db' FOR UPDATE"
        );

        const db = ensureDbShape(result.rows[0]?.content || {});
        const updatedDb = ensureDbShape(await mutator(db));

        await client.query(
            "UPDATE essence_data SET content = $1 WHERE key = 'main_db'",
            [updatedDb]
        );

        await client.query('COMMIT');
        return updatedDb;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

initDb().catch(console.error);

// -----------------------------------------------------------------------------
// TRANSLATIONS
// -----------------------------------------------------------------------------

const bookingEmailTranslations = {
    hu: {
        subject: 'Sikeres foglalás és fizetés - Balaton Essence',
        preheader: 'Sikeres foglalás és fizetés!',
        dear: 'Kedves',
        thankYou: 'Köszönjük, hogy minket választott! Az 50% előleget sikeresen fogadtuk, a foglalását véglegesítettük. Várjuk szeretettel a Balatonnál!',
        detailsTitle: 'Foglalási adatok',
        apt: 'Apartman:',
        checkIn: 'Érkezés:',
        checkOut: 'Távozás:',
        guests: 'Vendégek száma:',
        paid: 'Fizetett előleg:',
        balance: 'Hátralék (helyszínen):',
        policyTitle: 'Lemondási feltételek',
        policyText: 'Érkezés előtt legalább 14 nappal a foglalás díjmentesen lemondható, ebben az esetben a befizetett előleg visszajár. Érkezést megelőző 14 napon belüli lemondás esetén a befizetett előleg nem visszatéríthető.',
        cancelBtn: 'Foglalás lemondása'
    },
    en: {
        subject: 'Booking and Payment Confirmed - Balaton Essence',
        preheader: 'Booking and payment successful!',
        dear: 'Dear',
        thankYou: 'Thank you for choosing us! We have successfully received your 50% deposit and confirmed your reservation. We look forward to welcoming you to Lake Balaton!',
        detailsTitle: 'Booking Details',
        apt: 'Apartment:',
        checkIn: 'Check-in:',
        checkOut: 'Check-out:',
        guests: 'Guests:',
        paid: 'Paid Deposit:',
        balance: 'Balance (at property):',
        policyTitle: 'Cancellation Policy',
        policyText: 'The booking can be cancelled free of charge at least 14 days before arrival. In this case, the paid deposit will be refunded. In case of cancellation within 14 days before arrival, the paid deposit is non-refundable.',
        cancelBtn: 'Cancel Booking'
    },
    de: {
        subject: 'Buchung & Zahlung bestätigt - Balaton Essence',
        preheader: 'Buchung und Zahlung erfolgreich!',
        dear: 'Sehr geehrte(r)',
        thankYou: 'Vielen Dank, dass Sie sich für uns entschieden haben! Wir haben Ihre 50%ige Anzahlung erhalten und Ihre Reservierung bestätigt. Wir freuen uns auf Sie am Plattensee!',
        detailsTitle: 'Buchungsdetails',
        apt: 'Apartment:',
        checkIn: 'Anreise:',
        checkOut: 'Abreise:',
        guests: 'Gäste:',
        paid: 'Geleistete Anzahlung:',
        balance: 'Restbetrag (vor Ort):',
        policyTitle: 'Stornierungsbedingungen',
        policyText: 'Die Buchung kann bis spätestens 14 Tage vor Anreise kostenfrei storniert werden. In diesem Fall wird die geleistete Anzahlung zurückerstattet. Bei einer Stornierung innerhalb von 14 Tagen vor Anreise ist die geleistete Anzahlung nicht erstattungsfähig.',
        cancelBtn: 'Buchung stornieren'
    }
};

function getOrderTranslations(data, lang) {
    const translations = {
        hu: {
            subj: data.type === 'BREAKFAST'
                ? 'Visszaigazolás: Reggeli rendelés - Balaton Essence'
                : 'Visszaigazolás: Strandfelszerelés bérlés - Balaton Essence',
            title: 'Rendelés rögzítve',
            subtitle: 'Köszönjük rendelését!',
            dear: 'Kedves',
            body: data.type === 'BREAKFAST'
                ? 'Moments rendelését rögzítettük. A kiválasztott tálat a megadott napon, a választott kiszállítási időpontban szállítjuk ki az apartmanhoz.'
                : 'Sikeresen rögzítettük strandfelszerelés foglalását. Az eszközöket az előre egyeztetett időpontban veheti át.',
            details: 'Rendelés részletei:',
            items: 'Tételek:',
            period: 'Időszak:',
            pickup: data.type === 'BREAKFAST' ? 'Helyszín:' : 'Átvételi pont:',
            total: 'Fizetendő:',
            methodCash: 'Fizetés módja: Helyszíni készpénz',
            methodCard: 'Fizetés módja: Online bankkártya',
            footer: 'Ha bármi változik, kérjük jelezze válaszlevélben.',
            days: 'nap'
        },
        en: {
            subj: data.type === 'BREAKFAST'
                ? 'Confirmation: Breakfast Order - Balaton Essence'
                : 'Confirmation: Beach Equipment Rental - Balaton Essence',
            title: 'Order Confirmed',
            subtitle: 'Thank you for your order!',
            dear: 'Dear',
            body: data.type === 'BREAKFAST'
                ? 'Your Moments order has been recorded. The selected platter will be delivered to your apartment on the chosen day at the selected delivery time.'
                : 'Your beach equipment booking has been successfully recorded. You can pick up the items at the prearranged time.',
            details: 'Order Details:',
            items: 'Items:',
            period: 'Period:',
            pickup: 'Location:',
            total: 'Total Amount:',
            methodCash: 'Payment method: Cash on site',
            methodCard: 'Payment method: Online card payment',
            footer: 'If anything changes, please let us know by replying to this email.',
            days: 'days'
        },
        de: {
            subj: data.type === 'BREAKFAST'
                ? 'Bestätigung: Frühstücksbestellung - Balaton Essence'
                : 'Bestätigung: Strandausrüstung Verleih - Balaton Essence',
            title: 'Bestellung bestätigt',
            subtitle: 'Vielen Dank für Ihre Bestellung!',
            dear: 'Sehr geehrte(r)',
            body: data.type === 'BREAKFAST'
                ? 'Ihre Moments-Bestellung wurde registriert. Die ausgewählte Platte wird am gewählten Tag zur ausgewählten Lieferzeit zu Ihrem Apartment geliefert.'
                : 'Ihre Buchung der Strandausrüstung wurde erfolgreich registriert. Sie können die Geräte zum vereinbarten Termin abholen.',
            details: 'Bestelldetails:',
            items: 'Artikel:',
            period: 'Zeitraum:',
            pickup: 'Ort:',
            total: 'Gesamtbetrag:',
            methodCash: 'Zahlungsart: Barzahlung vor Ort',
            methodCard: 'Zahlungsart: Online-Kartenzahlung',
            footer: 'Wenn sich etwas ändert, geben Sie uns bitte per Antwort-E-Mail Bescheid.',
            days: 'Tage'
        }
    };

    return translations[lang] || translations.hu;
}

// -----------------------------------------------------------------------------
// EMAILS
// -----------------------------------------------------------------------------

async function sendAdminBookingEmail(newB) {
    try {
        await resend.emails.send({
            from: 'Rendszer <info@balatonessence.com>',
            to: 'balatonessence@gmail.com',
            subject: `🚨 ÚJ FOGLALÁS (Fizetve): ${escapeHtml(newB.guestName)}`,
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 2px solid #5c7a4d; border-radius: 10px; overflow: hidden;">
                    <div style="background-color: #5c7a4d; color: white; padding: 20px; text-align: center;">
                        <h2 style="margin: 0;">Sikeres foglalás és fizetés!</h2>
                    </div>
                    <div style="padding: 20px;">
                        <p><strong>Vendég:</strong> ${escapeHtml(newB.guestName)}</p>
                        <p><strong>Email:</strong> ${escapeHtml(newB.email)}</p>
                        <p><strong>Telefon:</strong> ${escapeHtml(newB.phone || newB.tel || newB.telefon || '-')}</p>
                        <p><strong>Apartman:</strong> ${escapeHtml(newB.aptName)}</p>
                        <p><strong>Időpont:</strong> ${escapeHtml(newB.checkIn)} — ${escapeHtml(newB.checkOut)}</p>
                        <p><strong>Vendégek száma:</strong> ${escapeHtml(newB.guests || '-')} fő</p>
                        <p><strong>Befizetett előleg:</strong> ${formatMoney(newB.paidDeposit)} Ft</p>
                        <p><strong>Teljes összeg:</strong> ${formatMoney(newB.totalPrice)} Ft</p>
                        <div style="background: #fff4e5; padding: 10px; border-left: 4px solid #ffa500;">
                            <strong>Üzenet:</strong> ${escapeHtml(newB.msg || '-')}
                        </div>
                    </div>
                </div>`
        });
    } catch (e) {
        console.error('Admin foglalási email hiba:', e);
    }
}

async function sendGuestBookingEmail(req, newB) {
    const guestLang = normalizeLang(newB.lang || 'hu');
    const t = bookingEmailTranslations[guestLang] || bookingEmailTranslations.hu;
    const balance = Number(newB.totalPrice || 0) - Number(newB.paidDeposit || 0);

    const db = await getDbContent();

    const apartment = (db.apartments || []).find(a =>
        String(a.id) === String(newB.aptId)
    );

    const breakfastAvailable = isFonyodApartment(apartment);

    const cancelUrl = `https://${req.get('host')}/cancel.html?id=${encodeURIComponent(newB.id)}&token=${encodeURIComponent(newB.cancelToken || '')}&lang=${guestLang}`;
    const breakfastUrl = `https://${req.get('host')}/morningorder.html?id=${encodeURIComponent(newB.id)}&lang=${guestLang}`;

    const sunPath = guestLang === 'en'
        ? '/en/sun.html'
        : guestLang === 'de'
            ? '/de/sun.html'
            : '/sun.html';

    const sunUrl = `https://${req.get('host')}${sunPath}?id=${encodeURIComponent(newB.id)}&lang=${guestLang}`;

    const extraTexts = {
        hu: {
            title: 'Tegye még kényelmesebbé a pihenést',
            breakfastTitle: 'Reggeli rendelés',
            breakfastText: 'Rendeljen kényelmesen reggelit a foglalásához.',
            breakfastBtn: 'Reggeli rendelése',
            sunTitle: 'SUP & strandfelszerelés',
            sunText: 'Foglaljon SUP-ot, napozószéket vagy napernyőt a balatoni napokhoz.',
            sunBtn: 'Strandfelszerelés foglalása'
        },
        en: {
            title: 'Make your stay even more comfortable',
            breakfastTitle: 'Breakfast order',
            breakfastText: 'Order breakfast easily for your stay.',
            breakfastBtn: 'Order breakfast',
            sunTitle: 'SUP & beach equipment',
            sunText: 'Book SUP, sunbeds or parasols for your days at Lake Balaton.',
            sunBtn: 'Book beach equipment'
        },
        de: {
            title: 'Machen Sie Ihren Aufenthalt noch komfortabler',
            breakfastTitle: 'Frühstücksbestellung',
            breakfastText: 'Bestellen Sie bequem Frühstück für Ihren Aufenthalt.',
            breakfastBtn: 'Frühstück bestellen',
            sunTitle: 'SUP & Strandausrüstung',
            sunText: 'Buchen Sie SUP, Sonnenliegen oder Sonnenschirme für Ihre Tage am Plattensee.',
            sunBtn: 'Strandausrüstung buchen'
        }
    };

    const extraT = extraTexts[guestLang] || extraTexts.hu;

    try {
        await resend.emails.send({
            from: 'Balaton Essence <info@balatonessence.com>',
            to: newB.email,
            subject: t.subject,
            html: `
                <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
                    <div style="background-color: #5c7a4d; padding: 40px 20px; text-align: center;">
                        <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 400; letter-spacing: 1px;">Balaton Essence</h1>
                        <p style="color: #e8f0e4; margin: 10px 0 0 0; font-size: 16px;">${escapeHtml(t.preheader)}</p>
                    </div>

                    <div style="padding: 40px 30px; color: #333333;">
                        <p style="font-size: 18px; margin-bottom: 20px;">${escapeHtml(t.dear)} <strong>${escapeHtml(newB.guestName)}</strong>,</p>
                        <p style="line-height: 1.6; color: #555555; font-size: 15px;">${escapeHtml(t.thankYou)}</p>

                        <div style="background-color: #f9fbf8; border: 1px solid #e2e8df; border-radius: 8px; padding: 25px; margin: 30px 0;">
                            <h3 style="margin-top: 0; color: #5c7a4d; border-bottom: 2px solid #e2e8df; padding-bottom: 10px; font-weight: 600;">${escapeHtml(t.detailsTitle)}</h3>
                            <table style="width: 100%; border-collapse: collapse; font-size: 15px;">
                                <tr><td style="padding: 10px 0; color: #666;">${escapeHtml(t.apt)}</td><td style="padding: 10px 0; text-align: right; font-weight: bold; color: #2C3325;">${escapeHtml(newB.aptName)}</td></tr>
                                <tr><td style="padding: 10px 0; color: #666;">${escapeHtml(t.checkIn)}</td><td style="padding: 10px 0; text-align: right; font-weight: bold; color: #2C3325;">${escapeHtml(newB.checkIn)}</td></tr>
                                <tr><td style="padding: 10px 0; color: #666;">${escapeHtml(t.checkOut)}</td><td style="padding: 10px 0; text-align: right; font-weight: bold; color: #2C3325;">${escapeHtml(newB.checkOut)}</td></tr>
                                <tr><td style="padding: 10px 0; color: #666;">${escapeHtml(t.guests)}</td><td style="padding: 10px 0; text-align: right; font-weight: bold; color: #2C3325;">${escapeHtml(newB.guests)}</td></tr>
                                <tr><td style="padding: 12px 0; border-top: 1px dashed #ccc; color: #666;">${escapeHtml(t.paid)}</td><td style="padding: 12px 0; border-top: 1px dashed #ccc; text-align: right; font-weight: bold; color: #5c7a4d; font-size: 16px;">${formatMoney(newB.paidDeposit)} Ft</td></tr>
                                <tr><td style="padding: 10px 0; color: #666;">${escapeHtml(t.balance)}</td><td style="padding: 10px 0; text-align: right; font-weight: bold; color: #2C3325; font-size: 16px;">${formatMoney(balance)} Ft</td></tr>
                            </table>
                        </div>

                        <div style="background-color: #fcf8e3; border-left: 4px solid #e3c878; padding: 15px 20px; margin-bottom: 30px; border-radius: 0 6px 6px 0;">
                            <h4 style="margin-top: 0; margin-bottom: 8px; color: #8a6d3b; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">${escapeHtml(t.policyTitle)}</h4>
                            <p style="margin: 0; line-height: 1.5; font-size: 13px; color: #66512c;">${escapeHtml(t.policyText)}</p>
                        </div>
                        <div style="background-color: #f9fbf8; border: 1px solid #e2e8df; border-radius: 8px; padding: 25px; margin: 30px 0;">
                            <h3 style="margin-top: 0; color: #5c7a4d; border-bottom: 2px solid #e2e8df; padding-bottom: 10px; font-weight: 600;">
                                ${escapeHtml(extraT.title)}
                            </h3>

                            ${breakfastAvailable ? `
                            <div style="padding: 15px 0; border-bottom: 1px solid #e2e8df;">
                                <p style="margin: 0 0 6px 0; font-weight: bold; color: #2C3325;">
                                    ${escapeHtml(extraT.breakfastTitle)}
                                </p>
                                <p style="margin: 0 0 14px 0; color: #666666; font-size: 14px; line-height: 1.5;">
                                    ${escapeHtml(extraT.breakfastText)}
                                </p>
                                <a href="${breakfastUrl}" style="display: inline-block; background-color: #5c7a4d; color: #ffffff; text-decoration: none; padding: 10px 22px; border-radius: 20px; font-weight: 600; font-size: 13px;">
                                    ${escapeHtml(extraT.breakfastBtn)}
                                </a>
                            </div>
                        ` : ''}

                            <div style="padding: 15px 0 0 0;">
                                <p style="margin: 0 0 6px 0; font-weight: bold; color: #2C3325;">
                                    ${escapeHtml(extraT.sunTitle)}
                                </p>
                                <p style="margin: 0 0 14px 0; color: #666666; font-size: 14px; line-height: 1.5;">
                                    ${escapeHtml(extraT.sunText)}
                                </p>
                                <a href="${sunUrl}" style="display: inline-block; background-color: #5c7a4d; color: #ffffff; text-decoration: none; padding: 10px 22px; border-radius: 20px; font-weight: 600; font-size: 13px;">
                                    ${escapeHtml(extraT.sunBtn)}
                                </a>
                            </div>
                        </div>
                        <div style="text-align: center; margin-top: 40px;">
                            <a href="${cancelUrl}" style="display: inline-block; background-color: transparent; border: 1px solid #d9534f; color: #d9534f; text-decoration: none; padding: 10px 25px; border-radius: 20px; font-weight: 600; font-size: 13px;">${escapeHtml(t.cancelBtn)}</a>
                        </div>
                    </div>

                    <div style="background-color: #f4f7f2; padding: 25px; text-align: center; font-size: 12px; color: #888888; border-top: 1px solid #e0e0e0;">
                        <p style="margin: 0; font-weight: bold; color: #5c7a4d;">Balaton Essence - Luxury Apartments</p>
                        <p style="margin: 8px 0 0 0;">
                            <a href="mailto:info@balatonessence.com" style="color: #666; text-decoration: none;">info@balatonessence.com</a> |
                            <a href="https://balatonessence.com" style="color: #666; text-decoration: none;">balatonessence.com</a>
                        </p>
                    </div>
                </div>`
        });
    } catch (e) {
        console.error('Vendég foglalási email hiba:', e);
    }
}

function parseBreakfastOrderItems(itemsText = '') {
    const text = String(itemsText || '');

    const plate = text.split('|')[0]?.trim() || '';
    const datesMatch = text.match(/Napok:\s*([^|]+)/i);
    const deliveryMatch = text.match(/Kiszállítás:\s*([^|]+)/i);
    const qtyMatch = text.match(/Darab:\s*([^|]+)/i);
    const noteMatch = text.match(/Megjegyzés:\s*([^|]+)/i);

    return {
        plate,
        dates: datesMatch ? datesMatch[1].trim() : '',
        deliveryTime: deliveryMatch ? deliveryMatch[1].trim() : '',
        quantity: qtyMatch ? qtyMatch[1].trim() : '',
        note: noteMatch ? noteMatch[1].trim() : ''
    };
}

function formatBreakfastEmailDetails(data, t) {
    const parsed = parseBreakfastOrderItems(data.items);

    const labels = {
        hu: {
            plate: 'Tál:',
            dates: 'Nap:',
            delivery: 'Kiszállítás:',
            quantity: 'Darab:',
            apartment: 'Apartman:',
            note: 'Megjegyzés:'
        },
        en: {
            plate: 'Platter:',
            dates: 'Day:',
            delivery: 'Delivery:',
            quantity: 'Quantity:',
            apartment: 'Apartment:',
            note: 'Note:'
        },
        de: {
            plate: 'Platte:',
            dates: 'Tag:',
            delivery: 'Lieferzeit:',
            quantity: 'Anzahl:',
            apartment: 'Apartment:',
            note: 'Bemerkung:'
        }
    };

    const lang = normalizeLang(data.lang || 'hu');
    const l = labels[lang] || labels.hu;

    return `
        ${parsed.plate ? `
            <p style="margin: 10px 0; font-size: 15px;">
                <strong>${escapeHtml(l.plate)}</strong> ${escapeHtml(parsed.plate)}
            </p>
        ` : ''}

        ${parsed.dates ? `
            <p style="margin: 10px 0; font-size: 15px;">
                <strong>${escapeHtml(l.dates)}</strong> ${escapeHtml(parsed.dates)}
            </p>
        ` : ''}

        ${parsed.deliveryTime ? `
            <p style="margin: 10px 0; font-size: 15px;">
                <strong>${escapeHtml(l.delivery)}</strong> ${escapeHtml(parsed.deliveryTime)}
            </p>
        ` : ''}

        ${parsed.quantity ? `
            <p style="margin: 10px 0; font-size: 15px;">
                <strong>${escapeHtml(l.quantity)}</strong> ${escapeHtml(parsed.quantity)}
            </p>
        ` : ''}

        <p style="margin: 10px 0; font-size: 15px;">
            <strong>${escapeHtml(l.apartment)}</strong> ${escapeHtml(data.apartment || data.aptName || '')}
        </p>

        ${parsed.note ? `
            <p style="margin: 10px 0; font-size: 15px;">
                <strong>${escapeHtml(l.note)}</strong> ${escapeHtml(parsed.note)}
            </p>
        ` : ''}
    `;
}

function parseBreakfastOrderItems(itemsText = '') {
    const text = String(itemsText || '');

    const plate = text.split('|')[0]?.trim() || '';
    const datesMatch = text.match(/Napok:\s*([^|]+)/i);
    const deliveryMatch = text.match(/Kiszállítás:\s*([^|]+)/i);
    const qtyMatch = text.match(/Darab:\s*([^|]+)/i);
    const noteMatch = text.match(/Megjegyzés:\s*([^|]+)/i);

    return {
        plate,
        dates: datesMatch ? datesMatch[1].trim() : '',
        deliveryTime: deliveryMatch ? deliveryMatch[1].trim() : '',
        quantity: qtyMatch ? qtyMatch[1].trim() : '',
        note: noteMatch ? noteMatch[1].trim() : ''
    };
}

function formatBreakfastEmailDetails(data, lang) {
    const parsed = parseBreakfastOrderItems(data.items);

    const labels = {
        hu: {
            plate: 'Tál:',
            dates: 'Nap:',
            delivery: 'Kiszállítás:',
            quantity: 'Darab:',
            apartment: 'Apartman:',
            note: 'Megjegyzés:'
        },
        en: {
            plate: 'Platter:',
            dates: 'Day:',
            delivery: 'Delivery:',
            quantity: 'Quantity:',
            apartment: 'Apartment:',
            note: 'Note:'
        },
        de: {
            plate: 'Platte:',
            dates: 'Tag:',
            delivery: 'Lieferzeit:',
            quantity: 'Anzahl:',
            apartment: 'Apartment:',
            note: 'Bemerkung:'
        }
    };

    const l = labels[normalizeLang(lang || data.lang || 'hu')] || labels.hu;

    return `
        ${parsed.plate ? `
            <p style="margin: 10px 0; font-size: 15px;">
                <strong>${escapeHtml(l.plate)}</strong> ${escapeHtml(parsed.plate)}
            </p>
        ` : ''}

        ${parsed.dates ? `
            <p style="margin: 10px 0; font-size: 15px;">
                <strong>${escapeHtml(l.dates)}</strong> ${escapeHtml(parsed.dates)}
            </p>
        ` : `
            <p style="margin: 10px 0; font-size: 15px;">
                <strong>${escapeHtml(l.dates)}</strong> ${escapeHtml(data.start || '')}
            </p>
        `}

        ${(data.deliveryTime || parsed.deliveryTime) ? `
            <p style="margin: 10px 0; font-size: 15px;">
                <strong>${escapeHtml(l.delivery)}</strong> ${escapeHtml(data.deliveryTime || parsed.deliveryTime)}
            </p>
        ` : ''}

        ${parsed.quantity ? `
            <p style="margin: 10px 0; font-size: 15px;">
                <strong>${escapeHtml(l.quantity)}</strong> ${escapeHtml(parsed.quantity)}
            </p>
        ` : ''}

        <p style="margin: 10px 0; font-size: 15px;">
            <strong>${escapeHtml(l.apartment)}</strong> ${escapeHtml(data.apartment || data.aptName || '')}
        </p>

        ${parsed.note ? `
            <p style="margin: 10px 0; font-size: 15px;">
                <strong>${escapeHtml(l.note)}</strong> ${escapeHtml(parsed.note)}
            </p>
        ` : ''}
    `;
}

async function sendGuestOrderEmail(data, lang, method) {
    const safeLang = normalizeLang(lang || data.lang || 'hu');
    const t = getOrderTranslations(data, safeLang);

    try {
        await resend.emails.send({
            from: 'Balaton Essence <info@balatonessence.com>',
            to: data.email,
            subject: t.subj,
            html: `
                <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e3e0d8; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
                    <div style="background-color: #5c7a4d; padding: 40px 20px; text-align: center; color: white;">
                        <h1 style="margin: 0; font-size: 26px; font-weight: 400; letter-spacing: 1px;">${escapeHtml(t.title)}</h1>
                        <p style="margin: 10px 0 0; opacity: 0.9; font-size: 16px;">${escapeHtml(t.subtitle)}</p>
                    </div>

                    <div style="padding: 40px 30px; color: #2c3325; line-height: 1.6;">
                        <p style="font-size: 17px;">${escapeHtml(t.dear)} <strong>${escapeHtml(data.guestName)}</strong>!</p>
                        <p style="color: #555;">${escapeHtml(t.body)}</p>

                        <div style="background: #f9fbf8; border: 1px solid #e2e8df; padding: 25px; border-radius: 8px; margin: 30px 0;">
                            <h3 style="margin-top: 0; color: #5c7a4d; border-bottom: 1px solid #e2e8df; padding-bottom: 10px;">${escapeHtml(t.details)}</h3>

                            ${data.type === 'BREAKFAST' ? `
                                ${formatBreakfastEmailDetails(data, safeLang)}
                            ` : `
                                <p style="margin: 10px 0; font-size: 15px;">
                                    <strong>${escapeHtml(t.items)}</strong> ${escapeHtml(data.items)}
                                </p>

                                <p style="margin: 10px 0; font-size: 15px;">
                                    <strong>${escapeHtml(t.period)}</strong> ${escapeHtml(data.start)} — ${escapeHtml(data.end)} (${escapeHtml(data.days)} ${escapeHtml(t.days)})
                                </p>

                                <p style="margin: 10px 0; font-size: 15px;">
                                    <strong>${escapeHtml(t.pickup)}</strong> ${escapeHtml(data.apartment)}
                                </p>
                            `}

                            <hr style="border: none; border-top: 1px dashed #ccc; margin: 15px 0;">

                            <p style="margin: 5px 0; font-size: 20px; color: #5c7a4d;">
                                <strong>${escapeHtml(t.total)} ${formatMoney(data.amount)} Ft</strong>
                            </p>

                            <p style="margin: 0; font-size: 13px; color: #6a7063;">
                                ${escapeHtml(method === 'card' ? t.methodCard : t.methodCash)}
                            </p>
                        </div>

                        <p style="font-size: 14px; color: #888; font-style: italic;">${escapeHtml(t.footer)}</p>

                        <div style="margin-top: 40px; border-top: 1px solid #eee; padding-top: 20px; text-align: center;">
                            <p style="margin: 0; font-weight: bold; color: #5c7a4d;">Balaton Essence - Luxury Apartments</p>
                            <p style="margin: 5px 0; font-size: 12px; color: #aaa;">www.balatonessence.com</p>
                        </div>
                    </div>
                </div>`
        });
    } catch (err) {
        console.error('Vendég rendelési email hiba:', err);
    }
}

// -----------------------------------------------------------------------------
// API - DATABASE
// -----------------------------------------------------------------------------

app.get('/api/get-db-content', async (req, res) => {
    try {
        const db = await getDbContent();
        res.status(200).json(db);
    } catch (err) {
        console.error('Lekérdezési hiba:', err);
        res.status(500).json({ error: 'Hiba az adatok lekérésekor' });
    }
});

app.get('/api/apartment-availability', async (req, res) => {
    try {
        const checkIn = getBookingDateString(req.query.checkIn);
        const checkOut = getBookingDateString(req.query.checkOut);
        const checkInDate = parseDateOnly(checkIn);
        const checkOutDate = parseDateOnly(checkOut);

        if (!checkInDate || !checkOutDate || checkOutDate <= checkInDate) {
            return res.status(400).json({
                error: 'A távozás dátumának az érkezés után kell lennie.'
            });
        }

        const db = await getDbContent();
        const requestedStay = { checkIn, checkOut };

        const availableApartmentIds = (db.apartments || [])
            .filter(apartment => {
                const booking = {
                    ...requestedStay,
                    aptId: apartment.id
                };

                return (
                    getArrivalDepartureRestriction(apartment, booking).valid &&
                    !hasDisabledDateInBookingRange(apartment, booking) &&
                    !isBookingOverlapping(db.bookings, booking)
                );
            })
            .map(apartment => String(apartment.id));

        res.json({
            success: true,
            checkIn,
            checkOut,
            availableApartmentIds
        });
    } catch (err) {
        console.error('Apartman elérhetőség lekérdezési hiba:', err);
        res.status(500).json({
            error: 'Az apartmanok elérhetősége jelenleg nem ellenőrizhető.'
        });
    }
});

function sanitizeServiceItem(item) {
    return {
        id: String(item.id || '').trim(),
        name_hu: String(item.name_hu || '').trim(),
        name_en: String(item.name_en || '').trim(),
        name_de: String(item.name_de || '').trim(),
        price: Math.max(0, Math.round(Number(item.price || 0))),
        unit_hu: String(item.unit_hu || '').trim(),
        unit_en: String(item.unit_en || '').trim(),
        unit_de: String(item.unit_de || '').trim(),
        description_hu: String(item.description_hu || '').trim(),
        description_en: String(item.description_en || '').trim(),
        description_de: String(item.description_de || '').trim(),
        image: String(item.image || '').trim(),
        maxStock: Math.max(0, Math.round(Number(item.maxStock || 0))),
        active: item.active !== false
    };
}

app.get('/api/services', async (req, res) => {
    try {
        const db = await getDbContent();

        res.json({
            success: true,
            services: db.services || { sun: [], moments: [] }
        });
    } catch (err) {
        console.error('Services lekérési hiba:', err);
        res.status(500).json({ error: 'Hiba a szolgáltatások lekérésekor.' });
    }
});

app.post('/api/admin/services', requireAdmin, async (req, res) => {
    try {
        const incoming = req.body?.services || req.body;

        if (!incoming || typeof incoming !== 'object') {
            return res.status(400).json({ error: 'Hiányzó szolgáltatás adatok.' });
        }

        const sun = Array.isArray(incoming.sun)
            ? incoming.sun.map(sanitizeServiceItem).filter(item => item.id)
            : [];

        const moments = Array.isArray(incoming.moments)
            ? incoming.moments.map(sanitizeServiceItem).filter(item => item.id)
            : [];

        await updateDbContent(async db => {
            db.services = {
                sun,
                moments
            };

            return db;
        });

        res.json({
            success: true,
            services: {
                sun,
                moments
            }
        });
    } catch (err) {
        console.error('Services mentési hiba:', err);
        res.status(500).json({ error: 'Hiba a szolgáltatások mentésekor.' });
    }
});

app.post('/api/save', requireAdmin, async (req, res) => {
    try {
        await saveDbContent(req.body);
        res.status(200).json({ message: 'Sikeres mentés' });
    } catch (err) {
        console.error('Mentés hiba:', err);
        res.status(500).json({ error: 'Hiba az adatbázisba íráskor' });
    }
});

function getDateStringHu(date = new Date()) {
    return new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Europe/Budapest',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(date);
}

function getDateStringFromDate(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function getApartmentNightInfo(apt, date, guests = 2) {
    const dateStr = getDateStringFromDate(date);
    const guestCount = Number(guests || 2);

    const season = Array.isArray(apt.seasons)
        ? apt.seasons.find(s => dateStr >= s.start && dateStr <= s.end)
        : null;

    if (!season) {
        return {
            status: 'CLOSED',
            price: 0,
            minNights: 1,
            maxGuests: Number(apt.maxGuests || 2)
        };
    }

    let price = Number(season.price || apt.price || 0);

    if (guestCount === 3 && Number(season.price3 || 0) > 0) {
        price = Number(season.price3);
    }

    if (guestCount === 4 && Number(season.price4 || 0) > 0) {
        price = Number(season.price4);
    }

    if (guestCount === 5 && Number(season.price5 || 0) > 0) {
        price = Number(season.price5);
    }

    if (guestCount >= 6 && Number(season.price6 || 0) > 0) {
        price = Number(season.price6);
    }

    return {
        status: 'OPEN',
        price,
        minNights: Number(season.minNights || 1),
        maxGuests: Number(season.maxGuests || apt.maxGuests || 2)
    };
}

function getDiscountConfig(apt) {
    const discount = apt?.discount;

    if (!discount || discount.active !== true) {
        return null;
    }

    const amountPerNight = Number(discount.amountPerNight || 0);

    if (amountPerNight <= 0) {
        return null;
    }

    return {
        amountPerNight,

        bookingStart: discount.bookingStart || discount.start || '',
        bookingEnd: discount.bookingEnd || discount.end || '',

        stayStart: discount.stayStart || '',
        stayEnd: discount.stayEnd || ''
    };
}

function isDiscountActiveOnBookingDate(apt, bookingDateStr = getDateStringHu()) {
    const discount = getDiscountConfig(apt);

    if (!discount) {
        return false;
    }

    if (discount.bookingStart && bookingDateStr < discount.bookingStart) {
        return false;
    }

    if (discount.bookingEnd && bookingDateStr > discount.bookingEnd) {
        return false;
    }

    return true;
}

function isDiscountValidForStayNight(apt, nightDateStr) {
    const discount = getDiscountConfig(apt);

    if (!discount) {
        return false;
    }

    if (discount.stayStart && nightDateStr < discount.stayStart) {
        return false;
    }

    if (discount.stayEnd && nightDateStr > discount.stayEnd) {
        return false;
    }

    return true;
}

function calculateBookingTotalOnServer(apt, booking) {
    const start = parseDateOnly(booking.checkIn || booking.start);
    const end = parseDateOnly(booking.checkOut || booking.end);
    const guests = Number(booking.guests || 2);

    if (!start || !end || end <= start) {
        return {
            valid: false,
            error: 'Hibás dátumválasztás.'
        };
    }

    let total = 0;
    let originalTotal = 0;
    let discountTotal = 0;
    let nights = 0;
    let minNightsRequired = 1;

    const bookingDateStr = getDateStringHu();
    const discountIsActiveNow = isDiscountActiveOnBookingDate(apt, bookingDateStr);
    const discount = getDiscountConfig(apt);

    const current = new Date(start);

    while (current < end) {
        const nightDateStr = getDateStringFromDate(current);
        const info = getApartmentNightInfo(apt, current, guests);

        if (info.status !== 'OPEN') {
            return {
                valid: false,
                error: 'Az apartman zárva van a kiválasztott időszakban.'
            };
        }

        if (guests > Number(info.maxGuests || 2)) {
            return {
                valid: false,
                error: 'A vendégek száma meghaladja az apartman kapacitását.'
            };
        }

        const nightlyPrice = Number(info.price || 0);

        if (nightlyPrice <= 0) {
            return {
                valid: false,
                error: 'Az ár nem számolható a kiválasztott időszakra.'
            };
        }

        let nightlyDiscount = 0;

        if (
            discountIsActiveNow &&
            discount &&
            isDiscountValidForStayNight(apt, nightDateStr)
        ) {
            nightlyDiscount = discount.amountPerNight;
        }

        const finalNightPrice = Math.max(0, nightlyPrice - nightlyDiscount);

        originalTotal += nightlyPrice;
        discountTotal += nightlyPrice - finalNightPrice;
        total += finalNightPrice;

        minNightsRequired = Math.max(minNightsRequired, Number(info.minNights || 1));

        nights++;
        current.setDate(current.getDate() + 1);
    }

    if (nights < minNightsRequired) {
        return {
            valid: false,
            error: `Minimum ${minNightsRequired} éjszaka szükséges ebben az időszakban.`
        };
    }

    return {
        valid: true,
        total,
        originalTotal,
        discountTotal,
        nights,
        minNightsRequired,
        bookingDateStr
    };
}

app.post('/api/owner-dashboard', async (req, res) => {
    try {
        const code = String(req.body?.code || '').trim();

        if (!code) {
            return res.status(400).json({
                error: 'Hiányzó partnerkód.'
            });
        }

        const db = await getDbContent();

        const owner = (db.owners || []).find(o =>
            String(o.code || '').trim() === code
        );

        if (!owner) {
            return res.status(401).json({
                error: 'Hibás partnerkód.'
            });
        }

        const ownerId = String(owner.id || owner._id);

        const apartments = (db.apartments || []).filter(apt =>
            String(apt.ownerId) === ownerId
        );

        const apartmentIds = new Set(apartments.map(apt => String(apt.id)));
        const apartmentNames = new Set(
            apartments.map(apt => normalizeText(apt.name))
        );

        const isBlockedBooking = booking => {
            const guest = normalizeText(booking.guestName || '');
            const type = normalizeText(booking.type || '');
            const status = normalizeText(booking.status || '');

            return (
                guest === 'zarolt idoszak' ||
                type === 'blocked' ||
                type === 'manual-block' ||
                status === 'blocked'
            );
        };

        function belongsToOwnerApartment(item) {
            const itemAptId = String(item.aptId || item.apartmentId || item.bookingAptId || '');
            const itemAptName = normalizeText(
                item.aptName ||
                item.apartment ||
                item.apartmentName ||
                ''
            );

            return apartmentIds.has(itemAptId) || apartmentNames.has(itemAptName);
        }

        const bookings = (db.bookings || [])
            .filter(booking =>
                belongsToOwnerApartment(booking) &&
                !isBlockedBooking(booking)
            )
            .map(booking => {
                const sourceRaw = String(booking.source || '').toLowerCase();

                const source = sourceRaw ||
                    booking.importedFrom ||
                    (booking.icalId ? 'external' : 'web');

                const isExternal = !!booking.icalId || source !== 'web';

                return {
                    id: booking.id,
                    aptId: booking.aptId || '',
                    aptName: booking.aptName || booking.apartment || booking.apartmentName || '',
                    guestName: isExternal ? (booking.guestName || 'Külső foglalás') : booking.guestName,
                    checkIn: booking.checkIn || booking.start || '',
                    checkOut: booking.checkOut || booking.end || '',
                    source,
                    status: booking.status || 'confirmed',
                    totalPrice: isExternal ? 0 : Number(booking.totalPrice || booking.total || 0),
                    paidDeposit: isExternal ? 0 : Number(booking.paidDeposit || 0),
                    nights: Number(booking.nights || 0),
                    createdAt: booking.createdAt || booking.syncedAt || ''
                };
            });

        const breakfasts = (db.breakfasts || [])
            .filter(order => belongsToOwnerApartment(order))
            .map(order => ({
                id: order.id,
                aptId: order.aptId || order.apartmentId || order.bookingAptId || '',
                apartment: order.apartment || order.aptName || order.apartmentName || '',
                guestName: order.guestName || '',
                start: order.start || order.date || '',
                end: order.end || '',
                items: order.items || order.details || order.note || '',
                amount: Number(order.amount || order.totalPrice || 0),
                paymentStatus: order.paymentStatus || order.method || '',
                createdAt: order.createdAt || ''
            }));

        const extras = (db.extras || [])
            .filter(order => belongsToOwnerApartment(order))
            .map(order => ({
                id: order.id,
                aptId: order.aptId || order.apartmentId || order.bookingAptId || '',
                apartment: order.apartment || order.aptName || order.apartmentName || '',
                guestName: order.guestName || '',
                start: order.start || '',
                end: order.end || '',
                items: order.items || order.details || '',
                amount: Number(order.amount || order.totalPrice || 0),
                paymentStatus: order.paymentStatus || order.method || '',
                createdAt: order.createdAt || ''
            }));

        const safeApartments = apartments.map(apt => ({
            id: apt.id,
            name: apt.name || '',
            location: apt.location || '',
            address: apt.address || '',
            description: apt.description || '',
            coverImage: apt.coverImage || '',
            galleryImages: Array.isArray(apt.galleryImages) ? apt.galleryImages.slice(0, 6) : [],
            seasons: Array.isArray(apt.seasons) ? apt.seasons : [],
            disabledDates: Array.isArray(apt.disabledDates) ? apt.disabledDates : [],
            noCheckInDates: Array.isArray(apt.noCheckInDates) ? apt.noCheckInDates : [],
            noCheckOutDates: Array.isArray(apt.noCheckOutDates) ? apt.noCheckOutDates : []
        }));

        const webBookings = bookings.filter(booking =>
            String(booking.source || '').toLowerCase() === 'web'
        );

        const totalWebIncome = webBookings.reduce((sum, booking) => {
            return sum + Number(booking.totalPrice || 0);
        }, 0);

        res.json({
            success: true,
            owner: {
                id: owner.id || owner._id,
                name: owner.name || '',
                code: owner.code || ''
            },
            apartments: safeApartments,
            bookings,
            breakfasts,
            extras,
            summary: {
                apartmentCount: safeApartments.length,
                bookingCount: bookings.length,
                webBookingCount: webBookings.length,
                totalWebIncome,
                breakfastCount: breakfasts.length,
                extraCount: extras.length
            }
        });
    } catch (err) {
        console.error('Owner dashboard hiba:', err);

        res.status(500).json({
            error: 'Nem sikerült betölteni a tulajdonosi adatokat.'
        });
    }
});


// -----------------------------------------------------------------------------
// API - STRIPE PUBLIC CONFIG
// -----------------------------------------------------------------------------

app.get('/api/stripe-config', (req, res) => {
    res.json({
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || 'pk_test_51TNXrwDl2yIAVe6MOBaUkGKD4MrGaqmjIIoXoIBn0rv8k5bOvltbv54KG0I5b0CGUvtWSIbn0BrouzkqsgX0XZAn00DoG5W0l0'
    });
});

// -----------------------------------------------------------------------------
// API - STRIPE BOOKING CHECKOUT
// -----------------------------------------------------------------------------


app.post('/api/create-payment-intent-booking', async (req, res) => {
    try {
        const newB = req.body.booking || req.body;

        if (!newB || !newB.aptId || !newB.checkIn || !newB.checkOut || !newB.email || !newB.guestName) {
            return res.status(400).json({ error: 'Hiányos foglalási adatok.' });
        }

        const leadTimeValidation = validateMinimumBookingLeadTime(newB.checkIn);

        if (!leadTimeValidation.valid) {
            return res.status(400).json({ error: leadTimeValidation.error });
        }

        const db = await getDbContent();

        const apartment = (db.apartments || []).find(apt =>
            String(apt.id) === String(newB.aptId)
        );

        if (!apartment) {
            return res.status(400).json({ error: 'Az apartman nem található.' });
        }

        const arrivalDepartureValidation = getArrivalDepartureRestriction(apartment, newB);

        if (!arrivalDepartureValidation.valid) {
            return res.status(400).json({ error: arrivalDepartureValidation.error });
        }

        if (hasDisabledDateInBookingRange(apartment, newB)) {
            return res.status(400).json({
                error: 'A kiválasztott időszak letiltott napot tartalmaz.'
            });
        }

        if (isBookingOverlapping(db.bookings, newB)) {
            return res.status(400).json({ error: 'Sajnos ez az időpont már foglalt!' });
        }

        const priceCalculation = calculateBookingTotalOnServer(apartment, newB);

        if (!priceCalculation.valid) {
            return res.status(400).json({ error: priceCalculation.error });
        }

        const finalTotalPrice = Number(priceCalculation.total || 0);

        if (!Number.isFinite(finalTotalPrice) || finalTotalPrice <= 0) {
            return res.status(400).json({
                error: 'A foglalás összege nem számolható.'
            });
        }

        const depositAmount = Math.round(finalTotalPrice / 2);
        const lang = normalizeLang(newB.lang || 'hu');

        const safeBookingData = {
            ...newB,
            aptName: apartment.name || newB.aptName || 'Balaton Essence',
            totalPrice: finalTotalPrice,
            originalTotalPrice: priceCalculation.originalTotal,
            discountTotal: priceCalculation.discountTotal,
            nights: priceCalculation.nights,
            calculatedByServer: true,
            serverBookingDate: priceCalculation.bookingDateStr
        };

        const paymentIntent = await stripe.paymentIntents.create({
            amount: depositAmount * 100,
            currency: 'huf',
            automatic_payment_methods: { enabled: true },
            receipt_email: safeBookingData.email,
            description: `Előleg (50%): ${safeBookingData.aptName || 'Balaton Essence'}`,
            metadata: {
                kind: 'booking',
                lang,
                bookingData: JSON.stringify(safeBookingData)
            }
        });

        res.json({
            success: true,
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id,
            amount: depositAmount,
            lang
        });
    } catch (e) {
        console.error('Stripe PaymentIntent indítási hiba:', e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/create-checkout-session', async (req, res) => {
    try {
        const newB = req.body.booking || req.body;

        if (!newB || !newB.aptId || !newB.checkIn || !newB.checkOut || !newB.email || !newB.guestName) {
            return res.status(400).json({ error: 'Hiányos foglalási adatok.' });
        }

        const leadTimeValidation = validateMinimumBookingLeadTime(newB.checkIn);

        if (!leadTimeValidation.valid) {
            return res.status(400).json({ error: leadTimeValidation.error });
        }

        const db = await getDbContent();

        const apartment = (db.apartments || []).find(apt =>
            String(apt.id) === String(newB.aptId)
        );

        if (!apartment) {
            return res.status(400).json({ error: 'Az apartman nem található.' });
        }

        const arrivalDepartureValidation = getArrivalDepartureRestriction(apartment, newB);

        if (!arrivalDepartureValidation.valid) {
            return res.status(400).json({ error: arrivalDepartureValidation.error });
        }

        if (hasDisabledDateInBookingRange(apartment, newB)) {
            return res.status(400).json({
                error: 'A kiválasztott időszak letiltott napot tartalmaz.'
            });
        }

        if (isBookingOverlapping(db.bookings, newB)) {
            return res.status(400).json({ error: 'Sajnos ez az időpont már foglalt!' });
        }

        const priceCalculation = calculateBookingTotalOnServer(apartment, newB);

        if (!priceCalculation.valid) {
            return res.status(400).json({ error: priceCalculation.error });
        }

        const finalTotalPrice = Number(priceCalculation.total || 0);

        if (!Number.isFinite(finalTotalPrice) || finalTotalPrice <= 0) {
            return res.status(400).json({
                error: 'A foglalás összege nem számolható.'
            });
        }

        const depositAmount = Math.round(finalTotalPrice / 2);
        const lang = normalizeLang(newB.lang || 'hu');

        const safeBookingData = {
            ...newB,

            aptName: apartment.name || newB.aptName || 'Balaton Essence',
            totalPrice: finalTotalPrice,
            originalTotalPrice: priceCalculation.originalTotal,
            discountTotal: priceCalculation.discountTotal,
            nights: priceCalculation.nights,
            calculatedByServer: true,
            serverBookingDate: priceCalculation.bookingDateStr
        };

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'huf',
                    product_data: {
                        name: `Előleg (50%): ${safeBookingData.aptName || 'Balaton Essence'}`,
                        description: `${safeBookingData.checkIn} — ${safeBookingData.checkOut} (${safeBookingData.guests || '-'} fő)`
                    },
                    unit_amount: depositAmount * 100
                },
                quantity: 1
            }],
            mode: 'payment',
            metadata: {
                bookingData: JSON.stringify(safeBookingData)
            },
            success_url: `https://${req.get('host')}/success.html?session_id={CHECKOUT_SESSION_ID}&lang=${lang}`,
            cancel_url: `https://${req.get('host')}/${lang === 'hu' ? '' : `${lang}/`}apartman.html`,
            customer_email: safeBookingData.email
        });

        res.json({ id: session.id });
    } catch (e) {
        console.error('Stripe indítási hiba:', e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/finalize-booking', async (req, res) => {
    try {
        const { session_id, payment_intent } = req.query;

        let rawBooking = null;
        let stripeReferenceId = null;
        let paymentIntentId = null;
        let paidDeposit = 0;
        let paymentStatus = 'paid';

        if (payment_intent) {
            const paymentIntent = await stripe.paymentIntents.retrieve(payment_intent);

            if (!paymentIntent || paymentIntent.status !== 'succeeded') {
                return res.status(400).json({ error: 'A fizetés még nem sikeres.' });
            }

            if (!paymentIntent.metadata?.bookingData) {
                return res.status(400).json({ error: 'Hiányzó foglalási metadata.' });
            }

            rawBooking = JSON.parse(paymentIntent.metadata.bookingData);
            stripeReferenceId = paymentIntent.id;
            paymentIntentId = paymentIntent.id;
            paidDeposit = Number(paymentIntent.amount_received || paymentIntent.amount || 0) / 100;
            paymentStatus = 'paid';
        } else {
            if (!session_id) return res.status(400).json({ error: 'Hiányzó session_id vagy payment_intent.' });

            const session = await stripe.checkout.sessions.retrieve(session_id);

            if (session.payment_status !== 'paid') {
                return res.status(400).json({ error: 'A fizetés még nem sikeres.' });
            }

            if (!session.metadata?.bookingData) {
                return res.status(400).json({ error: 'Hiányzó foglalási metadata.' });
            }

            rawBooking = JSON.parse(session.metadata.bookingData);
            stripeReferenceId = session_id;
            paymentIntentId = session.payment_intent || null;
            paidDeposit = Number(session.amount_total || 0) / 100;
            paymentStatus = session.payment_status;
        }

        let savedBooking = null;
        let alreadySaved = false;

        await updateDbContent(async db => {
            const existing = db.bookings.find(b =>
                b.stripeId === stripeReferenceId ||
                (paymentIntentId && b.paymentIntentId === paymentIntentId)
            );

            if (existing) {
                savedBooking = existing;
                alreadySaved = true;
                return db;
            }

            if (isBookingOverlapping(db.bookings, rawBooking, stripeReferenceId)) {
                const err = new Error('Időközben ez az időpont foglalttá vált.');
                err.statusCode = 409;
                throw err;
            }

            const apartment = (db.apartments || []).find(apt =>
                String(apt.id) === String(rawBooking.aptId)
            );

            if (!apartment) {
                const err = new Error('Az apartman nem található.');
                err.statusCode = 400;
                throw err;
            }

            const arrivalDepartureValidation = getArrivalDepartureRestriction(apartment, rawBooking);

            if (!arrivalDepartureValidation.valid) {
                const err = new Error(arrivalDepartureValidation.error);
                err.statusCode = 400;
                throw err;
            }

            if (hasDisabledDateInBookingRange(apartment, rawBooking)) {
                const err = new Error('A kiválasztott időszak letiltott napot tartalmaz.');
                err.statusCode = 400;
                throw err;
            }

            const priceCalculation = calculateBookingTotalOnServer(apartment, rawBooking);

            if (!priceCalculation.valid) {
                const err = new Error(priceCalculation.error);
                err.statusCode = 400;
                throw err;
            }

            const expectedDeposit = Math.round(Number(priceCalculation.total || 0) / 2);

            if (Math.round(paidDeposit) !== expectedDeposit) {
                const err = new Error('A fizetett előleg nem egyezik a szerver által számolt összeggel.');
                err.statusCode = 400;
                throw err;
            }

            const newBooking = {
                ...rawBooking,
                id: generateId('ord'),
                stripeId: stripeReferenceId,
                paymentIntentId,

                aptName: apartment.name || rawBooking.aptName || 'Balaton Essence',
                totalPrice: Number(priceCalculation.total || 0),
                originalTotalPrice: Number(priceCalculation.originalTotal || 0),
                discountTotal: Number(priceCalculation.discountTotal || 0),
                nights: Number(priceCalculation.nights || 0),

                paidDeposit,
                paymentStatus,
                status: 'confirmed',
                lang: normalizeLang(rawBooking.lang || 'hu'),
                cancelToken: generateToken(),
                createdAt: new Date().toISOString()
            };

            db.bookings.push(newBooking);
            savedBooking = newBooking;

            return db;
        });

        if (!alreadySaved && savedBooking) {
            await sendAdminBookingEmail(savedBooking);
            await sendGuestBookingEmail(req, savedBooking);
        }

        res.json({ success: true, booking: savedBooking });
    } catch (e) {
        console.error('Véglegesítési hiba:', e);
        res.status(e.statusCode || 500).json({ error: e.message || 'Hiba' });
    }
});

// -----------------------------------------------------------------------------
// API - BOOKING CANCELLATION
// -----------------------------------------------------------------------------

app.get('/api/cancel-booking/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { token } = req.query;

        let booking = null;
        let refundAmount = 0;
        let refundPolicy = '';

        await updateDbContent(async db => {
            const bookingIndex = db.bookings.findIndex(item => String(item.id) === String(id));

            if (bookingIndex === -1) {
                const err = new Error('A foglalás már nem található vagy már törölték.');
                err.statusCode = 404;
                throw err;
            }

            booking = db.bookings[bookingIndex];

            if (booking.cancelToken && booking.cancelToken !== token) {
                const err = new Error('Érvénytelen lemondási link.');
                err.statusCode = 403;
                throw err;
            }

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const checkInDate = new Date(booking.checkIn);
            checkInDate.setHours(0, 0, 0, 0);

            const diffTime = checkInDate - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            const deposit = Number(booking.paidDeposit || 0);

            if (diffDays >= 14) {
                refundAmount = deposit;
                refundPolicy = '14 napon kívüli lemondás (100% előleg visszatérítés)';
            } else {
                refundAmount = 0;
                refundPolicy = '14 napon belüli lemondás (az előleg nem visszatéríthető)';
            }

            db.bookings.splice(bookingIndex, 1);
            return db;
        });

        if (booking?.stripeId && refundAmount > 0) {
            try {
                const session = await stripe.checkout.sessions.retrieve(booking.stripeId);

                if (session.payment_intent) {
                    await stripe.refunds.create({
                        payment_intent: session.payment_intent,
                        amount: Math.round(refundAmount * 100)
                    });
                    console.log(`Stripe refund sikeres: ${refundAmount} Ft`);
                }
            } catch (stripeErr) {
                console.error('Stripe refund hiba:', stripeErr);
            }
        }

        try {
            await resend.emails.send({
                from: 'Rendszer <info@balatonessence.com>',
                to: 'balatonessence@gmail.com',
                subject: refundAmount > 0
                    ? `❌ LEMONDÁS ÉS VISSZAUTALÁS: ${escapeHtml(booking.guestName)}`
                    : `❌ LEMONDÁS - NINCS VISSZATÉRÍTÉS: ${escapeHtml(booking.guestName)}`,
                html: `
                    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 2px solid #8b0000; border-radius: 10px; overflow: hidden;">
                        <div style="background-color: #8b0000; color: white; padding: 20px; text-align: center;">
                            <h2 style="margin: 0;">Foglalás lemondva</h2>
                        </div>
                        <div style="padding: 20px;">
                            <p>Az alábbi foglalást a vendég a weboldalon keresztül <strong>lemondta</strong>:</p>
                            <table style="width: 100%; border-collapse: collapse;">
                                <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Vendég:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(booking.guestName)}</td></tr>
                                <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Apartman:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(booking.aptName)}</td></tr>
                                <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Időpont:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(booking.checkIn)} — ${escapeHtml(booking.checkOut)}</td></tr>
                                <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color:#8b0000;"><strong>Szabály:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee; color:#8b0000;">${escapeHtml(refundPolicy)}</td></tr>
                                <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color:#8b0000;"><strong>Visszatérítés:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight:bold; color:#8b0000;">${formatMoney(refundAmount)} Ft</td></tr>
                            </table>
                        </div>
                    </div>`
            });
        } catch (mailErr) {
            console.error('Admin lemondási email hiba:', mailErr);
        }

        const lang = normalizeLang(booking.lang || 'hu');
        const guestTexts = {
            hu: {
                sub: 'Foglalás lemondása - Balaton Essence',
                title: 'A foglalását töröltük',
                msg: refundAmount > 0
                    ? `Sikeresen feldolgoztuk a lemondást. A szabályzat értelmében <b>${formatMoney(refundAmount)} Ft</b> összeget automatikusan visszautaltunk a bankkártyájára. Ez az összeg a bankjától függően 5-10 munkanapon belül jelenik meg a számláján.`
                    : `Sikeresen feldolgoztuk a lemondást. A lemondás az érkezést megelőző 14 napon belül történt, ezért a befizetett előleg nem visszatéríthető.`
            },
            en: {
                sub: 'Booking Cancelled - Balaton Essence',
                title: 'Your booking has been cancelled',
                msg: refundAmount > 0
    ? `We have processed your cancellation. According to our policy, <b>${formatMoney(refundAmount)} HUF</b> has been automatically refunded to your credit card. Please allow 5-10 business days for the funds to appear.`
    : `We have processed your cancellation. As the cancellation was made within 14 days before arrival, the paid deposit is non-refundable.`
            },
            de: {
                sub: 'Buchung storniert - Balaton Essence',
                title: 'Ihre Buchung wurde storniert',
                msg: refundAmount > 0
    ? `Ihre Stornierung wurde bearbeitet. Gemäß unseren Richtlinien wurden <b>${formatMoney(refundAmount)} HUF</b> automatisch auf Ihre Kreditkarte zurückerstattet. Es kann 5-10 Werktage dauern, bis der Betrag sichtbar ist.`
    : `Ihre Stornierung wurde bearbeitet. Da die Stornierung innerhalb von 14 Tagen vor der Anreise erfolgt ist, ist die geleistete Anzahlung nicht erstattungsfähig.`
            }
        };

        const t = guestTexts[lang] || guestTexts.hu;

        if (booking.email) {
            try {
                await resend.emails.send({
                    from: 'Balaton Essence <info@balatonessence.com>',
                    to: booking.email,
                    subject: t.sub,
                    html: `
                        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
                            <div style="background-color: #f8f9fa; padding: 20px; text-align: center; border-bottom: 3px solid #d9534f;">
                                <h2 style="color: #d9534f; margin: 0;">${escapeHtml(t.title)}</h2>
                            </div>
                            <div style="padding: 20px; color: #333;">
                                <p>${t.msg}</p>
                                <p><strong>${escapeHtml(booking.aptName)}</strong> (${escapeHtml(booking.checkIn)} — ${escapeHtml(booking.checkOut)})</p>
                            </div>
                        </div>`
                });
            } catch (guestErr) {
                console.error('Vendég lemondási email hiba:', guestErr);
            }
        }

        res.json({ success: true, message: 'A lemondás és a visszautalás sikeres.' });
    } catch (e) {
        console.error('Lemondási folyamat hiba:', e);
        res.status(e.statusCode || 500).json({ error: e.message || 'Szerverhiba a lemondáskor.' });
    }
});

app.get('/api/verify-booking/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { token } = req.query;

        const db = await getDbContent();

        const booking = (db.bookings || []).find(b =>
            String(b.id) === String(id)
        );

        if (!booking) {
            return res.status(404).json({
                valid: false,
                error: 'Foglalás nem található.'
            });
        }

        if (booking.cancelToken && token && booking.cancelToken !== token) {
            return res.status(403).json({
                valid: false,
                error: 'Érvénytelen foglalási token.'
            });
        }

        // Csak aktív, megerősített foglalást engedünk
        if (booking.status && booking.status !== 'confirmed') {
            return res.status(400).json({
                valid: false,
                error: 'A foglalás nem aktív.'
            });
        }

        const apartment = (db.apartments || []).find(a =>
            String(a.id) === String(booking.aptId)
        );

        const breakfastAvailable = isFonyodApartment(apartment);

        res.json({
            valid: true,
            id: booking.id,
            guestName: booking.guestName || '',
            email: booking.email || '',
            phone: booking.phone || '',
            aptId: booking.aptId || '',
            aptName: booking.aptName || '',
            checkIn: booking.checkIn || '',
            checkOut: booking.checkOut || '',
            lang: normalizeLang(booking.lang || 'hu'),
            breakfastAvailable
        });
    } catch (e) {
        console.error('Foglalás ellenőrzési hiba:', e);
        res.status(500).json({
            valid: false,
            error: 'Szerverhiba a foglalás ellenőrzésekor.'
        });
    }
});



// -----------------------------------------------------------------------------
// API - EXTRA / BREAKFAST ORDERS
// -----------------------------------------------------------------------------

function dateRangeInclusive(startValue, endValue) {
    const start = parseDateOnly(startValue);
    const end = parseDateOnly(endValue);

    if (!start || !end || end < start) return [];

    const dates = [];
    const current = new Date(start);

    while (current <= end) {
        dates.push(`${current.getFullYear()}-${pad2(current.getMonth() + 1)}-${pad2(current.getDate())}`);
        current.setDate(current.getDate() + 1);
    }

    return dates;
}

function getOrderDateSet(order) {
    return new Set(dateRangeInclusive(order.start, order.end));
}

function getExtraOrderQtyForService(order, service) {
    if (!order || order.type !== 'EXTRA') return 0;

    if (Array.isArray(order.itemsDetailed)) {
        const found = order.itemsDetailed.find(item =>
            String(item.id) === String(service.id)
        );

        return found ? Number(found.qty || 0) : 0;
    }

    const text = normalizeText(order.items || order.details || '');
    const serviceName = normalizeText(service.name_hu || service.name_en || service.name_de || service.id);

    const regex = new RegExp('(\\d+)\\s*x\\s*' + serviceName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const match = text.match(regex);

    if (match) {
        return Number(match[1] || 0);
    }

    return 0;
}

app.get('/api/sun-availability', async (req, res) => {
    try {
        const { start, end } = req.query;

        const dates = dateRangeInclusive(start, end);

        if (dates.length === 0) {
            return res.status(400).json({
                error: 'Hibás időszak.'
            });
        }

        const db = await getDbContent();
        const services = db.services?.sun || [];

        const availability = {};

        services.forEach(service => {
            const maxStock = Number(service.maxStock || 0);

            availability[service.id] = {
                id: service.id,
                name: service.name_hu || service.id,
                maxStock,
                booked: 0,
                available: maxStock
            };

            if (maxStock <= 0) {
                availability[service.id].available = null;
            }
        });

        dates.forEach(date => {
            services.forEach(service => {
                const maxStock = Number(service.maxStock || 0);

                if (maxStock <= 0) return;

                let bookedOnThisDate = 0;

                (db.extras || []).forEach(order => {
                    if (order.type !== 'EXTRA') return;
                    if (order.paymentStatus === 'cancelled') return;

                    const existingDates = getOrderDateSet(order);
                    if (!existingDates.has(date)) return;

                    bookedOnThisDate += getExtraOrderQtyForService(order, service);
                });

                const availableOnThisDate = Math.max(0, maxStock - bookedOnThisDate);

                availability[service.id].booked = Math.max(
                    availability[service.id].booked,
                    bookedOnThisDate
                );

                availability[service.id].available = Math.min(
                    availability[service.id].available,
                    availableOnThisDate
                );
            });
        });

        res.json({
            success: true,
            start,
            end,
            dates,
            availability
        });
    } catch (err) {
        console.error('SUN availability hiba:', err);
        res.status(500).json({
            error: 'Nem sikerült lekérni az elérhető készletet.'
        });
    }
});

app.post('/api/order', async (req, res) => {
    try {
        const data = req.body || {};
        const id = generateId('ord');
        const lang = normalizeLang(data.lang || 'hu');

        if (!data.email || !data.guestName || !data.type || !data.method) {
            return res.status(400).json({ error: 'Hiányos rendelési adatok.' });
        }

        if (!['BREAKFAST', 'EXTRA'].includes(data.type)) {
            return res.status(400).json({ error: 'Ismeretlen rendelési típus.' });
        }

        if (!['cash', 'card'].includes(data.method)) {
            return res.status(400).json({ error: 'Ismeretlen fizetési mód.' });
        }

        const amount = Number(data.amount || data.totalPrice || 0);

        if (!Number.isFinite(amount) || amount <= 0) {
            return res.status(400).json({ error: 'Hibás rendelési összeg.' });
        }

        const db = await getDbContent();
        if (!db.bookings) db.bookings = [];

        if (data.type === 'BREAKFAST') {
            const apt = findApartmentForOrder(db, data);

            if (!isFonyodApartment(apt)) {
                return res.status(400).json({
                    error: lang === 'hu'
                        ? 'Reggeli csak fonyódi apartmanokba rendelhető!'
                        : lang === 'de'
                            ? 'Frühstück ist nur für Apartments in Fonyód verfügbar!'
                            : 'Breakfast is only available for apartments in Fonyód!'
                });
            }

            const apartmentName = String(data.apartment || data.aptName || apt.name || '');
            const orderDate = new Date(data.start);

            const hasBooking = db.bookings.find(b => {
                const sameApt =
                    String(b.aptId || '') === String(apt.id || '') ||
                    String(b.aptName || b.apartment || '') === apartmentName;

                const sameEmail =
                    String(b.email || '').toLowerCase() === String(data.email || '').toLowerCase();

                const checkIn = new Date(b.checkIn || b.start);
                const checkOut = new Date(b.checkOut || b.end);

                return sameApt && sameEmail && orderDate >= checkIn && orderDate < checkOut;
            });

            if (!hasBooking) {
                return res.status(403).json({
                    error: lang === 'hu'
                        ? 'Sajnos nem találtunk érvényes szállásfoglalást erre az időszakra ezzel az e-mail címmel.'
                        : lang === 'de'
                            ? 'Leider konnten wir für diesen Zeitraum mit dieser E-Mail-Adresse keine gültige Unterkunftsbuchung finden.'
                            : "Sorry, we couldn't find a valid accommodation booking for this period with this email address."
                });
            }
        }

        const order = {
            id,
            ...data,
            amount,
            lang,
            paymentStatus: data.method === 'card' ? 'pending' : 'cash',
            createdAt: new Date().toISOString()
        };

        await updateDbContent(async currentDb => {
            if (!currentDb.breakfasts) currentDb.breakfasts = [];
            if (!currentDb.extras) currentDb.extras = [];

            if (order.type === 'BREAKFAST') {
                currentDb.breakfasts.push(order);
            } else {
                currentDb.extras.push(order);
            }

            return currentDb;
        });

        try {
            const paymentLabel = order.method === 'cash'
                ? 'KP'
                : 'KÁRTYA - FIZETÉSRE VÁR';

            await resend.emails.send({
                from: 'Rendszer <info@balatonessence.com>',
                to: 'balatonessence@gmail.com',
                subject: `${order.type === 'BREAKFAST' ? '🍳' : '☀️'} ÚJ RENDELÉS (${paymentLabel}): ${escapeHtml(order.guestName)}`,
                html: `
                    <h2>Új ${order.type === 'BREAKFAST' ? 'reggeli' : 'felszerelés'} rendelés</h2>
                    <p><strong>Státusz:</strong> ${order.method === 'cash' ? 'Helyszíni fizetés' : 'Online fizetésre vár'}</p>
                    <p><strong>Vendég:</strong> ${escapeHtml(data.guestName)} (${escapeHtml(data.email)})</p>
                    <p><strong>Telefon:</strong> ${escapeHtml(data.phone || data.tel || data.telefon || '-')}</p>
                    <p><strong>Apartman:</strong> ${escapeHtml(data.apartment || data.aptName || '')}</p>
                    <p><strong>Tételek:</strong> ${escapeHtml(data.items || data.details || '')}</p>
                    ${order.deliveryTime ? `<p><strong>Kiszállítási idő:</strong> ${escapeHtml(order.deliveryTime)}</p>` : ''}
                    <p><strong>Idő:</strong> ${escapeHtml(order.start || '')} — ${escapeHtml(order.end || '')} (${escapeHtml(order.days || '')} nap)</p>
                    <p><strong>Összeg:</strong> ${formatMoney(amount)} Ft</p>
                    <p><strong>Fizetés:</strong> ${order.method === 'cash' ? 'Helyszíni KP' : 'Online kártya'}</p>
                `
            });
        } catch (err) {
            console.error('Admin rendelési email hiba:', err);
        }

        if (order.method === 'cash') {
            await sendGuestOrderEmail(order, lang, 'cash');
            return res.json({ success: true, id, method: 'cash' });
        }

        const t = getOrderTranslations(order, lang);

        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(amount) * 100,
            currency: 'huf',
            automatic_payment_methods: { enabled: true },
            receipt_email: order.email,
            description: `${t.subj} | ${order.apartment || order.aptName || ''}`,
            metadata: {
                kind: 'order',
                orderId: id,
                type: order.type,
                lang
            }
        });

        await updateDbContent(async currentDb => {
            if (!currentDb.breakfasts) currentDb.breakfasts = [];
            if (!currentDb.extras) currentDb.extras = [];

            const list = order.type === 'BREAKFAST' ? currentDb.breakfasts : currentDb.extras;
            const idx = list.findIndex(item => String(item.id) === String(id));

            if (idx !== -1) {
                list[idx].stripePaymentIntentId = paymentIntent.id;
            }

            return currentDb;
        });

        return res.json({
            success: true,
            id,
            method: 'card',
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id,
            amount
        });
    } catch (e) {
        console.error('Rendelési hiba:', e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/finalize-extra', async (req, res) => {
    try {
        const { session_id, payment_intent } = req.query;

        let orderId = null;
        let type = null;
        let lang = 'hu';
        let stripeReferenceId = null;
        let paidAmount = 0;

        if (payment_intent) {
            const paymentIntent = await stripe.paymentIntents.retrieve(payment_intent);

            if (!paymentIntent || paymentIntent.status !== 'succeeded') {
                return res.status(400).json({ error: 'A fizetés még nem sikeres.' });
            }

            orderId = paymentIntent.metadata?.orderId;
            type = paymentIntent.metadata?.type;
            lang = normalizeLang(paymentIntent.metadata?.lang || 'hu');
            stripeReferenceId = paymentIntent.id;
            paidAmount = Number(paymentIntent.amount_received || paymentIntent.amount || 0) / 100;
        } else {
            if (!session_id) {
                return res.status(400).json({ error: 'Hiányzó session_id vagy payment_intent.' });
            }

            const session = await stripe.checkout.sessions.retrieve(session_id);

            if (!session || session.payment_status !== 'paid') {
                return res.status(400).json({ error: 'A fizetés még nem sikeres.' });
            }

            orderId = session.metadata?.orderId;
            type = session.metadata?.type;
            lang = normalizeLang(session.metadata?.lang || 'hu');
            stripeReferenceId = session_id;
            paidAmount = Number(session.amount_total || 0) / 100;
        }

        if (!orderId || !type) {
            return res.status(400).json({ error: 'Hiányzó rendelési metadata.' });
        }

        if (!['BREAKFAST', 'EXTRA'].includes(type)) {
            return res.status(400).json({ error: 'Ismeretlen rendelési típus.' });
        }

        let order = null;

        await updateDbContent(async db => {
            if (!db.breakfasts) db.breakfasts = [];
            if (!db.extras) db.extras = [];

            const list = type === 'BREAKFAST' ? db.breakfasts : db.extras;
            const idx = list.findIndex(item => String(item.id) === String(orderId));

            if (idx === -1) {
                const err = new Error('Rendelés nem található.');
                err.statusCode = 404;
                throw err;
            }

            if (list[idx].paymentStatus === 'paid' && (list[idx].stripeId === stripeReferenceId || list[idx].stripePaymentIntentId === stripeReferenceId)) {
                order = list[idx];
                return db;
            }

            list[idx] = {
                ...list[idx],
                paymentStatus: 'paid',
                stripeId: stripeReferenceId,
                stripePaymentIntentId: payment_intent ? stripeReferenceId : (list[idx].stripePaymentIntentId || ''),
                paidAmount,
                paidAt: new Date().toISOString(),
                lang
            };

            order = list[idx];
            return db;
        });

        if (order && !order.guestEmailSentAfterCardPayment) {
            try {
                if (typeof sendGuestOrderEmail === 'function') {
                    await sendGuestOrderEmail(order, normalizeLang(order.lang || lang), 'card');
                }

                await updateDbContent(async db => {
                    if (!db.breakfasts) db.breakfasts = [];
                    if (!db.extras) db.extras = [];

                    const list = order.type === 'BREAKFAST' ? db.breakfasts : db.extras;
                    const idx = list.findIndex(item => String(item.id) === String(order.id));

                    if (idx !== -1) {
                        list[idx].guestEmailSentAfterCardPayment = true;
                    }

                    return db;
                });
            } catch (mailErr) {
                console.error('Kártyás extra vendég email hiba:', mailErr);
            }
        }

        res.json({
            success: true,
            type: type === 'BREAKFAST' ? 'Reggeli rendelés' : 'Extra szolgáltatás',
            orderId,
            order
        });
    } catch (e) {
        console.error('Extra véglegesítési hiba:', e);
        res.status(e.statusCode || 500).json({ error: e.message || 'Szerverhiba.' });
    }
});

// -----------------------------------------------------------------------------
// API - ADMIN DELETE ROUTES
// -----------------------------------------------------------------------------

app.delete('/api/extras/:id', requireAdmin, async (req, res) => {
    try {
        await updateDbContent(async db => {
            db.extras = db.extras.filter(item => String(item.id) !== String(req.params.id));
            return db;
        });

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/breakfasts/:id', requireAdmin, async (req, res) => {
    try {
        let deleted = false;

        await updateDbContent(async db => {
            const before = db.breakfasts.length;
            db.breakfasts = db.breakfasts.filter(item => String(item.id) !== String(req.params.id));
            deleted = db.breakfasts.length < before;
            return db;
        });

        if (!deleted) {
            return res.status(404).json({ error: 'Rendelés nem található.' });
        }

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/bookings/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        let booking = null;

        await updateDbContent(async db => {
            booking = db.bookings.find(item => String(item.id) === String(id));

            if (!booking) {
                const err = new Error('Foglalás nem található.');
                err.statusCode = 404;
                throw err;
            }

            db.bookings = db.bookings.filter(item => String(item.id) !== String(id));
            return db;
        });

        const cancelTexts = {
            hu: {
                subj: 'Foglalás törlése - Balaton Essence',
                title: 'Foglalás törölve',
                body: `Sajnálattal értesítjük, hogy a(z) <strong>${escapeHtml(booking.checkIn)} - ${escapeHtml(booking.checkOut)}</strong> időszakra szóló foglalása törlésre került a rendszerünkből.`,
                contact: 'Amennyiben kérdése van, forduljon hozzánk bizalommal.'
            },
            en: {
                subj: 'Booking Cancellation - Balaton Essence',
                title: 'Booking Cancelled',
                body: `We regret to inform you that your booking for <strong>${escapeHtml(booking.checkIn)} - ${escapeHtml(booking.checkOut)}</strong> has been cancelled from our system.`,
                contact: 'If you have any questions, please feel free to contact us.'
            },
            de: {
                subj: 'Buchung storniert - Balaton Essence',
                title: 'Buchung storniert',
                body: `Wir bedauern, Ihnen mitteilen zu müssen, dass Ihre Buchung für den Zeitraum <strong>${escapeHtml(booking.checkIn)} - ${escapeHtml(booking.checkOut)}</strong> storniert wurde.`,
                contact: 'Wenn Sie Fragen haben, können Sie uns gerne kontaktieren.'
            }
        };

        const lang = normalizeLang(booking.lang || 'hu');
        const t = cancelTexts[lang] || cancelTexts.hu;

        if (booking.email) {
            try {
                await resend.emails.send({
                    from: 'Balaton Essence <info@balatonessence.com>',
                    to: booking.email,
                    subject: t.subj,
                    html: `
                        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
                            <div style="background-color: #8b0000; padding: 20px; text-align: center;">
                                <h1 style="color: #ffffff; margin: 0; font-size: 20px;">${escapeHtml(t.title)}</h1>
                            </div>
                            <div style="padding: 30px; line-height: 1.6; color: #333;">
                                <p>${t.body}</p>
                                <p>${escapeHtml(t.contact)}</p>
                                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                                <p style="font-size: 12px; color: #999;">Balaton Essence - Luxury Apartments</p>
                            </div>
                        </div>`
                });
            } catch (mailErr) {
                console.error('Admin törlési mail hiba:', mailErr);
            }
        }

        res.json({ success: true });
    } catch (e) {
        res.status(e.statusCode || 500).json({ error: e.message });
    }
});

// -----------------------------------------------------------------------------
// API - ICAL SYNC
// -----------------------------------------------------------------------------

function escapeIcalText(value) {
    return String(value ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\r?\n/g, '\\n');
}

function formatIcalDate(dateString) {
    const date = normalizeIcalDate(dateString);
    if (!date) return null;
    return date.replace(/-/g, '');
}

app.get('/api/ical/:aptId.ics', async (req, res) => {
    try {
        const { aptId } = req.params;
        const db = await getDbContent();

        const apartment = db.apartments.find(apt => String(apt.id) === String(aptId));

        if (!apartment) {
            return res.status(404).send('Apartment not found');
        }

        const ownBookings = (db.bookings || []).filter(booking => {
        const isSameApartment = String(booking.aptId || booking.apartmentId || '') === String(aptId);
        const status = String(booking.status || '').toLowerCase();

        const checkIn = booking.checkIn || booking.start;
        const checkOut = booking.checkOut || booking.end;

        if (!isSameApartment) return false;
        if (status === 'cancelled' || status === 'canceled') return false;
        if (!checkIn || !checkOut) return false;

        // Ezeket nem exportáljuk vissza, mert ezek külső naptárból jöttek be.
        // Különben Booking/Szállás.hu visszakapná a saját importált blokkjait.
        if (booking.icalId && booking.manualGuestData !== true) return false;
        if (booking.importedFrom && booking.manualGuestData !== true) return false;

        return true;
    });

        const nowStamp = new Date()
            .toISOString()
            .replace(/[-:]/g, '')
            .replace(/\.\d{3}Z$/, 'Z');

        const lines = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Balaton Essence//Booking Calendar//HU',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            `X-WR-CALNAME:${escapeIcalText(`Balaton Essence - ${apartment.name}`)}`
        ];

        ownBookings.forEach(booking => {
            const start = formatIcalDate(booking.checkIn);
            const end = formatIcalDate(booking.checkOut || booking.end);

            if (!start || !end) return;

            const uid = `${booking.id || booking.stripeId || start}-${aptId}@balatonessence.com`;

            lines.push(
                'BEGIN:VEVENT',
                `UID:${escapeIcalText(uid)}`,
                `DTSTAMP:${nowStamp}`,
                `DTSTART;VALUE=DATE:${start}`,
                `DTEND;VALUE=DATE:${end}`,
                `SUMMARY:${escapeIcalText('Reserved')}`,
                `DESCRIPTION:${escapeIcalText('Reserved via Balaton Essence website')}`,
                'TRANSP:OPAQUE',
                'STATUS:CONFIRMED',
                'END:VEVENT'
            );
        });

        const disabledDates = Array.isArray(apartment.disabledDates)
            ? apartment.disabledDates
            : [];

        disabledDates.forEach(dateStr => {
            const start = formatIcalDate(dateStr);

            if (!start) return;

            const endDate = new Date(`${dateStr}T00:00:00`);

            if (Number.isNaN(endDate.getTime())) return;

            endDate.setDate(endDate.getDate() + 1);

            const end = formatIcalDate(endDate.toISOString().slice(0, 10));

            if (!end) return;

            lines.push(
                'BEGIN:VEVENT',
                `UID:${escapeIcalText(`blocked-${aptId}-${start}@balatonessence.com`)}`,
                `DTSTAMP:${nowStamp}`,
                `DTSTART;VALUE=DATE:${start}`,
                `DTEND;VALUE=DATE:${end}`,
                `SUMMARY:${escapeIcalText('Blocked')}`,
                `DESCRIPTION:${escapeIcalText('Blocked manually in Balaton Essence admin')}`,
                'TRANSP:OPAQUE',
                'STATUS:CONFIRMED',
                'END:VEVENT'
            );
        });

        lines.push('END:VCALENDAR');

        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader('Content-Disposition', `inline; filename="balaton-essence-${aptId}.ics"`);
        res.send(lines.join('\r\n'));
    } catch (e) {
        console.error('iCal export hiba:', e);
        res.status(500).send('iCal export error');
    }
});

async function syncAllCalendars() {
    let hasChange = false;
    let finalCount = 0;

    await updateDbContent(async db => {
        for (const apt of db.apartments) {
            const sources = [
                { url: apt.icalBooking, name: 'booking' },
                { url: apt.icalSzallas, name: 'szallas' }
            ];

            for (const sourceDef of sources) {
                const url = sourceDef.url;
                if (!url || !String(url).startsWith('http')) continue;

                try {
                    const response = await axios.get(url, {
                        timeout: 10000,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Balaton Essence iCal Sync)',
                            'Accept': 'text/calendar,text/plain,*/*'
                        }
                    });

                    const parsed = ical.parseICS(response.data);
                    const incomingEvents = [];

                    for (const key in parsed) {
                        const event = parsed[key];
                        if (!event || event.type !== 'VEVENT') continue;

                        const start = normalizeIcalDate(event.start);
                        const end = normalizeIcalDate(event.end);

                        if (!start || !end) continue;

                        const rawSummary = String(event.summary || '').trim();
                        const rawSummaryLower = rawSummary.toLowerCase();

                        let bookingType = 'reservation';
                        let displayName = 'Külső foglalás';

                        if (
                            rawSummaryLower.includes('not available') ||
                            rawSummaryLower.includes('unavailable') ||
                            rawSummaryLower.includes('blocked')
                        ) {
                            bookingType = 'blocked';
                            displayName = 'Zárolt időszak';
                        } else if (
                            rawSummaryLower.includes('reserved') ||
                            rawSummaryLower.includes('reservation')
                        ) {
                            bookingType = 'reservation';
                            displayName = 'Külső foglalás';
                        } else if (rawSummary) {
                            displayName = rawSummary;
                        }

                        const stableExternalId = event.uid
                            ? `${apt.id}__${sourceDef.name}__${event.uid}`
                            : `${apt.id}__${sourceDef.name}__${start}__${end}__${rawSummary}`;

                        incomingEvents.push({
                            icalId: stableExternalId,
                            aptId: apt.id,
                            aptName: apt.name,
                            guestName: displayName,
                            type: bookingType,
                            rawSummary,
                            checkIn: start,
                            checkOut: end,
                            source: sourceDef.name,
                            status: 'confirmed',
                            importedFrom: sourceDef.name,
                            syncedAt: new Date().toISOString()
                        });
                    }

                    const incomingIds = new Set(incomingEvents.map(ev => ev.icalId));
                    const beforeCount = db.bookings.length;

                    db.bookings = db.bookings.filter(b => {
                        const isMatchingImportedBooking =
                            String(b.aptId) === String(apt.id) &&
                            b.source === sourceDef.name &&
                            !!b.icalId;

                        if (!isMatchingImportedBooking) return true;
                        return incomingIds.has(b.icalId);
                    });

                    if (db.bookings.length !== beforeCount) {
                        hasChange = true;
                    }

                    for (const incoming of incomingEvents) {
                        const existingIndex = db.bookings.findIndex(
                            b => b.icalId === incoming.icalId
                        );

                        if (existingIndex === -1) {
                            db.bookings.push({
                                id: generateId('ical'),
                                ...incoming,
                                firstSeenAt: new Date().toISOString()
                            });
                            hasChange = true;

                        } else {
                            const existing = db.bookings[existingIndex];

                            if (!existing.firstSeenAt) {
                                existing.firstSeenAt = existing.syncedAt || new Date().toISOString();
                                hasChange = true;
                            }

                            const changed =
                                existing.guestName !== incoming.guestName ||
                                existing.checkIn !== incoming.checkIn ||
                                existing.checkOut !== incoming.checkOut ||
                                existing.aptName !== incoming.aptName ||
                                existing.status !== incoming.status ||
                                existing.rawSummary !== incoming.rawSummary ||
                                existing.type !== incoming.type;

                            if (changed) {
                                db.bookings[existingIndex] = {
                                    ...existing,
                                    ...incoming,
                                    id: existing.id,

                                    // Ha adminból kézzel megadtuk a vendégadatokat,
                                    // az iCal szinkron ezeket ne írja felül.
                                    guestName: existing.manualGuestData === true
                                        ? existing.guestName
                                        : incoming.guestName,

                                    email: existing.manualGuestData === true
                                        ? existing.email
                                        : existing.email,

                                    phone: existing.manualGuestData === true
                                        ? existing.phone
                                        : existing.phone,

                                    lang: existing.manualGuestData === true
                                        ? existing.lang
                                        : existing.lang,

                                    manualGuestData: existing.manualGuestData === true
                                };

                                hasChange = true;
                            } else {
                                db.bookings[existingIndex].syncedAt = new Date().toISOString();
                            }
                        }
                    }
                } catch (err) {
                    console.error(`Sync hiba [${sourceDef.name}] ${apt.name}:`, err.message);
                }
            }
        }

        finalCount = db.bookings.length;
        return db;
    });

    return {
        success: true,
        changed: hasChange,
        bookingsCount: finalCount
    };
}

app.post('/api/sync', requireAdmin, async (req, res) => {
    try {
        calendarSyncInProgress = true;

        const result = await syncAllCalendars();
        lastCalendarSyncAt = new Date().toISOString();

        // Kézi szinkron után újraindítjuk a 30 perces automatikus ciklust
        scheduleNextAutomaticCalendarSync(AUTO_SYNC_INTERVAL_MS);

        res.json({
            ...result,
            lastSyncAt: lastCalendarSyncAt,
            nextSyncAt: nextAutomaticCalendarSyncAt
        });
    } catch (e) {
        console.error('Általános sync hiba:', e);
        res.status(500).json({ error: e.message });
    } finally {
        calendarSyncInProgress = false;
    }
});

app.get('/api/sync-status', requireAdmin, async (req, res) => {
    res.json({
        success: true,
        lastSyncAt: lastCalendarSyncAt,
        nextSyncAt: nextAutomaticCalendarSyncAt,
        inProgress: calendarSyncInProgress,
        intervalMinutes: AUTO_SYNC_INTERVAL_MS / 60000
    });
});

// -----------------------------------------------------------------------------
// API - BALATON WATER TEMP
// -----------------------------------------------------------------------------

app.get('/api/balaton-water-temp', async (req, res) => {
    try {
        const sources = [
            {
                name: 'balaton-vizhofok-fonyod',
                url: 'https://balaton-vizhofok.hu/fonyod/',
                parser: html => {
                    const clean = String(html)
                        .replace(/\s+/g, ' ')
                        .replace(/&nbsp;/g, ' ');

                    const patterns = [
                        /Fonyód vízhőmérséklet[^0-9]{0,80}(\d{1,2}(?:[,.]\d)?)\s*°C/i,
                        /vízhőmérséklet ma:[^0-9]{0,80}(\d{1,2}(?:[,.]\d)?)\s*°C/i,
                        /(\d{1,2}(?:[,.]\d)?)\s*°C/i
                    ];

                    for (const pattern of patterns) {
                        const match = clean.match(pattern);
                        if (!match) continue;

                        const num = Number(String(match[1]).replace(',', '.'));
                        if (!Number.isNaN(num) && num > 0 && num < 40) return num;
                    }

                    return null;
                }
            },
            {
                name: 'vizugy-fonyod',
                url: 'https://www.vizugy.hu/?AllomasVOA=164961A3-97AB-11D4-BB62-00508BA24287&mapData=OrasIdosor&mapModule=OpGrafikon',
                parser: html => {
                    const clean = String(html)
                        .replace(/\s+/g, ' ')
                        .replace(/&nbsp;/g, ' ');

                    const rowPattern = /(\d{4}\.\d{2}\.\d{2}\.\s+\d{2}:\d{2})\s+(-?\d+)\s+[-–]\s+(\d{1,2}(?:[,.]\d)?)/i;
                    const match = clean.match(rowPattern);

                    if (!match) return null;

                    const num = Number(String(match[3]).replace(',', '.'));
                    if (!Number.isNaN(num) && num > 0 && num < 40) return num;

                    return null;
                }
            },
            {
                name: 'idokep-balaton-fallback',
                url: 'https://www.idokep.hu/vizho',
                parser: html => {
                    const clean = String(html)
                        .replace(/\s+/g, ' ')
                        .replace(/&nbsp;/g, ' ');

                    const patterns = [
                        /Balaton \(Siófok\):\s*(\d{1,2}(?:[,.]\d)?)\s*°C/i,
                        /Balaton \(Gyenesdiás\):\s*(\d{1,2}(?:[,.]\d)?)\s*°C/i,
                        /Balaton \(Révfülöp\):\s*(\d{1,2}(?:[,.]\d)?)\s*°C/i
                    ];

                    for (const pattern of patterns) {
                        const match = clean.match(pattern);
                        if (!match) continue;

                        const num = Number(String(match[1]).replace(',', '.'));
                        if (!Number.isNaN(num) && num > 0 && num < 40) return num;
                    }

                    return null;
                }
            }
        ];

        for (const source of sources) {
            try {
                const response = await axios.get(source.url, {
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Balaton Essence Website)',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                    }
                });

                const value = source.parser(response.data);

                if (value !== null) {
                    return res.json({
                        temp: `${Math.round(value)}°C`,
                        value,
                        available: true,
                        location: 'Fonyód',
                        source: source.name
                    });
                }
            } catch (sourceErr) {
                console.warn(`Vízhőfok forrás hiba [${source.name}]:`, sourceErr.message);
            }
        }

        return res.json({
            temp: '—',
            value: null,
            available: false,
            location: 'Fonyód',
            source: null,
            error: 'Fonyódi vízhőfok adat jelenleg nem elérhető.'
        });
    } catch (e) {
        console.error('Vízhőfok hiba:', e.message);

        return res.json({
            temp: '—',
            value: null,
            available: false,
            location: 'Fonyód',
            source: null,
            error: 'Fonyódi vízhőfok adat jelenleg nem elérhető.'
        });
    }
});

// -----------------------------------------------------------------------------
// API - TODOS
// -----------------------------------------------------------------------------

app.get('/api/get-todos', requireAdmin, async (req, res) => {
    try {
        const db = await getDbContent();
        res.json(db.todos || []);
    } catch (e) {
        console.error('Hiba a feladatok lekérésekor:', e);
        res.status(500).json({ error: 'Szerver hiba' });
    }
});

app.post('/api/add-todo', requireAdmin, async (req, res) => {
    try {
        const createdBy = String(req.body.createdBy || '').trim();

        if (!['Kristóf', 'Balaton Essence'].includes(createdBy)) {
            return res.status(400).json({ error: 'Hibás profil.' });
        }

        const newTodo = {
            id: Date.now(),
            text: String(req.body.text || '').trim(),
            createdBy,
            createdAt: new Date().toISOString()
        };

        if (!newTodo.text) {
            return res.status(400).json({ error: 'Üres feladat nem menthető.' });
        }

        await updateDbContent(async db => {
            db.todos.push(newTodo);
            return db;
        });

        res.json(newTodo);
    } catch (e) {
        console.error('Hiba a feladat hozzáadásakor:', e);
        res.status(500).json({ error: 'Szerver hiba' });
    }
});

app.post('/api/delete-todo', requireAdmin, async (req, res) => {
    try {
        await updateDbContent(async db => {
            db.todos = db.todos.filter(todo => String(todo.id) !== String(req.body.id));
            return db;
        });

        res.json({ success: true });
    } catch (e) {
        console.error('Hiba a feladat törlésekor:', e);
        res.status(500).json({ error: 'Szerver hiba' });
    }
});

app.get('/api/todo-messages', requireAdmin, async (req, res) => {
    try {
        const db = await getDbContent();

        const messages = (db.todoMessages || [])
            .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));

        res.json(messages);
    } catch (e) {
        console.error('Todo chat lekérési hiba:', e);
        res.status(500).json({ error: 'Szerver hiba' });
    }
});

app.post('/api/add-todo-message', requireAdmin, async (req, res) => {
    try {
        const sender = String(req.body?.sender || '').trim();
        const text = String(req.body?.text || '').trim();

        if (!['Kristóf', 'Balaton Essence'].includes(sender)) {
            return res.status(400).json({ error: 'Hibás feladó.' });
        }

        if (!text) {
            return res.status(400).json({ error: 'Üres üzenet nem küldhető.' });
        }

        const message = {
            id: generateId('msg'),
            sender,
            text,
            createdAt: new Date().toISOString()
        };

        await updateDbContent(async db => {
            if (!Array.isArray(db.todoMessages)) db.todoMessages = [];
            db.todoMessages.push(message);
            return db;
        });

        res.json(message);
    } catch (e) {
        console.error('Todo chat mentési hiba:', e);
        res.status(500).json({ error: 'Szerver hiba' });
    }
});

app.post('/api/delete-todo-message', requireAdmin, async (req, res) => {
    try {
        const id = String(req.body?.id || '').trim();

        if (!id) {
            return res.status(400).json({ error: 'Hiányzó üzenetazonosító.' });
        }

        await updateDbContent(async db => {
            db.todoMessages = (db.todoMessages || []).filter(
                message => String(message.id) !== id
            );

            return db;
        });

        res.json({ success: true });
    } catch (e) {
        console.error('Todo chat törlési hiba:', e);
        res.status(500).json({ error: 'Szerver hiba' });
    }
});


// -----------------------------------------------------------------------------
// API - RECOMMENDATIONS
// -----------------------------------------------------------------------------

app.get('/api/recommendations', async (req, res) => {
    try {
        const db = await getDbContent();

        const recommendations = (db.recommendations || [])
            .filter(item => item.active !== false)
            .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));

        res.json(recommendations);
    } catch (err) {
        console.error('Ajánlások lekérési hiba:', err);
        res.status(500).json({ error: 'Nem sikerült lekérni az ajánlásokat.' });
    }
});

app.get('/api/admin/recommendations', requireAdmin, async (req, res) => {
    try {
        const db = await getDbContent();

        const recommendations = (db.recommendations || [])
            .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));

        res.json(recommendations);
    } catch (err) {
        console.error('Admin ajánlások lekérési hiba:', err);
        res.status(500).json({ error: 'Nem sikerült lekérni az ajánlásokat.' });
    }
});

app.post('/api/save-recommendation', requireAdmin, async (req, res) => {
    try {
        const data = req.body || {};
        let savedRecommendation = null;

        await updateDbContent(async db => {
            if (!Array.isArray(db.recommendations)) db.recommendations = [];

            const existing = data.id
                ? db.recommendations.find(item => String(item.id) === String(data.id))
                : null;

            const recommendation = {
                ...(existing || {}),
                id: data.id || generateId('rec'),
                title: String(data.title || '').trim(),
                category_hu: String(data.category_hu || data.category || '').trim(),
                category_en: String(data.category_en || '').trim(),
                category_de: String(data.category_de || '').trim(),
                location: String(data.location || '').trim(),
                description_hu: String(data.description_hu || '').trim(),
                description_en: String(data.description_en || '').trim(),
                description_de: String(data.description_de || '').trim(),
                image: String(data.image || '').trim(),
                mapsUrl: String(data.mapsUrl || '').trim(),
                websiteUrl: String(data.websiteUrl || '').trim(),
                active: data.active !== false,
                order: Number(data.order || existing?.order || db.recommendations.length),
                createdAt: existing?.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            if (!recommendation.title) {
                const err = new Error('Az ajánlás neve kötelező.');
                err.statusCode = 400;
                throw err;
            }

            const index = db.recommendations.findIndex(item =>
                String(item.id) === String(recommendation.id)
            );

            if (index === -1) {
                db.recommendations.push(recommendation);
            } else {
                db.recommendations[index] = recommendation;
            }

            savedRecommendation = recommendation;
            return db;
        });

        res.json({
            success: true,
            recommendation: savedRecommendation
        });
    } catch (err) {
        console.error('Ajánlás mentési hiba:', err);
        res.status(err.statusCode || 500).json({
            error: err.message || 'Nem sikerült menteni az ajánlást.'
        });
    }
});

app.delete('/api/recommendations/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        await updateDbContent(async db => {
            db.recommendations = (db.recommendations || []).filter(item =>
                String(item.id) !== String(id)
            );

            return db;
        });

        res.json({ success: true });
    } catch (err) {
        console.error('Ajánlás törlési hiba:', err);
        res.status(500).json({ error: 'Nem sikerült törölni az ajánlást.' });
    }
});

// -----------------------------------------------------------------------------
// API - REVIEWS
// -----------------------------------------------------------------------------

app.get('/api/reviews', async (req, res) => {
    try {
        const db = await getDbContent();

        const visibleReviews = (db.reviews || [])
            .filter(r => r.isVisible !== false)
            .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

        res.json(visibleReviews);
    } catch (e) {
        console.error('Review lekérési hiba:', e);
        res.status(500).json({ error: 'Szerver hiba' });
    }
});

app.get('/api/admin/reviews', requireAdmin, async (req, res) => {
    try {
        const db = await getDbContent();

        const reviews = (db.reviews || [])
            .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

        res.json(reviews);
    } catch (e) {
        console.error('Admin review lekérési hiba:', e);
        res.status(500).json({ error: 'Szerver hiba' });
    }
});

app.post('/api/save-review', requireAdmin, async (req, res) => {
    try {
        const data = req.body;
        let savedReview = null;

        await updateDbContent(async db => {
            const existing = db.reviews.find(r => String(r.id) === String(data.id));

            const review = {
                id: data.id || generateId('rev'),
                name: String(data.name || ''),
                rating: Math.min(5, Math.max(1, Number(data.rating || 5))),
                text_hu: String(data.text_hu || ''),
                text_en: String(data.text_en || ''),
                text_de: String(data.text_de || ''),
                isVisible: data.isVisible !== false,
                createdAt: existing?.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            const existingIndex = db.reviews.findIndex(r => String(r.id) === String(review.id));

            if (existingIndex === -1) {
                db.reviews.push(review);
            } else {
                db.reviews[existingIndex] = review;
            }

            savedReview = review;
            return db;
        });

        res.json({ success: true, review: savedReview });
    } catch (e) {
        console.error('Review mentési hiba:', e);
        res.status(500).json({ error: 'Szerver hiba' });
    }
});

app.delete('/api/reviews/:id', requireAdmin, async (req, res) => {
    try {
        await updateDbContent(async db => {
            db.reviews = db.reviews.filter(r => String(r.id) !== String(req.params.id));
            return db;
        });

        res.json({ success: true });
    } catch (e) {
        console.error('Review törlési hiba:', e);
        res.status(500).json({ error: 'Szerver hiba' });
    }
});

app.post('/api/public-review', async (req, res) => {
    try {
        const data = req.body || {};

        const lang = normalizeLang(data.lang || 'hu');
        const name = String(data.name || '').trim();
        const text = String(data.text || '').trim();
        const rating = Math.min(5, Math.max(1, Number(data.rating || 5)));
        const bookingId = String(data.bookingId || '').trim();

        if (!name || !text) {
            return res.status(400).json({ error: 'Hiányzó értékelési adatok.' });
        }

        const review = {
            id: generateId('rev'),
            name,
            rating,
            text_hu: lang === 'hu' ? text : '',
            text_en: lang === 'en' ? text : '',
            text_de: lang === 'de' ? text : '',
            isVisible: false,
            status: 'pending',
            source: 'guest',
            bookingId,
            createdAt: new Date().toISOString()
        };

        await updateDbContent(async db => {
            if (!Array.isArray(db.reviews)) db.reviews = [];
            db.reviews.unshift(review);
            return db;
        });

        res.json({
            success: true,
            review
        });
    } catch (err) {
        console.error('Publikus értékelés mentési hiba:', err);
        res.status(500).json({ error: 'Nem sikerült menteni az értékelést.' });
    }
});

// -----------------------------------------------------------------------------
// STATIC ROUTES
// -----------------------------------------------------------------------------

app.get('/health', (req, res) => res.status(200).send('OK'));

app.get('/apartman', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'apartman.html'));
});

app.get('/partner', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'tulaj.html'));
});

app.get('/en/apartman', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'en', 'apartman.html'));
});

app.get('/de/apartman', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'de', 'apartman.html'));
});

app.get('/en', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'en', 'index.html'));
});

app.get('/de', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'de', 'index.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint nem található.' });
    }

    if (req.path.startsWith('/en/')) {
        return res.sendFile(path.join(__dirname, 'public', 'en', 'index.html'));
    }

    if (req.path.startsWith('/de/')) {
        return res.sendFile(path.join(__dirname, 'public', 'de', 'index.html'));
    }

    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

function getBudapestTimeParts() {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Budapest',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).formatToParts(new Date());

    const map = {};

    parts.forEach(part => {
        map[part.type] = part.value;
    });

    return {
        date: `${map.year}-${map.month}-${map.day}`,
        hour: Number(map.hour),
        minute: Number(map.minute)
    };
}

function startScheduledGuestEmails() {
    let lastRunDate = null;

    const checkAndRun = () => {
        const now = getBudapestTimeParts();

        if (now.hour === 8 && now.minute === 0 && lastRunDate !== now.date) {
            lastRunDate = now.date;

            processScheduledGuestEmails().catch(err => {
                console.error('Scheduled guest email fatal error:', err);
            });
        }
    };

    // Percenként ellenőrzi, hogy eljött-e a reggel 8:00.
    setInterval(checkAndRun, 60 * 1000);

    // Indulás után is ellenőriz egyszer, ha pont 8:00-kor indult újra a szerver.
    setTimeout(checkAndRun, 10 * 1000);
}

startScheduledGuestEmails();

const AUTO_SYNC_INTERVAL_MS = 30 * 60 * 1000;

let lastCalendarSyncAt = null;
let nextAutomaticCalendarSyncAt = null;
let automaticCalendarSyncTimer = null;
let calendarSyncInProgress = false;

async function runAutomaticCalendarSync() {
    calendarSyncInProgress = true;

    try {
        const result = await syncAllCalendars();
        lastCalendarSyncAt = new Date().toISOString();

        console.log(
            `Automatikus iCal sync lefutott | változás: ${result.changed ? 'igen' : 'nem'} | foglalások: ${result.bookingsCount}`
        );
    } catch (err) {
        console.error('Automatikus iCal sync hiba:', err);
    } finally {
        calendarSyncInProgress = false;
    }
}

function scheduleNextAutomaticCalendarSync(delayMs = AUTO_SYNC_INTERVAL_MS) {
    if (automaticCalendarSyncTimer) {
        clearTimeout(automaticCalendarSyncTimer);
    }

    nextAutomaticCalendarSyncAt = new Date(Date.now() + delayMs).toISOString();

    automaticCalendarSyncTimer = setTimeout(async () => {
        await runAutomaticCalendarSync();
        scheduleNextAutomaticCalendarSync(AUTO_SYNC_INTERVAL_MS);
    }, delayMs);
}

function startAutomaticCalendarSync() {
    scheduleNextAutomaticCalendarSync(60 * 1000); // első sync szerverindulás után 1 perccel
}

startAutomaticCalendarSync();


// -----------------------------------------------------------------------------
// START
// -----------------------------------------------------------------------------

const PORT = process.env.PORT || 8080;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`ESSENCE SZERVER ELINDULT | Port: ${PORT}`);
});
