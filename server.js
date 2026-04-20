const express = require('express');
const path = require('path');
const axios = require('axios');
const ical = require('ical');
const { Pool } = require('pg');
const { Resend } = require('resend');

const app = express();
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

const resend = new Resend(process.env.RESEND_API_KEY);

// 1. STATIKUS FÁJLOK KISZOLGÁLÁSA
app.use(express.static(path.join(__dirname, 'public')));

// 2. ADATBÁZIS KAPCSOLAT
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// 3. TÁBLA ÉS ALAPADAT LÉTREHOZÁSA
async function initDb() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS essence_data (
            key text PRIMARY KEY,
            content jsonb
        )
    `);
    
    const res = await pool.query("SELECT content FROM essence_data WHERE key = 'main_db'");
    if (res.rowCount === 0) {
        const initialDb = { apartments: [], owners: [], bookings: [], extras: [], breakfasts: [] };
        await pool.query("INSERT INTO essence_data (key, content) VALUES ('main_db', $1)", [initialDb]);
        console.log("Adatbázis inicializálva.");
    }
}
initDb().catch(console.error);

async function getDbContent() {
    const res = await pool.query("SELECT content FROM essence_data WHERE key = 'main_db'");
    return res.rows[0].content;
}

async function saveDbContent(data) {
    await pool.query("UPDATE essence_data SET content = $1 WHERE key = 'main_db'", [data]);
}

// --- API ÚTVONALAK ---

app.get('/api/get-db-content', async (req, res) => {
    try {
        const db = await getDbContent();
        res.status(200).json(db);
    } catch (err) {
        console.error("Lekérdezési hiba:", err);
        res.status(500).json({ error: "Hiba az adatok lekérésekor" });
    }
});

app.post('/api/save', async (req, res) => {
    try {
        await saveDbContent(req.body);
        res.status(200).json({ message: "Sikeres mentés" });
    } catch (err) {
        console.error("Mentés hiba:", err);
        res.status(500).json({ error: "Hiba az adatbázisba íráskor" });
    }
});

// --- JAVÍTOTT FOGLALÁS KEZELŐ ---
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// 1. LÉPÉS: Fizetési munkamenet indítása (Ezt hívja a "Foglalás" gomb)
app.post('/api/create-checkout-session', async (req, res) => {
    try {
        const db = await getDbContent();
        const newB = req.body;

        // Ütközés ellenőrzése még a fizetés előtt
        const isOverlapping = db.bookings.some(oldB => {
            if (String(oldB.aptId) !== String(newB.aptId)) return false;
            const start1 = new Date(newB.checkIn);
            const end1 = new Date(newB.checkOut);
            const start2 = new Date(oldB.checkIn);
            const end2 = new Date(oldB.checkOut || oldB.end);
            return (start1 < end2 && end1 > start2);
        });

        if (isOverlapping) {
            return res.status(400).json({ error: "Sajnos ez az időpont már foglalt!" });
        }

        const depositAmount = Math.round(newB.totalPrice / 2);

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'huf',
                    product_data: {
                        name: `Előleg (50%): ${newB.aptName}`,
                        description: `${newB.checkIn} — ${newB.checkOut} (${newB.guests} fő)`,
                    },
                    unit_amount: depositAmount * 100,
                },
                quantity: 1,
            }],
            mode: 'payment',
            metadata: {
                bookingData: JSON.stringify(newB) // Itt visszük át az adatokat a következő lépésbe
            },
            success_url: `https://${req.get('host')}/success.html?session_id={CHECKOUT_SESSION_ID}`,success_url: `https://${req.get('host')}/success.html?session_id={CHECKOUT_SESSION_ID}&lang=${newB.lang || 'hu'}`,
            cancel_url: `https://${req.get('host')}/apartman.html`,
            customer_email: newB.email,
        });

        res.json({ id: session.id });
    } catch (e) {
        console.error("Stripe indítási hiba:", e);
        res.status(500).json({ error: e.message });
    }
});

