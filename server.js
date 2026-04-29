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

function isBookingOverlapping(bookings, newBooking, ignoreStripeId = null, ignoreBookingId = null) {
    return (bookings || []).some(oldB => {
        if (String(oldB.aptId) !== String(newBooking.aptId)) return false;
        if (ignoreStripeId && oldB.stripeId === ignoreStripeId) return false;
        if (ignoreBookingId && String(oldB.id) === String(ignoreBookingId)) return false;

        const start1 = new Date(newBooking.checkIn);
        const end1 = new Date(newBooking.checkOut);
        const start2 = new Date(oldB.checkIn);
        const end2 = new Date(oldB.checkOut || oldB.end);

        if (isNaN(start1) || isNaN(end1) || isNaN(start2) || isNaN(end2)) return false;

        return start1 < end2 && end1 > start2;
    });
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
    if (!Array.isArray(db.todos)) db.todos = [];
    if (!Array.isArray(db.pendingBookings)) db.pendingBookings = [];

    if (!db.services || typeof db.services !== 'object') db.services = {};

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
        policyText: 'Érkezés előtt 14 nappal a foglalás ingyenesen lemondható, a befizetett előleg 100%-ban visszajár. 14 napon belüli lemondás esetén a befizetett előleg 50%-a jár vissza.',
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
        policyText: 'Cancellations made 14 days or more before arrival are fully refundable. If canceled within 14 days of arrival, 50% of the paid deposit is refunded.',
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
        policyText: 'Bis 14 Tage vor Anreise können Sie kostenlos stornieren (100% Erstattung der Anzahlung). Bei einer Stornierung innerhalb von 14 Tagen vor Anreise werden 50% der geleisteten Anzahlung erstattet.',
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
                ? 'Reggeli rendelését rögzítettük. A reggelit minden nap 08:30-ig szállítjuk az apartman ajtajához.'
                : 'Sikeresen rögzítettük strandfelszerelés foglalását. Az eszközöket a megadott időpontban veheti át.',
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
                ? 'Your breakfast order has been recorded. Breakfast is delivered to your apartment door by 08:30 each morning.'
                : 'Your beach equipment booking has been successfully recorded. You can pick up the items at the specified time.',
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
                ? 'Ihre Frühstücksbestellung wurde registriert. Das Frühstück wird jeden Morgen bis 08:30 Uhr an Ihre Zimmertür geliefert.'
                : 'Ihre Buchung der Strandausrüstung wurde erfolgreich registriert. Sie können die Ausrüstung zum angegebenen Zeitpunkt abholen.',
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

async function sendGuestOrderEmail(data, lang, method) {
    const t = getOrderTranslations(data, lang);

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
                            <p style="margin: 10px 0; font-size: 15px;"><strong>${escapeHtml(t.items)}</strong> ${escapeHtml(data.items)}</p>
                            <p style="margin: 10px 0; font-size: 15px;"><strong>${escapeHtml(t.period)}</strong> ${escapeHtml(data.start)} — ${escapeHtml(data.end)} (${escapeHtml(data.days)} ${escapeHtml(t.days)})</p>
                            <p style="margin: 10px 0; font-size: 15px;"><strong>${escapeHtml(t.pickup)}</strong> ${escapeHtml(data.apartment)}</p>
                            <hr style="border: none; border-top: 1px dashed #ccc; margin: 15px 0;">
                            <p style="margin: 5px 0; font-size: 20px; color: #5c7a4d;"><strong>${escapeHtml(t.total)} ${formatMoney(data.amount)} Ft</strong></p>
                            <p style="margin: 0; font-size: 13px; color: #6a7063;">${escapeHtml(method === 'card' ? t.methodCard : t.methodCash)}</p>
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
        active: item.active !== false
    };
}

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
// -----------------------------------------------------------------------------
// API - STRIPE BOOKING CHECKOUT
// -----------------------------------------------------------------------------

