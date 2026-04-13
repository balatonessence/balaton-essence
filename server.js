require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const ical = require('node-ical');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// FONTOS: Megmondjuk a szervernek, hogy a 'public' mappából szolgálja ki a fájlokat
app.use(express.static(path.join(__dirname, 'public')));

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

// --- AUTOMATIKUS SZINKRONIZÁCIÓ LOGIKA ---
async function performSync() {
    console.log("🔄 Szinkronizáció indítása...");
    try {
        const result = await pool.query('SELECT data FROM app_state WHERE id = 1');
        let db = result.rows[0].data;
        db.bookings = db.bookings || [];

        for (let apt of db.apartments) {
            let externalDates = [];
            
            if (apt.icalBooking) {
                try {
                    const events = await ical.fromURL(apt.icalBooking);
                    Object.values(events).forEach(ev => {
                        if (ev.type === 'VEVENT') {
                            const dates = getDaysArray(ev.start, ev.end);
                            externalDates.push(...dates);
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
        }

        await pool.query('UPDATE app_state SET data = $1 WHERE id = 1', [db]);
        console.log("✅ Szinkron kész.");
    } catch (err) { console.error("Szinkron hiba:", err.message); }
}

setInterval(performSync, 1800000);

// --- API VÉGPONTOK ---

app.post('/api/order', async (req, res) => {
    try {
        const { type, guest, date, note, aptName } = req.body;
        const result = await pool.query('SELECT data FROM app_state WHERE id = 1');
        let db = result.rows[0].data;

        db.extras = db.extras || [];
        db.extras.push({
            id: Date.now(),
            type, guest, aptName, date, note,
            status: 'pending',
            createdAt: new Date().toISOString()
        });

        await pool.query('UPDATE app_state SET data = $1 WHERE id = 1', [db]);
        res.json({ success: true, message: "Rendelés rögzítve!" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/data', async (req, res) => {
    try {
        const result = await pool.query('SELECT data FROM app_state WHERE id = 1');
        res.json(result.rows[0].data);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/data', async (req, res) => {
    try {
        await pool.query('UPDATE app_state SET data = $1 WHERE id = 1', [req.body]);
        res.json({ message: "OK" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/sync', async (req, res) => {
    await performSync();
    res.json({ success: true });
});

// Főoldal betöltése a public mappából
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Admin és egyéb oldalak direkt elérése
app.get('/:page', (req, res) => {
    const page = req.params.page;
    if (page.endsWith('.html')) {
        res.sendFile(path.join(__dirname, 'public', page));
    } else {
        res.sendFile(path.join(__dirname, 'public', `${page}.html`));
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`🚀 Szerver fut a ${PORT} porton...`);
});