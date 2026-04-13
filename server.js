const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const ical = require('ical');
const { Pool } = require('pg');

const app = express();
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// 1. POSTGRES CSATLAKOZÁS
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// 2. ADATBÁZIS INICIALIZÁLÁS (Fájlmentes biztonsági indítás)
async function initDb() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS essence_data (
            id serial PRIMARY KEY,
            key text UNIQUE,
            content jsonb
        )
    `);
    
    const res = await pool.query("SELECT * FROM essence_data WHERE key = 'main_db'");
    if (res.rowCount === 0) {
        let initialDb = { apartments: [], owners: [], bookings: [], extras: [] };
        
        // Csak akkor próbáljuk betölteni, ha létezik a fájl, különben üresen indul
        const backupPath = path.join(__dirname, 'public', 'database.js');
        if (fs.existsSync(backupPath)) {
            try {
                // Itt nem require-t használunk, hogy ne crash-eljen ha rossz a path
                const fileContent = fs.readFileSync(backupPath, 'utf8');
                // Egyszerű tisztítás, hogy JSON-t kapjunk (ha a fájlban 'const db = ...' van)
                const jsonPart = fileContent.substring(fileContent.indexOf('{'), fileContent.lastIndexOf('}') + 1);
                initialDb = JSON.parse(jsonPart);
            } catch (e) { console.log("Nem sikerült beolvasni a backup fájlt, üres DB indul."); }
        }
        
        await pool.query("INSERT INTO essence_data (key, content) VALUES ('main_db', $1)", [initialDb]);
    }
}
initDb().catch(console.error);

// Segédfüggvények
async function getDb() {
    const res = await pool.query("SELECT content FROM essence_data WHERE key = 'main_db'");
    return res.rows[0].content;
}

async function saveDb(data) {
    await pool.query("UPDATE essence_data SET content = $1 WHERE key = 'main_db'", [data]);
}

// --- API ÚTVONALAK ---

// Ez kell a frontendnek az adatok eléréséhez!
app.get('/api/get-db-content', async (req, res) => {
    try { res.json(await getDb()); } 
    catch (e) { res.status(500).send(e.message); }
});

app.post('/api/save-db', async (req, res) => {
    try { await saveDb(req.body); res.json({ success: true }); } 
    catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/order', async (req, res) => {
    try {
        const db = await getDb();
        const newOrder = { id: "order_" + Date.now(), ...req.body, createdAt: new Date().toISOString() };
        if (!db.extras) db.extras = [];
        db.extras.push(newOrder);
        await saveDb(db);
        res.json({ success: true, id: newOrder.id });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/extras/:id', async (req, res) => {
    try {
        const db = await getDb();
        db.extras = (db.extras || []).filter(item => item.id !== req.params.id);
        await saveDb(db);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/bookings/:id', async (req, res) => {
    try {
        const db = await getDb();
        db.bookings = (db.bookings || []).filter(item => item.id !== req.params.id);
        await saveDb(db);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/sync', async (req, res) => {
    try {
        const db = await getDb();
        let hasChange = false;
        for (let apt of db.apartments) {
            let externalDates = [];
            const urls = [apt.icalBooking, apt.icalSzallas].filter(u => u && u.startsWith('http'));
            for (let url of urls) {
                try {
                    const response = await axios.get(url, { timeout: 8000 });
                    const data = ical.parseICS(response.data);
                    for (let k in data) {
                        if (data[k].type === 'VEVENT') {
                            let start = new Date(data[k].start);
                            let end = new Date(data[k].end);
                            while (start < end) {
                                externalDates.push(start.toISOString().split('T')[0]);
                                start.setDate(start.getDate() + 1);
                            }
                        }
                    }
                } catch (err) { console.error("Sync hiba:", url); }
            }
            const combined = [...new Set([...externalDates, ...(apt.manualBlocks || [])])].sort();
            if (JSON.stringify(apt.bookedDates) !== JSON.stringify(combined)) {
                apt.bookedDates = combined;
                hasChange = true;
            }
        }
        if (hasChange) await saveDb(db);
        res.json({ success: true, changed: hasChange });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/health', (req, res) => res.status(200).send('OK'));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`ESSENCE SZERVER ELINDULT (POSTGRES MODE) | Port: ${PORT}`);
});