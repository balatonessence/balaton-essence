require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const ical = require('node-ical');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Segédfüggvény dátumtartományhoz
function getDaysArray(start, end) {
    let arr = [];
    let dt = new Date(start);
    const stop = new Date(end);
    while (dt <= stop) {
        arr.push(new Date(dt).toISOString().split('T')[0]);
        dt.setDate(dt.getDate() + 1);
    }
    return arr;
}

// --- AUTOMATIKUS SZINKRONIZÁCIÓ ---
async function performSync() {
    try {
        const result = await pool.query('SELECT data FROM app_state WHERE id = 1');
        let db = result.rows[0].data;

        db.bookings = db.bookings || [];

        for (let apt of db.apartments) {
            let externalDates = [];
            
            // Booking szinkron
            if (apt.icalBooking) {
                try {
                    const events = await ical.fromURL(apt.icalBooking);
                    Object.values(events).forEach(ev => {
                        if (ev.type === 'VEVENT') {
                            const dates = getDaysArray(ev.start, ev.end);
                            externalDates.push(...dates);
                            // Ha ez a foglalás még nincs a listánkban, adjuk hozzá
                            const bookingId = `B-${ev.uid || ev.start.getTime()}`;
                            if (!db.bookings.find(b => b.id === bookingId)) {
                                db.bookings.push({
                                    id: bookingId,
                                    aptName: apt.name,
                                    guestName: "Booking.com Vendég",
                                    checkIn: dates[0],
                                    checkOut: dates[dates.length-1],
                                    source: "booking",
                                    status: "confirmed"
                                });
                            }
                        }
                    });
                } catch (e) { console.error("Booking hiba:", apt.name); }
            }

            // Szállás.hu szinkron
            if (apt.icalSzallas) {
                try {
                    const events = await ical.fromURL(apt.icalSzallas);
                    Object.values(events).forEach(ev => {
                        if (ev.type === 'VEVENT') {
                            const dates = getDaysArray(ev.start, ev.end);
                            externalDates.push(...dates);
                            const bookingId = `SZ-${ev.uid || ev.start.getTime()}`;
                            if (!db.bookings.find(b => b.id === bookingId)) {
                                db.bookings.push({
                                    id: bookingId,
                                    aptName: apt.name,
                                    guestName: "Szállás.hu Vendég",
                                    checkIn: dates[0],
                                    checkOut: dates[dates.length-1],
                                    source: "szallas",
                                    status: "confirmed"
                                });
                            }
                        }
                    });
                } catch (e) { console.error("Szállás hiba:", apt.name); }
            }

            const manual = apt.manualBlocks || [];
            apt.bookedDates = [...new Set([...manual, ...externalDates])];
        }require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const ical = require('node-ical');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// --- API: ÜGYFÉL OLDALI RENDELÉSEK BEKÜLDÉSE ---
app.post('/api/order', async (req, res) => {
    try {
        const { type, guest, date, note, aptName } = req.body;
        const result = await pool.query('SELECT data FROM app_state WHERE id = 1');
        let db = result.rows[0].data;

        db.extras = db.extras || [];
        db.extras.push({
            id: Date.now(),
            type, // 'SUP', 'BREAKFAST', 'SUN'
            guest,
            aptName,
            date,
            note,
            status: 'pending',
            createdAt: new Date().toISOString()
        });

        await pool.query('UPDATE app_state SET data = $1 WHERE id = 1', [db]);
        res.json({ success: true, message: "Rendelés rögzítve!" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- AUTOMATIKUS SZINKRON (30 perc) ---
async function performSync() {
    try {
        const result = await pool.query('SELECT data FROM app_state WHERE id = 1');
        let db = result.rows[0].data;
        // ... (a korábbi iCal szinkron kódja változatlanul ide jön) ...
        await pool.query('UPDATE app_state SET data = $1 WHERE id = 1', [db]);
    } catch (e) { console.log("Szinkron hiba"); }
}
setInterval(performSync, 1800000);

app.get('/api/data', async (req, res) => {
    const r = await pool.query('SELECT data FROM app_state WHERE id = 1');
    res.json(r.rows[0].data);
});

app.post('/api/data', async (req, res) => {
    await pool.query('UPDATE app_state SET data = $1 WHERE id = 1', [req.body]);
    res.json({ message: "OK" });
});

app.listen(process.env.PORT || 8080);

        await pool.query('UPDATE app_state SET data = $1 WHERE id = 1', [db]);
        console.log("✅ Szinkron kész.");
    } catch (err) { console.error("Szinkron hiba:", err.message); }
}

setInterval(performSync, 30 * 60 * 1000); // 30 percenként

app.get('/api/data', async (req, res) => {
    const result = await pool.query('SELECT data FROM app_state WHERE id = 1');
    res.json(result.rows[0].data);
});

app.post('/api/data', async (req, res) => {
    await pool.query('UPDATE app_state SET data = $1 WHERE id = 1', [req.body]);
    res.json({ message: "OK" });
});

app.post('/api/sync', async (req, res) => {
    await performSync();
    res.json({ success: true });
});

app.listen(process.env.PORT || 8080);