app.post('/api/create-checkout-session', async (req, res) => {
    try {
        const newB = req.body.booking || req.body;

        if (!newB || !newB.aptId || !newB.checkIn || !newB.checkOut || !newB.email || !newB.totalPrice) {
            return res.status(400).json({ error: 'Hiányos foglalási adatok.' });
        }

        const db = await getDbContent();

        if (isBookingOverlapping(db.bookings, newB)) {
            return res.status(400).json({ error: 'Sajnos ez az időpont már foglalt!' });
        }

        const depositAmount = Math.round(Number(newB.totalPrice) / 2);
        const lang = normalizeLang(newB.lang || 'hu');

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'huf',
                    product_data: {
                        name: `Előleg (50%): ${newB.aptName || 'Balaton Essence'}`,
                        description: `${newB.checkIn} — ${newB.checkOut} (${newB.guests || '-'} fő)`
                    },
                    unit_amount: depositAmount * 100
                },
                quantity: 1
            }],
            mode: 'payment',
            metadata: {
                bookingData: JSON.stringify(newB)
            },
            success_url: `https://${req.get('host')}/success.html?session_id={CHECKOUT_SESSION_ID}&lang=${lang}`,
            cancel_url: `https://${req.get('host')}/${lang === 'hu' ? '' : `${lang}/`}apartman.html`,
            customer_email: newB.email
        });

        res.json({ id: session.id });
    } catch (e) {
        console.error('Stripe indítási hiba:', e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/finalize-booking', async (req, res) => {
    try {
        const { session_id } = req.query;
        if (!session_id) return res.status(400).json({ error: 'Hiányzó session_id.' });

        const session = await stripe.checkout.sessions.retrieve(session_id);

        if (session.payment_status !== 'paid') {
            return res.status(400).json({ error: 'A fizetés még nem sikeres.' });
        }

        if (!session.metadata?.bookingData) {
            return res.status(400).json({ error: 'Hiányzó foglalási metadata.' });
        }

        const rawBooking = JSON.parse(session.metadata.bookingData);

        let savedBooking = null;
        let alreadySaved = false;

        await updateDbContent(async db => {
            const existing = db.bookings.find(b => b.stripeId === session_id);

            if (existing) {
                savedBooking = existing;
                alreadySaved = true;
                return db;
            }

            if (isBookingOverlapping(db.bookings, rawBooking, session_id)) {
                const err = new Error('Időközben ez az időpont foglalttá vált.');
                err.statusCode = 409;
                throw err;
            }

            const newBooking = {
                ...rawBooking,
                id: generateId('ord'),
                stripeId: session_id,
                paymentIntentId: session.payment_intent || null,
                paidDeposit: Number(session.amount_total || 0) / 100,
                paymentStatus: session.payment_status,
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
                refundAmount = deposit / 2;
                refundPolicy = '14 napon belüli lemondás (50% előleg visszatérítés)';
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
                subject: `❌ LEMONDÁS ÉS VISSZAUTALÁS: ${escapeHtml(booking.guestName)}`,
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
                                <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color:#8b0000;"><strong>Visszautalva:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight:bold; color:#8b0000;">${formatMoney(refundAmount)} Ft</td></tr>
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
                msg: `Sikeresen feldolgoztuk a lemondást. A szabályzat értelmében <b>${formatMoney(refundAmount)} Ft</b> összeget automatikusan visszautaltunk a bankkártyájára. Ez az összeg a bankjától függően 5-10 munkanapon belül jelenik meg a számláján.`
            },
            en: {
                sub: 'Booking Cancelled - Balaton Essence',
                title: 'Your booking has been cancelled',
                msg: `We have processed your cancellation. According to our policy, <b>${formatMoney(refundAmount)} HUF</b> has been automatically refunded to your credit card. Please allow 5-10 business days for the funds to appear.`
            },
            de: {
                sub: 'Buchung storniert - Balaton Essence',
                title: 'Ihre Buchung wurde storniert',
                msg: `Ihre Stornierung wurde bearbeitet. Gemäß unseren Richtlinien wurden <b>${formatMoney(refundAmount)} HUF</b> automatisch auf Ihre Kreditkarte zurückerstattet. Es kann 5-10 Werktage dauern, bis der Betrag sichtbar ist.`
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
            lang: normalizeLang(booking.lang || 'hu')
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

app.post('/api/order', async (req, res) => {
    try {
        const data = req.body;
        const id = generateId('ord');
        const lang = normalizeLang(data.lang || 'hu');

        if (!data || !data.email || !data.guestName || !data.type || !data.method) {
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
            const apartmentName = String(data.apartment || '');
            const isFonyod = apartmentName.toUpperCase().includes('FONYÓD');

            if (!isFonyod || apartmentName === 'KÜLSŐS' || apartmentName === 'EXTERNAL') {
                return res.status(400).json({
                    error: lang === 'hu'
                        ? 'Reggeli csak fonyódi apartmanokba rendelhető!'
                        : lang === 'de'
                            ? 'Frühstück ist nur für Apartments in Fonyód verfügbar!'
                            : 'Breakfast is only available for apartments in Fonyód!'
                });
            }

            const hasBooking = db.bookings.find(b =>
                String(b.aptName || '') === apartmentName &&
                String(b.email || '').toLowerCase() === String(data.email || '').toLowerCase() &&
                new Date(data.start) >= new Date(b.checkIn) &&
                new Date(data.start) < new Date(b.checkOut)
            );

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
                    <p><strong>Apartman:</strong> ${escapeHtml(data.apartment)}</p>
                    <p><strong>Tételek:</strong> ${escapeHtml(data.items)}</p>
                    <p><strong>Idő:</strong> ${escapeHtml(order.start)} — ${escapeHtml(order.end)} (${escapeHtml(order.days)} nap)</p>
                    <p><strong>Összeg:</strong> ${formatMoney(amount)} Ft</p>
                    <p><strong>Fizetés:</strong> ${order.method === 'cash' ? 'Helyszíni KP' : 'Online kártya'}</p>`
            });
        } catch (err) {
            console.error('Admin rendelési email hiba:', err);
        }

        if (order.method === 'cash') {
            await sendGuestOrderEmail(order, lang, 'cash');
            return res.json({ success: true, id, method: 'cash' });
        }

        const t = getOrderTranslations(order, lang);

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'huf',
                    product_data: {
                        name: t.subj,
                        description: `${order.items} | ${order.apartment}`
                    },
                    unit_amount: Math.round(amount) * 100
                },
                quantity: 1
            }],
            mode: 'payment',
            success_url: `https://${req.get('host')}/success-extra.html?session_id={CHECKOUT_SESSION_ID}&lang=${lang}`,
            cancel_url: `https://${req.get('host')}/${order.type === 'BREAKFAST' ? 'morning.html' : 'sun.html'}?lang=${lang}`,
            customer_email: order.email,
            metadata: {
                orderId: id,
                type: order.type,
                lang
            }
        });

        return res.json({
            success: true,
            id,
            method: 'card',
            stripeSessionId: session.id
        });
    } catch (e) {
        console.error('Rendelési hiba:', e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/finalize-extra', async (req, res) => {
    try {
        const { session_id } = req.query;

        if (!session_id) {
            return res.status(400).json({ error: 'Hiányzó session_id.' });
        }

        const session = await stripe.checkout.sessions.retrieve(session_id);

        if (!session || session.payment_status !== 'paid') {
            return res.status(400).json({ error: 'A fizetés még nem sikeres.' });
        }

        const orderId = session.metadata?.orderId;
        const type = session.metadata?.type;
        const lang = normalizeLang(session.metadata?.lang || 'hu');

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

            if (list[idx].paymentStatus === 'paid' && list[idx].stripeId === session_id) {
                order = list[idx];
                return db;
            }

            list[idx] = {
                ...list[idx],
                paymentStatus: 'paid',
                stripeId: session_id,
                paidAmount: Number(session.amount_total || 0) / 100,
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
            const isSameApartment = String(booking.aptId) === String(aptId);
            const isOwnWebsiteBooking = !booking.icalId && !booking.source && !booking.importedFrom;
            const isConfirmed = booking.status !== 'cancelled';

            return isSameApartment && isOwnWebsiteBooking && isConfirmed;
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

        lines.push('END:VCALENDAR');

        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader('Content-Disposition', `inline; filename="balaton-essence-${aptId}.ics"`);
        res.send(lines.join('\r\n'));
    } catch (e) {
        console.error('iCal export hiba:', e);
        res.status(500).send('iCal export error');
    }
});

app.post('/api/sync', requireAdmin, async (req, res) => {
    try {
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
                        const response = await axios.get(url, { timeout: 10000 });
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

                            if (rawSummaryLower.includes('not available')) {
                                bookingType = 'blocked';
                                displayName = 'Zárolt időszak';
                            } else if (rawSummaryLower.includes('reserved')) {
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
                                    ...incoming
                                });
                                hasChange = true;
                            } else {
                                const existing = db.bookings[existingIndex];

                                const changed =
                                    existing.guestName !== incoming.guestName ||
                                    existing.checkIn !== incoming.checkIn ||
                                    existing.checkOut !== incoming.checkOut ||
                                    existing.aptName !== incoming.aptName ||
                                    existing.status !== incoming.status ||
                                    existing.rawSummary !== incoming.rawSummary;

                                if (changed) {
                                    db.bookings[existingIndex] = {
                                        ...existing,
                                        ...incoming,
                                        id: existing.id
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

        res.json({ success: true, changed: hasChange, bookingsCount: finalCount });
    } catch (e) {
        console.error('Általános sync hiba:', e);
        res.status(500).json({ error: e.message });
    }
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
        const newTodo = {
            id: Date.now(),
            text: String(req.body.text || '').trim()
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

// -----------------------------------------------------------------------------
// STATIC ROUTES
// -----------------------------------------------------------------------------

app.get('/health', (req, res) => res.status(200).send('OK'));

app.get('/apartman', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'apartman.html'));
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

// -----------------------------------------------------------------------------
// START
// -----------------------------------------------------------------------------

const PORT = process.env.PORT || 8080;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`ESSENCE SZERVER ELINDULT | Port: ${PORT}`);
});