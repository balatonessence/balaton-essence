// Intelligens API URL meghatározás
// Ha helyi gépen tesztelsz (pl. Live Server az 5500-as porton), a 8080-as Node szerverhez fordul.
// Ha élesben fut (Railway / saját domain), akkor relatív útvonalat használ.
const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_BASE_URL = isLocalhost ? 'http://localhost:8080' : '';

// Alapértelmezett állapot, ha a szerver nem válaszolna
let db = { adminCode: "admin123", owners: [], apartments: [], bookings: [] };

// 1. Az adatbázis betöltése a Node.js (Railway) szerverről
async function initDatabase(callback) {
    try {
        console.log("Adatok lekérése a Postgres adatbázisból...");
        
        // Dinamikus API URL használata a cache elkerülésével
        const response = await fetch(`${API_BASE_URL}/api/data?t=${Date.now()}`, { cache: 'no-store' });
        
        if (response.ok) {
            const serverData = await response.json();
            
            // Ha a szerverről jövő adat valid, átvesszük, különben marad az alapértelmezett
            if (serverData && Object.keys(serverData).length > 0) {
                db.adminCode = serverData.adminCode || "admin123";
                db.owners = serverData.owners || [];
                db.apartments = serverData.apartments || [];
                db.bookings = serverData.bookings || [];
            }
            
            console.log("✅ Adatok betöltve:", db);
            if (callback) callback();
        } else {
            console.error("❌ Hiba a letöltésnél:", response.status);
            if (callback) callback(); // Akkor is rajzoljunk, ha üres
        }
    } catch (error) {
        console.error("❌ Hálózati hiba:", error);
        if (callback) callback();
    }
}

// 2. Az összes adat visszamentése a Postgres szerverre
async function saveDb() {
    try {
        console.log("📤 Mentés a szerverre...");
        
        const response = await fetch(`${API_BASE_URL}/api/data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(db)
        });

        if (response.ok) {
            console.log("✅ Mentve a Postgres-be!");
            // Egy kis villanásnyi várakozás, hogy a Postgres biztosan végezzen a háttérben
            await new Promise(r => setTimeout(r, 100));
        } else {
            const errBody = await response.text();
            console.error("❌ Szerver hiba a mentésnél:", errBody);
            alert("Hiba a mentés során: " + response.status);
        }
    } catch (error) {
        console.error("❌ Hálózati hiba a mentésnél:", error);
    }
}