// 2. LÉPÉS: Véglegesítés (Ezt hívja a success.html betöltéskor)
app.get('/api/finalize-booking', async (req, res) => {
    try {
        const { session_id } = req.query;
        if (!session_id) return res.status(400).send("Hiányzó ID");

        const session = await stripe.checkout.sessions.retrieve(session_id);
        const newB = JSON.parse(session.metadata.bookingData);
        const lang = newB.lang || 'hu';
        
        const db = await getDbContent();

        // Duplikáció szűrése
        const alreadySaved = db.bookings.find(b => b.stripeId === session_id);
        if (alreadySaved) return res.json({ success: true });

        // Adatok kiegészítése a mentéshez
        newB.id = 'ord_' + Date.now();
        newB.stripeId = session_id;
        newB.paidDeposit = session.amount_total / 100;
        
        db.bookings.push(newB);
        await saveDbContent(db);

        // --- ADMIN EMAIL ---
        try {
            await resend.emails.send({
                from: 'Rendszer <info@balatonessence.com>',
                to: 'balatonessence@gmail.com',
                subject: `🚨 ÚJ FOGLALÁS (Fizetve): ${newB.guestName}`,
                html: `
                    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 2px solid #5c7a4d; border-radius: 10px; overflow: hidden;">
                        <div style="background-color: #5c7a4d; color: white; padding: 20px; text-align: center;">
                            <h2 style="margin: 0;">Sikeres foglalás és fizetés!</h2>
                        </div>
                        <div style="padding: 20px;">
                            <p><strong>Vendég:</strong> ${newB.guestName}</p>
                            <p><strong>Apartman:</strong> ${newB.aptName}</p>
                            <p><strong>Időpont:</strong> ${newB.checkIn} — ${newB.checkOut}</p>
                            <p><strong>Befizetett előleg:</strong> ${newB.paidDeposit.toLocaleString()} Ft</p>
                            <p><strong>Teljes összeg:</strong> ${Number(newB.totalPrice).toLocaleString()} Ft</p>
                            <div style="background: #fff4e5; padding: 10px; border-left: 4px solid #ffa500;">
                                <strong>Üzenet:</strong> ${newB.msg || '-'}
                            </div>
                        </div>
                    </div>`
            });
        } catch (e) { console.error("Admin mail hiba:", e); }

       // --- VENDÉG EMAIL ---
        const guestLang = newB.lang || 'hu';
        const balance = newB.totalPrice - newB.paidDeposit;

        const translations = {
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

        const t = translations[guestLang] || translations.hu;

        try {
            await resend.emails.send({
                from: 'Balaton Essence <info@balatonessence.com>',
                to: newB.email,
                subject: t.subject,
                html: `
                    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
                        
                        <div style="background-color: #5c7a4d; padding: 40px 20px; text-align: center;">
                            <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 400; letter-spacing: 1px;">Balaton Essence</h1>
                            <p style="color: #e8f0e4; margin: 10px 0 0 0; font-size: 16px;">${t.preheader}</p>
                        </div>

                        <div style="padding: 40px 30px; color: #333333;">
                            <p style="font-size: 18px; margin-bottom: 20px;">${t.dear} <strong>${newB.guestName}</strong>,</p>
                            <p style="line-height: 1.6; color: #555555; font-size: 15px;">${t.thankYou}</p>

                            <div style="background-color: #f9fbf8; border: 1px solid #e2e8df; border-radius: 8px; padding: 25px; margin: 30px 0;">
                                <h3 style="margin-top: 0; color: #5c7a4d; border-bottom: 2px solid #e2e8df; padding-bottom: 10px; font-weight: 600;">${t.detailsTitle}</h3>
                                <table style="width: 100%; border-collapse: collapse; font-size: 15px;">
                                    <tr><td style="padding: 10px 0; color: #666;">${t.apt}</td><td style="padding: 10px 0; text-align: right; font-weight: bold; color: #2C3325;">${newB.aptName}</td></tr>
                                    <tr><td style="padding: 10px 0; color: #666;">${t.checkIn}</td><td style="padding: 10px 0; text-align: right; font-weight: bold; color: #2C3325;">${newB.checkIn}</td></tr>
                                    <tr><td style="padding: 10px 0; color: #666;">${t.checkOut}</td><td style="padding: 10px 0; text-align: right; font-weight: bold; color: #2C3325;">${newB.checkOut}</td></tr>
                                    <tr><td style="padding: 10px 0; color: #666;">${t.guests}</td><td style="padding: 10px 0; text-align: right; font-weight: bold; color: #2C3325;">${newB.guests}</td></tr>
                                    <tr><td style="padding: 12px 0; border-top: 1px dashed #ccc; margin-top: 5px; color: #666;">${t.paid}</td><td style="padding: 12px 0; border-top: 1px dashed #ccc; text-align: right; font-weight: bold; color: #5c7a4d; font-size: 16px;">${newB.paidDeposit.toLocaleString()} Ft</td></tr>
                                    <tr><td style="padding: 10px 0; color: #666;">${t.balance}</td><td style="padding: 10px 0; text-align: right; font-weight: bold; color: #2C3325; font-size: 16px;">${balance.toLocaleString()} Ft</td></tr>
                                </table>
                            </div>

                            <div style="background-color: #fcf8e3; border-left: 4px solid #e3c878; padding: 15px 20px; margin-bottom: 30px; border-radius: 0 6px 6px 0;">
                                <h4 style="margin-top: 0; margin-bottom: 8px; color: #8a6d3b; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">${t.policyTitle}</h4>
                                <p style="margin: 0; line-height: 1.5; font-size: 13px; color: #66512c;">${t.policyText}</p>
                            </div>

                            <div style="text-align: center; margin-top: 40px;">
                                <a href="https://${req.get('host')}/cancel.html?id=${newB.id}&lang=${guestLang}" style="display: inline-block; background-color: transparent; border: 1px solid #d9534f; color: #d9534f; text-decoration: none; padding: 10px 25px; border-radius: 20px; font-weight: 600; font-size: 13px; transition: all 0.3s;">${t.cancelBtn}</a>
                            </div>
                        </div>

                        <div style="background-color: #f4f7f2; padding: 25px; text-align: center; font-size: 12px; color: #888888; border-top: 1px solid #e0e0e0;">
                            <p style="margin: 0; font-weight: bold; color: #5c7a4d;">Balaton Essence - Luxury Apartments</p>
                            <p style="margin: 8px 0 0 0;"><a href="mailto:info@balatonessence.com" style="color: #666; text-decoration: none;">info@balatonessence.com</a> | <a href="https://balatonessence.com" style="color: #666; text-decoration: none;">balatonessence.com</a></p>
                        </div>

                    </div>`
            });
            console.log("Profi vendég email elküldve.");
        } catch (e) { console.error("Vendég mail hiba:", e); }

        res.json({ success: true });
    } catch (e) {
        console.error("Véglegesítési hiba:", e);
        res.status(500).send("Hiba");
    }
});

app.get('/api/cancel-booking/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const db = await getDbContent();
        
        // 1. Megkeressük a foglalást
        const bookingIndex = db.bookings.findIndex(item => String(item.id) === String(id));
        
        if (bookingIndex === -1) {
            return res.status(404).json({ error: "A foglalás már nem található vagy már törölték." });
        }

        const booking = db.bookings[bookingIndex];

        // 2. Kiszámoljuk a napok számát (Ma vs. Érkezés napja)
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Éjféltől számolunk
        
        const checkInDate = new Date(booking.checkIn);
        checkInDate.setHours(0, 0, 0, 0);

        const diffTime = checkInDate - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); // Különbség napokban

        // 3. Visszautalandó összeg meghatározása
        let refundAmount = 0;
        let refundPolicy = "";

        // Ha van kifizetett előleg, számolunk (biztonsági ellenőrzés)
        const deposit = booking.paidDeposit || 0; 

        if (diffDays >= 14) {
            refundAmount = deposit; // 100% visszajár az előlegből
            refundPolicy = "14 napon kívüli lemondás (100% előleg visszatérítés)";
        } else {
            refundAmount = deposit / 2; // 50% visszajár az előlegből
            refundPolicy = "14 napon belüli lemondás (50% előleg visszatérítés)";
        }

        // 4. Stripe Visszatérítés (Refund) indítása
        // Csak akkor hívjuk a Stripe-ot, ha van visszautalandó pénz és stripeId
        if (booking.stripeId && refundAmount > 0) {
            try {
                const session = await stripe.checkout.sessions.retrieve(booking.stripeId);
                if (session.payment_intent) {
                    await stripe.refunds.create({
                        payment_intent: session.payment_intent,
                        amount: Math.round(refundAmount * 100), // Stripe fillérben kéri
                    });
                    console.log(`Stripe refund sikeres: ${refundAmount} Ft`);
                }
            } catch (stripeErr) {
                console.error("Stripe refund hiba:", stripeErr);
                // Ide lehetne tenni egy alertet, de a törlést folytatjuk
            }
        }

        // 5. Törlés az adatbázisból
        db.bookings.splice(bookingIndex, 1);
        await saveDbContent(db);

        // --- 6. ADMIN EMAIL (Neked) ---
        try {
            await resend.emails.send({
                from: 'Rendszer <info@balatonessence.com>',
                to: 'balatonessence@gmail.com',
                subject: `❌ LEMONDÁS ÉS VISSZAUTALÁS: ${booking.guestName}`,
                html: `
                    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 2px solid #8b0000; border-radius: 10px; overflow: hidden;">
                        <div style="background-color: #8b0000; color: white; padding: 20px; text-align: center;">
                            <h2 style="margin: 0;">Foglalás lemondva</h2>
                        </div>
                        <div style="padding: 20px;">
                            <p>Az alábbi foglalást a vendég a weboldalon keresztül <strong>lemondta</strong>:</p>
                            <table style="width: 100%; border-collapse: collapse;">
                                <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Vendég:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${booking.guestName}</td></tr>
                                <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Apartman:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${booking.aptName}</td></tr>
                                <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Időpont:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${booking.checkIn} — ${booking.checkOut}</td></tr>
                                <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color:#8b0000;"><strong>Szabály érvényesült:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee; color:#8b0000;">${refundPolicy}</td></tr>
                                <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color:#8b0000;"><strong>Visszautalva a kártyára:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight:bold; color:#8b0000;">${refundAmount.toLocaleString()} Ft</td></tr>
                            </table>
                            <p style="margin-top: 15px; font-size: 13px; color: #666;">A rendszer automatikusan visszautalta az összeget a vendégnek a Stripe-on keresztül, a naptár pedig felszabadult.</p>
                        </div>
                    </div>`
            });
        } catch (mailErr) {
            console.error("Admin lemondási email hiba:", mailErr);
        }

        // --- 7. VENDÉG EMAIL (Értesítés a pénzről) ---
        const lang = booking.lang || 'hu';
        const guestTexts = {
            hu: { sub: "Foglalás lemondása - Balaton Essence", title: "A foglalását töröltük", msg: `Sikeresen feldolgoztuk a lemondást. A szabályzat értelmében <b>${refundAmount.toLocaleString()} Ft</b> összeget automatikusan visszautaltunk a bankkártyájára. Ez az összeg a bankjától függően 5-10 munkanapon belül jelenik meg a számláján.` },
            en: { sub: "Booking Cancelled - Balaton Essence", title: "Your booking has been cancelled", msg: `We have processed your cancellation. According to our policy, <b>${refundAmount.toLocaleString()} HUF</b> has been automatically refunded to your credit card. Please allow 5-10 business days for the funds to appear.` },
            de: { sub: "Buchung storniert - Balaton Essence", title: "Ihre Buchung wurde storniert", msg: `Ihre Stornierung wurde bearbeitet. Gemäß unseren Richtlinien wurden <b>${refundAmount.toLocaleString()} HUF</b> automatisch auf Ihre Kreditkarte zurückerstattet. Es kann 5-10 Werktage dauern, bis der Betrag sichtbar ist.` }
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
                                <h2 style="color: #d9534f; margin: 0;">${t.title}</h2>
                            </div>
                            <div style="padding: 20px; color: #333;">
                                <p>${t.msg}</p>
                                <p><strong>${booking.aptName}</strong> (${booking.checkIn} — ${booking.checkOut})</p>
                            </div>
                        </div>`
                });
            } catch (guestErr) {
                console.error("Vendég lemondási email hiba:", guestErr);
            }
        }

        res.json({ success: true, message: "A lemondás és a visszautalás sikeres." });
        
    } catch (e) {
        console.error("Lemondási folyamat hiba:", e);
        res.status(500).json({ error: "Szerverhiba a lemondáskor." });
    }
});

app.post('/api/order', async (req, res) => {
    try {
        const db = await getDbContent();
        const data = req.body; 
        const id = "ord_" + Date.now();
        const lang = data.lang || 'hu';

        // --- ÚJ: REGRELI ÉS FOGLALÁS ELLENŐRZÉSE ---
        if (data.type === 'BREAKFAST') {
            // 1. Fonyód és Külsős szűrés
            const isFonyod = data.apartment && data.apartment.toUpperCase().includes('FONYÓD');
            if (!isFonyod || data.apartment === 'KÜLSŐS' || data.apartment === 'EXTERNAL') {
                return res.status(400).json({ error: lang === 'hu' ? "Reggeli csak fonyódi apartmanokba rendelhető!" : "Breakfast is only available for apartments in Fonyód!" });
            }

            // 2. Érvényes foglalás keresése (Név/Email + Időpont + Apartman egyezés)
            const hasBooking = db.bookings.find(b => 
                b.aptName === data.apartment && 
                b.email.toLowerCase() === data.email.toLowerCase() &&
                new Date(data.start) >= new Date(b.checkIn) && 
                new Date(data.start) <= new Date(b.checkOut)
            );

            if (!hasBooking) {
                return res.status(403).json({ 
                    error: lang === 'hu' ? "Sajnos nem találtunk érvényes szállásfoglalást erre az időszakra ezzel az e-mail címmel." : "Sorry, we couldn't find a valid accommodation booking for this period with this email address." 
                });
            }
        }

        // --- MENTÉS AZ ADATBÁZISBA ---
        if (data.type === 'BREAKFAST') {
            if (!db.breakfasts) db.breakfasts = [];
            db.breakfasts.push({ id, ...data, createdAt: new Date().toISOString() });
        } else {
            if (!db.extras) db.extras = [];
            db.extras.push({ id, ...data, createdAt: new Date().toISOString() });
        }
        await saveDbContent(db);

        // --- 1. ADMIN ÉRTESÍTÉS ---
        try {
            await resend.emails.send({
                from: 'Rendszer <info@balatonessence.com>',
                to: 'balatonessence@gmail.com',
                subject: `${data.type === 'BREAKFAST' ? '🍳' : '☀️'} ÚJ RENDELÉS (${data.method === 'cash' ? 'KP' : 'KÁRTYA'}): ${data.guestName}`,
                html: `<h2>Új ${data.type === 'BREAKFAST' ? 'reggeli' : 'felszerelés'} rendelés</h2>
                       <p><strong>Vendég:</strong> ${data.guestName} (${data.email})</p>
                       <p><strong>Apartman:</strong> ${data.apartment}</p>
                       <p><strong>Tételek:</strong> ${data.items}</p>
                       <p><strong>Idő:</strong> ${data.start} — ${data.end} (${data.days} nap)</p>
                       <p><strong>Fizetés:</strong> ${data.method === 'cash' ? 'Helyszíni KP' : 'Online kártya'}</p>`
            });
        } catch (err) { console.error("Admin mail hiba:", err); }

        // --- 2. VENDÉG FORDÍTÁSOK ---
        const translations = {
            hu: {
                subj: data.type === 'BREAKFAST' ? 'Visszaigazolás: Reggeli rendelés - Balaton Essence' : 'Visszaigazolás: Strandfelszerelés bérlés - Balaton Essence',
                title: 'Rendelés rögzítve',
                subtitle: 'Köszönjük rendelését!',
                dear: 'Kedves',
                body: data.type === 'BREAKFAST' ? 'Reggeli rendelését rögzítettük. A reggelit minden nap 08:30-ig szállítjuk az apartman ajtajához.' : 'Sikeresen rögzítettük strandfelszerelés foglalását. Az eszközöket a megadott időpontban veheti át.',
                details: 'Rendelés részletei:',
                items: 'Tételek:',
                period: 'Időszak:',
                pickup: data.type === 'BREAKFAST' ? 'Helyszín:' : 'Átvételi pont:',
                total: 'Fizetendő:',
                method: 'Fizetés módja: Helyszíni készpénz',
                footer: 'Ha bármi változik, kérjük jelezze válaszlevélben.'
            },
            en: {
                subj: data.type === 'BREAKFAST' ? 'Confirmation: Breakfast Order - Balaton Essence' : 'Confirmation: Beach Equipment Rental - Balaton Essence',
                title: 'Order Confirmed',
                subtitle: 'Thank you for your order!',
                dear: 'Dear',
                body: data.type === 'BREAKFAST' ? 'Your breakfast order has been recorded. Breakfast is delivered to your apartment door by 08:30 each morning.' : 'Your beach equipment booking has been successfully recorded. You can pick up the items at the specified time.',
                details: 'Order Details:',
                items: 'Items:',
                period: 'Period:',
                pickup: 'Location:',
                total: 'Total Amount:',
                method: 'Payment method: Cash on site',
                footer: 'If anything changes, please let us know by replying to this email.'
            },
            de: {
                subj: data.type === 'BREAKFAST' ? 'Bestätigung: Frühstücksbestellung - Balaton Essence' : 'Bestätigung: Strandausrüstung Verleih - Balaton Essence',
                title: 'Bestellung bestätigt',
                subtitle: 'Vielen Dank für Ihre Bestellung!',
                dear: 'Sehr geehrte(r)',
                body: data.type === 'BREAKFAST' ? 'Ihre Frühstücksbestellung wurde registriert. Das Frühstück wird jeden Morgen bis 08:30 Uhr an Ihre Zimmertür geliefert.' : 'Ihre Buchung der Strandausrüstung wurde erfolgreich registriert. Sie können die Ausrüstung zum angegebenen Zeitpunkt abholen.',
                details: 'Bestelldetails:',
                items: 'Artikel:',
                period: 'Zeitraum:',
                pickup: 'Ort:',
                total: 'Gesamtbetrag:',
                method: 'Zahlungsart: Barzahlung vor Ort',
                footer: 'Wenn sich etwas ändert, geben Sie uns bitte per Antwort-E-Mail Bescheid.'
            }
        };

        const t = translations[lang] || translations.hu;

        // --- 3. VENDÉG EMAIL KÜLDÉSE (Készpénz esetén) ---
        if (data.method === 'cash') {
            try {
                await resend.emails.send({
                    from: 'Balaton Essence <info@balatonessence.com>',
                    to: data.email,
                    subject: t.subj,
                    html: `
                        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e3e0d8; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
                            <div style="background-color: #5c7a4d; padding: 40px 20px; text-align: center; color: white;">
                                <h1 style="margin: 0; font-size: 26px; font-weight: 400; letter-spacing: 1px;">${t.title}</h1>
                                <p style="margin: 10px 0 0; opacity: 0.9; font-size: 16px;">${t.subtitle}</p>
                            </div>
                            <div style="padding: 40px 30px; color: #2c3325; line-height: 1.6;">
                                <p style="font-size: 17px;">${t.dear} <strong>${data.guestName}</strong>!</p>
                                <p style="color: #555;">${t.body}</p>
                                
                                <div style="background: #f9fbf8; border: 1px solid #e2e8df; padding: 25px; border-radius: 8px; margin: 30px 0;">
                                    <h3 style="margin-top: 0; color: #5c7a4d; border-bottom: 1px solid #e2e8df; padding-bottom: 10px;">${t.details}</h3>
                                    <p style="margin: 10px 0; font-size: 15px;"><strong>${t.items}</strong> ${data.items}</p>
                                    <p style="margin: 10px 0; font-size: 15px;"><strong>${t.period}</strong> ${data.start} — ${data.end} (${data.days} ${lang === 'hu' ? 'nap' : 'days'})</p>
                                    <p style="margin: 10px 0; font-size: 15px;"><strong>${t.pickup}</strong> ${data.apartment}</p>
                                    <hr style="border: none; border-top: 1px dashed #ccc; margin: 15px 0;">
                                    <p style="margin: 5px 0; font-size: 20px; color: #5c7a4d;"><strong>${t.total} ${Number(data.amount).toLocaleString()} Ft</strong></p>
                                    <p style="margin: 0; font-size: 13px; color: #6a7063;">${t.method}</p>
                                </div>

                                <p style="font-size: 14px; color: #888; font-style: italic;">${t.footer}</p>
                                
                                <div style="margin-top: 40px; border-top: 1px solid #eee; padding-top: 20px; text-align: center;">
                                    <p style="margin: 0; font-weight: bold; color: #5c7a4d;">Balaton Essence - Luxury Apartments</p>
                                    <p style="margin: 5px 0; font-size: 12px; color: #aaa;">www.balatonessence.com</p>
                                </div>
                            </div>
                        </div>`
                });
            } catch (err) { console.error("Vendég mail hiba:", err); }

            return res.json({ success: true, id, method: 'cash' });
        }

        // --- 4. KÁRTYÁS FIZETÉS (STRIPE) ---
        if (data.method === 'card') {
            const session = await stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                line_items: [{
                    price_data: {
                        currency: 'huf',
                        product_data: {
                            name: t.subj,
                            description: `${data.items} | ${data.apartment}`,
                        },
                        unit_amount: Math.round(data.amount) * 100,
                    },
                    quantity: 1,
                }],
                mode: 'payment',
                success_url: `https://${req.get('host')}/success-extra.html?session_id={CHECKOUT_SESSION_ID}&lang=${lang}`,
                cancel_url: `https://${req.get('host')}/${data.type === 'BREAKFAST' ? 'morning.html' : 'sun.html'}?lang=${lang}`,
                customer_email: data.email,
                metadata: { orderId: id, type: data.type, lang: lang }
            });

            return res.json({ success: true, id, method: 'card', stripeSessionId: session.id });
        }

    } catch (e) { 
        console.error("Rendelési hiba:", e);
        res.status(500).json({ error: e.message }); 
    }
});

