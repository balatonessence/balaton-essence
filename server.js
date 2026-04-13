require('dotenv').config(); // Betölti a .env fájlban lévő jelszavakat
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { Pool } = require('pg'); // A Postgres csatlakozó

const app = express();
const PORT = process.env.PORT || 8080;

// --- RÉSZLETES CORS BEÁLLÍTÁS ---
// Ez engedi át a kéréseket a külső domainekről (pl. GitHub Pages vagy helyi Live Server)
app.use(cors({
    origin: '*', // Fejlesztés alatt ez engedélyez minden forrást. Később ide írhatod a fix domainedet (pl. 'https://balatonessence.com')
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// A "preflight" (OPTIONS) kérések automatikus elfogadása
app.options('*', cors());
// --------------------------------

app.use(bodyParser.json({ limit: '10mb' }));

// Adatbázis kapcsolat felépítése
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } 
});

// Indulási rutin: Tábla létrehozása és alapértelmezett adatok betöltése
async function initDb() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS app_state (
                id INT PRIMARY KEY,
                data JSONB NOT NULL
            );
        `);
        
        const res = await pool.query('SELECT data FROM app_state WHERE id = 1');
        if (res.rows.length === 0) {
            const defaultData = {
                adminCode: "admin123",
                owners: [{ id: "O1", name: "Példa Partner", accessCode: "partner01" }],
                apartments: [],
                bookings: []
            };
            await pool.query('INSERT INTO app_state (id, data) VALUES (1, $1)', [defaultData]);
            console.log("✅ Üres adatbázis inicializálva!");
        } else {
            console.log("✅ Meglévő adatok betöltve a Postgresből!");
        }
    } catch (err) {
        console.error("❌ Hiba az adatbázis csatlakozásakor:", err);
    }
}
initDb();

// --- 1. API VÉGPONTOK (Mindig a static elé!) ---

// Adatok lekérése a böngészőnek
app.get('/api/data', async (req, res) => {
    try {
        const result = await pool.query('SELECT data FROM app_state WHERE id = 1');
        if (result.rows.length === 0) {
            return res.json({ owners: [], apartments: [], bookings: [] });
        }
        res.json(result.rows[0].data);
    } catch (err) {
        console.error("❌ GET hiba:", err);
        res.status(500).json({ error: "Szerver hiba az adatok lekérésekor" });
    }
});

// Adatok mentése a Postgres-be
app.post('/api/data', async (req, res) => {
    try {
        const newData = req.body;
        await pool.query('UPDATE app_state SET data = $1 WHERE id = 1', [newData]);
        res.json({ message: "Adatok sikeresen mentve a Postgres-be!" });
    } catch (err) {
        console.error("❌ POST hiba:", err);
        res.status(500).json({ error: "Hiba a mentés során" });
    }
});

// Új foglalás kezelése
app.post('/api/bookings', async (req, res) => {
    try {
        const newBooking = req.body;
        const result = await pool.query('SELECT data FROM app_state WHERE id = 1');
        let currentData = result.rows[0].data;

        currentData.bookings.push(newBooking);

        const apt = currentData.apartments.find(a => a.name === newBooking.aptName);
        if(apt && newBooking.datesToBlock) {
            apt.bookedDates = [...new Set([...(apt.bookedDates || []), ...newBooking.datesToBlock])];
        }

        await pool.query('UPDATE app_state SET data = $1 WHERE id = 1', [currentData]);
        res.json({ message: "Sikeres foglalás!", bookingId: newBooking.id });
    } catch (err) {
        console.error("❌ Booking hiba:", err);
        res.status(500).json({ error: "Hiba a foglalás rögzítésekor" });
    }
});

// --- 2. STATIKUS FÁJLOK (public mappa) ---
app.use(express.static(path.join(__dirname, 'public')));

// Fallback: Ha semmi nem talált, az index.html-t adjuk vissza
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 A Balaton Essence szerver fut a http://localhost:${PORT} címen!`);
});