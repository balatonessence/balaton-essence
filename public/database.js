const PRODUCTION_URL = 'https://balatonessence.com';
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_URL = isLocal ? 'http://localhost:8080' : PRODUCTION_URL;

let db = { adminCode: "admin123", owners: [], apartments: [], bookings: [] };

async function initDatabase(callback) {
    try {
        const response = await fetch(`${API_URL}/api/data?t=${Date.now()}`);
        if (response.ok) {
            db = await response.json();
            if (callback) callback();
        }
    } catch (err) { console.error(err); if (callback) callback(); }
}

async function saveDb() {
    await fetch(`${API_URL}/api/data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(db)
    });
}

async function compressImage(file, maxWidth = 1000) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let w = img.width, h = img.height;
                if (w > maxWidth) { h = (maxWidth / w) * h; w = maxWidth; }
                canvas.width = w; canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/webp', 0.7));
            };
        };
    });
}   