app.delete('/api/extras/:id', async (req, res) => {
    try {
        const db = await getDbContent();
        db.extras = (db.extras || []).filter(item => item.id !== req.params.id);
        await saveDbContent(db);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/bookings/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const db = await getDbContent();
        
        const b = db.bookings.find(item => String(item.id) === String(id));
        
        if (!b) {
            return res.status(404).json({ error: "Foglalás nem található." });
        }

        // --- TELJESEN FORDÍTOTT SZÓTÁR ---
        const cancelTexts = {
            hu: { 
                subj: 'Foglalás törlése - Balaton Essence', 
                title: 'Foglalás törölve',
                body: `Sajnálattal értesítjük, hogy a(z) <strong>${b.checkIn} - ${b.checkOut}</strong> időszakra szóló foglalása törlésre került a rendszerünkből.`,
                contact: 'Amennyiben kérdése van, forduljon hozzánk bizalommal.'
            },
            en: { 
                subj: 'Booking Cancellation - Balaton Essence', 
                title: 'Booking Cancelled',
                body: `We regret to inform you that your booking for <strong>${b.checkIn} - ${b.checkOut}</strong> has been cancelled from our system.`,
                contact: 'If you have any questions, please feel free to contact us.'
            },
            de: { 
                subj: 'Buchung storniert - Balaton Essence', 
                title: 'Buchung storniert',
                body: `Wir bedauern, Ihnen mitteilen zu müssen, dass Ihre Buchung für den Zeitraum <strong>${b.checkIn} - ${b.checkOut}</strong> storniert wurde.`,
                contact: 'Wenn Sie Fragen haben, können Sie uns gerne kontaktieren.'
            }
        };

        const lang = b.lang || 'hu';
        const t = cancelTexts[lang] || cancelTexts.hu;

        if (b.email) {
            try {
                await resend.emails.send({
                    from: 'Balaton Essence <info@balatonessence.com>',
                    to: b.email,
                    subject: t.subj,
                    html: `
                        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
                            <div style="background-color: #8b0000; padding: 20px; text-align: center;">
                                <h1 style="color: #ffffff; margin: 0; font-size: 20px;">${t.title}</h1>
                            </div>
                            <div style="padding: 30px; line-height: 1.6; color: #333;">
                                <p>${t.body}</p>
                                <p>${t.contact}</p>
                                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                                <p style="font-size: 12px; color: #999;">Balaton Essence - Luxury Apartments</p>
                            </div>
                        </div>
                    `
                });
            } catch (mailErr) {
                console.error("Mail hiba:", mailErr);
            }
        }

        db.bookings = db.bookings.filter(item => String(item.id) !== String(id));
        await saveDbContent(db);
        
        res.json({ success: true });
    } catch (e) { 
        res.status(500).json({ error: e.message }); 
    }
});

