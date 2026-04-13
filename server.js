require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.options('*', cors());

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } 
});

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
            const defaultData = { adminCode: "admin123", owners: [], apartments: [], bookings: [] };
            await pool.query('INSERT INTO app_state (id, data) VALUES (1, $1)', [defaultData]);
            console.log("✅ Adatbázis inicializálva.");
        }
    } catch (err) {
        console.error("❌ Adatbázis hiba:", err);
    }
}
initDb();

// --- API VÉGPONTOK ---

// Teszt végpont, hogy tudd ellenőrizni a frissítést
app.get('/api/ping', (req, res) => res.send('PONG - A szerver frissítve és fut!'));

app.get('/api/data', async (req, res) => {
    try {
        const result = await pool.query('SELECT data FROM app_state WHERE id = 1');
        res.json(result.rows[0].data);
    } catch (err) {
        res.status(500).json({ error: "Lekérdezési hiba" });
    }
});

app.post('/api/data', async (req, res) => {
    try {
        const newData = req.body;
        await pool.query('UPDATE app_state SET data = $1 WHERE id = 1', [newData]);
        res.json({ message: "Sikeres mentés!" });
    } catch (err) {
        res.status(500).json({ error: "Mentési hiba" });
    }
});

// Statikus mappa
app.use(express.static(path.join(__dirname, 'public')));

// SPA Fallback
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Szerver fut a ${PORT} porton!`);
});