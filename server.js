require('dotenv').config(); // Betölti a .env fájlban lévő jelszavakat
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { Pool } = require('pg'); // A Postgres csatlakozó

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Adatbázis kapcsolat felépítése
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Ha a saját gépedről (kívülről) csatlakozol a Railway-hez, ez kell:
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
        
        // Ellenőrizzük, van-e már mentett adatunk. Ha nincs (első indulás), létrehozzuk.
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

// --- API VÉGPONTOK ---

// 1. Adatok lekérése a böngészőnek
app.get('/api/data', async (req, res) => {
    try {
        const result = await pool.query('SELECT data FROM app_state WHERE id = 1');
        res.json(result.rows[0].data);
    } catch (err) {
        res.status(500).json({ error: "Szerver hiba" });
    }
});

// 2. Adatok mentése a Postgres-be
app.post('/api/data', async (req, res) => {
    try {
        const newData = req.body;
        await pool.query('UPDATE app_state SET data = $1 WHERE id = 1', [newData]);
        res.json({ message: "Adatok sikeresen mentve a Postgres-be!" });
    } catch (err) {
        res.status(500).json({ error: "Hiba a mentés során" });
    }
});

// 3. Új foglalás kezelése
app.post('/api/bookings', async (req, res) => {
    try {
        const newBooking = req.body;
        
        // Letöltjük az aktuális állapotot
        const result = await pool.query('SELECT data FROM app_state WHERE id = 1');
        let currentData = result.rows[0].data;

        // Belerakjuk a foglalást
        currentData.bookings.push(newBooking);

        // Zároljuk a naptárat
        const apt = currentData.apartments.find(a => a.name === newBooking.aptName);
        if(apt && newBooking.datesToBlock) {
            apt.bookedDates = [...new Set([...(apt.bookedDates || []), ...newBooking.datesToBlock])];
        }

        // Visszamentjük a frissített állapotot
        await pool.query('UPDATE app_state SET data = $1 WHERE id = 1', [currentData]);

        res.json({ message: "Sikeres foglalás!", bookingId: newBooking.id });
    } catch (err) {
        res.status(500).json({ error: "Hiba a foglalás rögzítésekor" });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 A Balaton Essence szerver fut a http://localhost:${PORT} címen!`);
});