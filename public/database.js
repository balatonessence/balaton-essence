const PRODUCTION_URL = 'https://balatonessence.com';
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_URL = isLocal ? 'http://localhost:8080' : PRODUCTION_URL;

let db = { adminCode: "admin123", owners: [], apartments: [], bookings: [] };

// 1. ADATOK BETÖLTÉSE
async function initDatabase(callback) {
    try {
        const response = await fetch(`${API_URL}/api/data?t=${Date.now()}`, { cache: 'no-store' });
        if (response.ok) {
            const serverData = await response.json();
            if (serverData && Object.keys(serverData).length > 0) db = serverData;
            console.log("✅ Postgres adatok betöltve.");
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

// 2. ADATOK MENTÉSE (ADMIN)
async function saveDb() {
    try {
        console.log("📤 Mentés indítása a Postgres-be...");
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
            alert("Hiba a mentésnél: " + response.status + " - Az adatok túl nagyok vagy hálózati hiba történt.");
        }
    } catch (err) {
        alert("Hálózati hiba! Nem sikerült elérni a szervert.");
    }
}

// 3. INTELLIGENS KÉPTÖMÖRÍTŐ (Megelőzi a 413-as hibát)
async function compressImage(file, maxWidth = 1200, quality = 0.7) {
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
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
        };
    });
}