app.delete('/api/breakfasts/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const db = await getDbContent();
        const initialLength = db.breakfasts.length;
        db.breakfasts = db.breakfasts.filter(b => String(b.id) !== String(id));
        if (db.breakfasts.length < initialLength) {
            await saveDbContent(db);
            res.json({ success: true });
        } else {
            res.status(404).json({ error: "Rendelés nem található." });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/sync', async (req, res) => {
    try {
        const db = await getDbContent();
        let hasChange = false;
        if (!db.bookings) db.bookings = [];
        for (let apt of db.apartments) {
            const sources = [
                { url: apt.icalBooking, name: 'booking' },
                { url: apt.icalSzallas, name: 'szallas' }
            ];
            for (let sourceDef of sources) {
                const url = sourceDef.url;
                if (!url || !url.startsWith('http')) continue;
                try {
                    const response = await axios.get(url, { timeout: 8000 });
                    const data = ical.parseICS(response.data);
                    for (let k in data) {
                        const event = data[k];
                        if (event.type === 'VEVENT') {
                            const start = new Date(event.start).toISOString().split('T')[0];
                            const end = new Date(event.end).toISOString().split('T')[0];
                            const uid = event.uid || `${apt.id}-${start}`;
                            const exists = db.bookings.find(b => b.icalId === uid);
                            if (!exists) {
                                db.bookings.push({
                                    id: Date.now() + Math.random(),
                                    icalId: uid,
                                    aptId: apt.id,
                                    aptName: apt.name,
                                    guestName: event.summary || 'iCal Vendég',
                                    checkIn: start,
                                    checkOut: end,
                                    source: sourceDef.name,
                                    status: 'confirmed'
                                });
                                hasChange = true;
                            }
                        }
                    }
                } catch (err) { console.error("Sync hiba:", sourceDef.name, url); }
            }
        }
        if (hasChange) {
            await saveDbContent(db);
        }
        res.json({ success: true, changed: hasChange });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Szükséged lesz a 'node-fetch' csomagra: npm install node-fetch@2
const fetch = require('node-fetch');

app.get('/api/balaton-water-temp', async (req, res) => {
    try {
        // A vízügy hivatalos oldaláról kérjük le az adatokat
        const response = await fetch('https://www.vizugy.hu/vizmeres/balaton/adatok/napi_vizmeres.php');
        const html = await response.text();
        
        // Egy egyszerű kereséssel (Regex) kiszedjük a fokot a táblázatból
        // Ez Balatonfüred környéki adatot keres
        const match = html.match(/(\d{1,2},\d{1}) &deg;C/); 
        let temp = match ? match[1].replace(',', '.') : "12.5"; // Ha nincs adat, egy reális áprilisi érték

        res.json({ temp: Math.round(parseFloat(temp)) + "°C" });
    } catch (e) {
        console.error("Vízhőfok hiba:", e);
        res.json({ temp: "12°C" }); // Hiba esetén biztonsági tartalék
    }
});

app.post('/api/create-checkout-session', async (req, res) => {
    try {
        const { booking } = req.body;
        
        // Kiszámoljuk az 50% előleget (Stripe-nál fillérben/centben kell megadni, ezért * 100)
        const depositAmount = Math.round((booking.totalPrice / 2));

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'huf',
                    product_data: {
                        name: `Előleg: ${booking.aptName}`,
                        description: `${booking.checkIn} - ${booking.checkOut} (${booking.guests} fő)`,
                    },
                    unit_amount: depositAmount * 100, 
                },
                quantity: 1,
            }],
            mode: 'payment',
            // Fontos: a sikeres fizetés után ide tér vissza a vendég
            success_url: `https://${req.get('host')}/success.html?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `https://${req.get('host')}/apartman.html`,
            customer_email: booking.email,
            // Elmentjük a foglalási adatokat a Stripe-ba, hogy a fizetés után tudjuk kit kell rögzíteni
            metadata: {
                bookingData: JSON.stringify(booking)
            }
        });

        res.json({ id: session.id });
    } catch (e) {
        console.error("Stripe hiba:", e);
        res.status(500).json({ error: e.message });
    }
});

