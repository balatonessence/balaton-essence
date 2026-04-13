// public/database.js
let db = { apartments: [], owners: [], bookings: [], extras: [] };

async function initDatabase() {
    try {
        // Itt elkérjük a szervertől a Postgres-ben tárolt adatokat
        const res = await fetch('/api/get-db-content'); // Ehhez kell egy új GET végpont a szerverbe
        if (res.ok) {
            const data = await res.json();
            db = data;
        }
    } catch (e) { console.error("Hiba az adatok betöltésekor", e); }
}