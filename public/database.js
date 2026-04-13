// A te domained, amit a Cloudflare véd
const PRODUCTION_URL = 'https://balatonessence.com';

const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_URL = isLocal ? 'http://localhost:8080' : PRODUCTION_URL;

let db = { adminCode: "admin123", owners: [], apartments: [], bookings: [] };

async function initDatabase(callback) {
    try {
        const response = await fetch(`${API_URL}/api/data?t=${Date.now()}`, { cache: 'no-store' });
        if (response.ok) {
            const serverData = await response.json();
            if (serverData && Object.keys(serverData).length > 0) db = serverData;
            if (callback) callback();
        } else {
            console.error("Letöltési hiba:", response.status);
            if (callback) callback();
        }
    } catch (err) {
        console.error("Hálózati hiba:", err);
        if (callback) callback();
    }
}

async function saveDb() {
    try {
        // A mentéshez is adunk időbélyeget, hogy a Cloudflare proxy ne cache-elje a választ
        const response = await fetch(`${API_URL}/api/data?t=${Date.now()}`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
            },
            body: JSON.stringify(db)
        });

        if (response.ok) {
            await new Promise(r => setTimeout(r, 200));
            console.log("✅ Sikeres mentés!");
        } else {
            const errBody = await response.text();
            alert("Hiba a mentésnél (Szerver válasz): " + response.status + " - " + errBody);
        }
    } catch (err) {
        alert("Hálózati hiba! Nem sikerült elküldeni az adatot a szervernek.");
    }
}