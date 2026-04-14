let db = { apartments: [], owners: [], bookings: [], extras: [] };

async function initDatabase(callback) {
    try {
        const res = await fetch('/api/get-db-content');
        if (res.ok) {
            const data = await res.json();
            if (data) db = data; // Frissítjük a memóriát a Postgres adataival
            if (callback) callback(); // Szólunk az admin.html-nek, hogy rajzolja ki
        }
    } catch (e) {
        console.error("Hiba az adatok betöltésekor", e);
    }
}