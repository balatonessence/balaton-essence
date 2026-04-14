// public/database.js
var db = { apartments: [], owners: [], bookings: [], extras: [] };

async function initDatabase(callback) {
    try {
        // A "?t=" és a "cache: 'no-store'" garantálja, hogy SOHA ne kapj beragadt cache-t!
        const timestamp = new Date().getTime();
        const res = await fetch('/api/get-db-content?t=' + timestamp, {
            cache: 'no-store'
        });
        
        if (res.ok) {
            const data = await res.json();
            if (data) {
                // Biztosítjuk, hogy a tömbök mindig létezzenek, még ha üres is a DB
                db.apartments = data.apartments || [];
                db.owners = data.owners || [];
                db.bookings = data.bookings || [];
                db.extras = data.extras || [];
            }
            if (callback) callback();
        }
    } catch (e) {
        console.error("Hiba az adatok betöltésekor:", e);
    }
}