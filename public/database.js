// Globális változó, ami tárolja az adatokat a memóriában, amíg az oldal nyitva van
let db = { adminCode: "", owners: [], apartments: [], bookings: [] };

// 1. Az adatbázis betöltése a Node.js (Railway) szerverről
async function initDatabase(callback) {
    try {
        console.log("Adatok lekérése a Postgres adatbázisból...");
        const response = await fetch('/api/data');
        
        if (response.ok) {
            db = await response.json();
            console.log("✅ Adatok sikeresen betöltve!");
            
            // Ha betöltött minden, lefuttatjuk a felületet megrajzoló függvényt
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
            headers: {
                'Content-Type': 'application/json'
            },
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