// --- TODO LISTA KEZELÉSE ---

app.get('/api/get-todos', async (req, res) => {
    try {
        const db = await getDbContent();
        res.json(db.todos || []);
    } catch (e) {
        console.error("Hiba a feladatok lekérésekor:", e);
        res.status(500).json({ error: "Szerver hiba" });
    }
});

app.post('/api/add-todo', async (req, res) => {
    try {
        const db = await getDbContent();
        if (!db.todos) db.todos = [];
        
        const newTodo = {
            id: Date.now(),
            text: req.body.text
        };
        
        db.todos.push(newTodo);
        await saveDbContent(db);
        
        res.json(newTodo);
    } catch (e) {
        console.error("Hiba a feladat hozzáadásakor:", e);
        res.status(500).json({ error: "Szerver hiba" });
    }
});

app.post('/api/delete-todo', async (req, res) => {
    try {
        const db = await getDbContent();
        if (!db.todos) db.todos = [];
        
        db.todos = db.todos.filter(todo => todo.id !== req.body.id);
        await saveDbContent(db);
        
        res.json({ success: true });
    } catch (e) {
        console.error("Hiba a feladat törlésekor:", e);
        res.status(500).json({ error: "Szerver hiba" });
    }
});


app.get('/health', (req, res) => res.status(200).send('OK'));

app.get('/apartman', (req, res) => res.sendFile(path.join(__dirname, 'public', 'apartman.html')));
app.get('/en/apartman', (req, res) => res.sendFile(path.join(__dirname, 'public', 'en', 'apartman.html')));
app.get('/de/apartman', (req, res) => res.sendFile(path.join(__dirname, 'public', 'de', 'apartman.html')));

app.get('/en', (req, res) => res.sendFile(path.join(__dirname, 'public', 'en', 'index.html')));
app.get('/de', (req, res) => res.sendFile(path.join(__dirname, 'public', 'de', 'index.html')));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.get('*', (req, res) => {
    if (req.url.startsWith('/en/')) {
        res.sendFile(path.join(__dirname, 'public', 'en', 'index.html'));
    } else if (req.url.startsWith('/de/')) {
        res.sendFile(path.join(__dirname, 'public', 'de', 'index.html'));
    } else {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
});


const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`ESSENCE SZERVER ELINDULT | Port: ${PORT}`);
});