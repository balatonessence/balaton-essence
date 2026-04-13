const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const ical = require('ical');
const app = express();

// KRITIKUS: Ezt ne vedd lejjebb, mert a Base64 képek megölik a szervert
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// JAVÍTÁS 1: Statikus fájlok kiszolgálása pontos útvonallal
app.use(express.static(__dirname));

const DB_PATH = path.join(__dirname, 'database.js');

// Adatbázis mentés - Konzerválja a struktúrát a Kliens és Szerver között
function saveDatabase(data) {
    try {
        const content = `const db = ${JSON.stringify(data, null, 4)};\n\nif (typeof module !== 'undefined') module.exports = db;`;
        fs.writeFileSync(DB_PATH, content);
        return true;
    } catch (err) {
        console.error("Adatbázis írási hiba:", err);
        return false;
    }
}

// 1. ADMIN MENTÉS (Ingatlanok, Képek, Tulajdonosok)
app.post('/api/save-db', (req, res) => {
    if (saveDatabase(req.body)) {
        res.json({ success: true });
    } else {
        res.status(500).json({ error: "Hiba történt a mentéskor." });
    }
});

// 2. RENDELÉSEK (Morning & Sun aloldalakról)
app.post('/api/order', (req, res) => {
    delete require.cache[require.resolve('./database.js')];
    const db = require('./database.js');
    
    const newOrder = {
        id: "order_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
        ...req.body,
        createdAt: new Date().toISOString()
    };
    
    if (!db.extras) db.extras = [];
    db.extras.push(newOrder);
    
    if (saveDatabase(db)) {
        res.json({ success: true, id: newOrder.id });
    } else {
        res.status(500).json({ error: "Rendelés mentési hiba." });
    }
});

// 3. TÖRLÉSI VÉGPONTOK (Az admin felületről hívható)
app.delete('/api/extras/:id', (req, res) => {
    delete require.cache[require.resolve('./database.js')];
    const db = require('./database.js');
    if (db.extras) {
        db.extras = db.extras.filter(item => item.id !== req.params.id);
        saveDatabase(db);
    }
    res.json({ success: true });
});

app.delete('/api/bookings/:id', (req, res) => {
    delete require.cache[require.resolve('./database.js')];
    const db = require('./database.js');
    if (db.bookings) {
        db.bookings = db.bookings.filter(item => item.id !== req.params.id);
        saveDatabase(db);
    }
    res.json({ success: true });
});

// 4. ICAL SZINKRONIZÁCIÓ (Booking.com, Szallas.hu + Manuális blokkok megőrzése)
app.post('/api/sync', async (req, res) => {
    delete require.cache[require.resolve('./database.js')];
    const db = require('./database.js');
    let hasChange = false;

    for (let apt of db.apartments) {
        let externalDates = [];
        const syncSources = [
            { url: apt.icalBooking, name: 'Booking' },
            { url: apt.icalSzallas, name: 'Szallas' }
        ];

        for (let source of syncSources) {
            if (source.url && source.url.startsWith('http')) {
                try {
                    const response = await axios.get(source.url, { timeout: 10000 });
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
                } catch (e) {
                    console.error(`Hiba a ${source.name} szinkronizálásakor (${apt.name}):`, e.message);
                }
            }
        }
        
        const manualBlocks = apt.manualBlocks || [];
        const combinedDates = [...new Set([...externalDates, ...manualBlocks])].sort();

        if (JSON.stringify(apt.bookedDates) !== JSON.stringify(combinedDates)) {
            apt.bookedDates = combinedDates;
            hasChange = true;
        }
    }

    if (hasChange) {
        saveDatabase(db);
        res.json({ success: true, status: "Adatok frissítve." });
    } else {
        res.json({ success: true, status: "Nincs szükség frissítésre." });
    }
});

// 5. EGÉSZSÉGÜGYI VÉGPONT (Railway-nek)
app.get('/health', (req, res) => res.status(200).send('OK'));

// JAVÍTÁS 2: Főoldal kiszolgálása és hibakezelés
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('*', (req, res) => {
    const filePath = path.join(__dirname, 'index.html');
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).send("Az index.html nem található a szerveren!");
    }
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`-----------------------------------------`);
    console.log(`Szerver sikeresen elindult! Port: ${PORT}`);
    console.log(`-----------------------------------------`);
});