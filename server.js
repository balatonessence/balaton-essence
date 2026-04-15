const express = require('express');
const path = require('path');
const axios = require('axios');
const ical = require('ical');
const { Pool } = require('pg');

const app = express();
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// 1. ADATBÁZIS KAPCSOLAT
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// 2. TÁBLA ÉS ALAPADAT LÉTREHOZÁSA (Ha még nem létezik)
async function initDb() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS essence_data (
            key text PRIMARY KEY,
            content jsonb
        )
    `);
    
    const res = await pool.query("SELECT content FROM essence_data WHERE key = 'main_db'");
    if (res.rowCount === 0) {
        const initialDb = { apartments: [], owners: [], bookings: [], extras: [] };
        await pool.query("INSERT INTO essence_data (key, content) VALUES ('main_db', $1)", [initialDb]);
        console.log("Üres adatbázis inicializálva.");
    }
}
initDb().catch(console.error);

// 3. ADATBÁZIS MŰVELETEK
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

app.post('/api/new-booking', async (req, res) => {
    try {
        const db = await getDbContent();
        const booking = { id: Date.now().toString(), ...req.body, createdAt: new Date().toISOString() };
        
        if (!db.bookings) db.bookings = [];
        db.bookings.push(booking);

        const apt = db.apartments.find(a => a.id == booking.aptId);
        if (apt) {
            if (!apt.bookedDates) apt.bookedDates = [];
            apt.bookedDates.push({ start: booking.start, end: booking.end });
        }

        await saveDbContent(db);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/order', async (req, res) => {
    try {
        const db = await getDbContent();
        const data = req.body;
        const id = "ord_" + Date.now();

        if (data.type === 'BREAKFAST') {
            // Reggeli mentése a breakfasts tömbbe
            if (!db.breakfasts) db.breakfasts = [];
            db.breakfasts.push({ id, ...data, createdAt: new Date().toISOString() });
        } else {
            // Minden más (SUP, stb.) az extras tömbbe
            if (!db.extras) db.extras = [];
            db.extras.push({ id, ...data, createdAt: new Date().toISOString() });
        }

        await saveDbContent(db);
        res.json({ success: true, id });
    } catch (e) { 
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
        const db = await getDbContent();
        db.bookings = (db.bookings || []).filter(item => item.id !== req.params.id);
        await saveDbContent(db);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/breakfasts/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const db = await getDbContent();

        // Kiszűrjük a törlendő ID-t (String kényszerítés a biztonság kedvéért)
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
        
        // Biztosítjuk, hogy létezzen a bookings tömb
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

                            // Ellenőrizzük, létezik-e már ez a foglalás (UID alapján)
                            const exists = db.bookings.find(b => b.icalId === uid);

                            if (!exists) {
                                // ÚJ FOGLALÁS LÉTREHOZÁSA
                                db.bookings.push({
                                    id: Date.now() + Math.random(), // Egyedi belső ID
                                    icalId: uid,                   // iCal azonosító a duplikáció ellen
                                    aptId: apt.id,
                                    aptName: apt.name,
                                    guestName: event.summary || 'iCal Vendég',
                                    checkIn: start,
                                    checkOut: end,
                                    source: sourceDef.name,        // Itt mentjük el a forrást!
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

app.get('/health', (req, res) => res.status(200).send('OK'));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`ESSENCE SZERVER ELINDULT (POSTGRES JSONB MÓD) | Port: ${PORT}`);
});