const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const ical = require('ical');
const app = express();

// Megnövelt limit a nagyfelbontású képek (Base64) mentéséhez
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(express.static('.'));

const DB_PATH = path.join(__dirname, 'database.js');

// Biztonságos mentés: nem csak felülír, hanem megőrzi a JS struktúrát
function saveDatabase(data) {
    try {
        const content = `const db = ${JSON.stringify(data, null, 4)};\n\nif (typeof module !== 'undefined') module.exports = db;`;
        fs.writeFileSync(DB_PATH, content);
        return true;
    } catch (err) {
        console.error("Hiba az adatbázis mentésekor:", err);
        return false;
    }
}

// 1. TELJES ADATBÁZIS MENTÉS (Admin: Apartmanok, Tulajok, Kódok módosítása)
app.post('/api/save-db', (req, res) => {
    if (saveDatabase(req.body)) {
        res.json({ success: true });
    } else {
        res.status(500).json({ error: "Mentési hiba történt a szerveren." });
    }
});

// 2. RENDELÉSEK KEZELÉSE (Morning, Sun aloldalakról)
app.post('/api/order', (req, res) => {
    // Friss adatbázis betöltése a memóriába
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
        res.json({ success: true, orderId: newOrder.id });
    } else {
        res.status(500).json({ error: "Rendelés mentési hiba." });
    }
});

// 3. TÖRLÉSI VÉGPONTOK (Admin törlés gombokhoz)
// Bérlések és reggelik törlése
app.delete('/api/extras/:id', (req, res) => {
    delete require.cache[require.resolve('./database.js')];
    const db = require('./database.js');
    
    const initialLength = db.extras ? db.extras.length : 0;
    db.extras = db.extras.filter(item => item.id !== req.params.id);
    
    saveDatabase(db);
    res.json({ success: true, deleted: db.extras.length < initialLength });
});

// Apartman foglalások törlése
app.delete('/api/bookings/:id', (req, res) => {
    delete require.cache[require.resolve('./database.js')];
    const db = require('./database.js');
    
    db.bookings = db.bookings.filter(item => item.id !== req.params.id);
    saveDatabase(db);
    res.json({ success: true });
});

// 4. ICAL NAPTÁR SZINKRONIZÁCIÓ (Booking.com, Szallas.hu)
app.post('/api/sync', async (req, res) => {
    delete require.cache[require.resolve('./database.js')];
    const db = require('./database.js');
    let hasChange = false;

    for (let apt of db.apartments) {
        let allDates = [];
        const syncUrls = [
            { url: apt.icalBooking, source: 'Booking' },
            { url: apt.icalSzallas, source: 'Szallas' }
        ];

        for (let sync of syncUrls) {
            if (sync.url && sync.url.startsWith('http')) {
                try {
                    const response = await axios.get(sync.url, { timeout: 10000 });
                    const data = ical.parseICS(response.data);
                    for (let k in data) {
                        if (data[k].type === 'VEVENT') {
                            let start = new Date(data[k].start);
                            let end = new Date(data[k].end);
                            // Napok kiszámolása a két dátum között
                            while (start < end) {
                                allDates.push(start.toISOString().split('T')[0]);
                                start.setDate(start.getDate() + 1);
                            }
                        }
                    }
                } catch (e) {
                    console.error(`Sync hiba: ${sync.source} - ${apt.name}`, e.message);
                }
            }
        }
        
        // Csak az egyedi dátumok megtartása
        const uniqueDates = [...new Set(allDates)].sort();
        // Ellenőrizzük, történt-e valódi változás
        if (JSON.stringify(apt.bookedDates) !== JSON.stringify(uniqueDates)) {
            apt.bookedDates = uniqueDates;
            hasChange = true;
        }
    }

    if (hasChange) {
        saveDatabase(db);
        res.json({ success: true, status: "Változások mentve." });
    } else {
        res.json({ success: true, status: "Minden naptár naprakész." });
    }
});

// 5. EGÉSZSÉGÜGYI ELLENŐRZÉS (Railway/Szerver figyeléshez)
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`-------------------------------------------`);
    console.log(`Balaton Essence Server aktív! Port: ${PORT}`);
    console.log(`Adatbázis elérési út: ${DB_PATH}`);
    console.log(`-------------------------------------------`);
});