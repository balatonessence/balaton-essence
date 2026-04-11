// Alapértelmezett állapot, ha a szerver nem válaszolna
let db = { adminCode: "admin123", owners: [], apartments: [], bookings: [] };

// 1. Az adatbázis betöltése a Node.js (Railway) szerverről
async function initDatabase(callback) {
    try {
        console.log("Adatok lekérése a Postgres adatbázisból...");
        
        // Hozzáadunk egy időbélyeget az URL-hez, hogy a böngésző véletlenül se cache-elje
        const response = await fetch('/api/data?t=' + Date.now(), { cache: 'no-store' });
        
        if (response.ok) {
            const serverData = await response.json();
            
            // Ha a szerverről jövő adat valid, átvesszük, különben marad az alapértelmezett
            if (serverData) {
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
        const response = await fetch('/api/data', {
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