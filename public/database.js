const PRODUCTION_URL = 'https://balatonessence.com';
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_URL = isLocal ? 'http://localhost:8080' : PRODUCTION_URL;

// Alapértelmezett adatok, ha a szerver üres lenne
let db = { 
    adminCode: "admin123", 
    owners: [], 
    apartments: [], 
    bookings: [] 
};

async function initDatabase(callback) {
    try {
        console.log("Adatok lekérése a Postgres adatbázisból...");
        const response = await fetch(`${API_URL}/api/data?t=${Date.now()}`, { cache: 'no-store' });
        
        if (response.ok) {
            const serverData = await response.json();
            // Csak akkor írjuk felül, ha kaptunk értékelhető adatot
            if (serverData && typeof serverData === 'object') {
                db = serverData;
                // Ha valamiért hiányozna a kód az objektumból, pótoljuk
                if (!db.adminCode) db.adminCode = "admin123";
            }
            console.log("✅ Adatok betöltve:", db);
            if (callback) callback();
        } else {
            console.error("Szerver hiba a betöltésnél.");
            if (callback) callback();
        }
    } catch (err) {
        console.error("Hálózati hiba:", err);
        if (callback) callback();
    }
}

async function saveDb() {
    try {
        // Mentés előtt ellenőrizzük, hogy véletlenül ne töröljük ki a kódot
        if (!db.adminCode) db.adminCode = "admin123";

        const response = await fetch(`${API_URL}/api/data?t=${Date.now()}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(db)
        });

        if (response.ok) {
            console.log("✅ Mentés sikeres a Postgres-be.");
        } else {
            alert("Szerver hiba mentéskor: " + response.status);
        }
    } catch (err) {
        alert("Kapcsolati hiba a mentésnél!");
    }
}

async function compressImage(file, maxWidth = 1000, quality = 0.6) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                if (width > maxWidth) {
                    height = (maxWidth / width) * height;
                    width = maxWidth;
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/webp', quality));
            };
        };
    });
}