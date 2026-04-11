// Globális változó, ami garantálja, hogy a tömbök alapból léteznek
let db = { adminCode: "admin123", owners: [], apartments: [], bookings: [] };

// 1. Az adatbázis betöltése a Node.js (Railway) szerverről
async function initDatabase(callback) {
    try {
        console.log("Adatok lekérése a Postgres adatbázisból...");
        
        // A cache: 'no-store' kényszeríti a böngészőt, hogy a legfrissebb adatot kérje
        const response = await fetch('/api/data', { cache: 'no-store' });
        
        if (response.ok) {
            const serverData = await response.json();
            
            // --- ADATGYÓGYÍTÁS (Data Healing) ---
            // Ha a szerverről jövő adatból hiányzik valami, pótoljuk üres tömbbel!
            // Így a weboldal render() függvénye soha nem fog összeomlani.
            db.adminCode = serverData.adminCode || "admin123";
            db.owners = serverData.owners || [];
            db.apartments = serverData.apartments || [];
            db.bookings = serverData.bookings || [];
            
            console.log("✅ Adatok sikeresen betöltve és ellenőrizve!");
            
            // Megrajzoljuk a felületet
            if (callback) callback();
        } else {
            console.error("Hiba az adatok lekérésekor a szerverről.");
        }
    } catch (error) {
        console.error("Hálózati hiba az adatbázis betöltésekor:", error);
    }
}

// 2. Az összes adat visszamentése a Postgres szerverre
async function saveDb() {
    try {
        console.log("Mentés folyamatban...");
        const response = await fetch('/api/data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(db)
        });

        if (response.ok) {
            console.log("✅ Sikeresen mentve a Postgres adatbázisba!");
        } else {
            console.error("Hiba a mentés során.");
        }
    } catch (error) {
        console.error("Hálózati hiba a mentés során:", error);
    }
}