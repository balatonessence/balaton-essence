// A szerverünk belső címe
const API_URL = '/api';

let db = { apartments: [], bookings: [], owners: [] };

async function loadDbFromServer() {
    try {
        const response = await fetch(`${API_URL}/data`);
        if (response.ok) {
            db = await response.json();
            if (typeof render === 'function') render(); 
        }
    } catch (error) {
        console.error("Hiba az adatok letöltésekor:", error);
    }
}

async function saveDb() {
    try {
        await fetch(`${API_URL}/data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(db)
        });
    } catch (error) {
        console.error("Hiba a mentésnél:", error);
    }
}

// Oldal betöltésekor egyből lekérjük az adatokat
loadDbFromServer();