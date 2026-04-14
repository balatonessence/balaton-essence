// public/database.js
var db = { apartments: [], owners: [], bookings: [], extras: [] };

async function initDatabase(callback) {
    try {
        const timestamp = new Date().getTime();
        const res = await fetch('/api/get-db-content?t=' + timestamp, { cache: 'no-store' });
        if (res.ok) {
            const data = await res.json();
            if (data) db = data;
            if (callback) callback();
        }
    } catch (e) { console.error("Hiba az adatok betöltésekor:", e); }
}

// --- JAVÍTOTT ÁRMOTOR ---
function getAptStatusAndPrice(apt, targetDate = new Date()) {
    const dateStr = targetDate.toISOString().split('T')[0];
    const month = targetDate.getMonth() + 1; // 1-12
    const day = targetDate.getDate();

    // 1. Foglalási ablak ellenőrzése (Április 1 - Szeptember 30)
    const isInsideGlobalWindow = (month > 4 || (month === 4 && day >= 1)) && 
                                 (month < 9 || (month === 9 && day <= 30));

    // Ha szezonon kívül vagyunk
    if (!isInsideGlobalWindow) {
        return { 
            status: 'CLOSED', 
            price: null, 
            label: 'Jelenleg zárva', 
            minNights: 0, 
            maxGuests: 2 
        };
    }

    // 2. Szezon keresése az adott napra
    if (apt.seasons && apt.seasons.length > 0) {
        for (let s of apt.seasons) {
            if (dateStr >= s.start && dateStr <= s.end) {
                return { 
                    status: 'OPEN', 
                    price: s.price, 
                    label: s.name, 
                    minNights: s.minNights || 2, 
                    maxGuests: s.maxGuests || 2 // Itt a javítás: ha nincs kitöltve, akkor 2
                };
            }
        }
    }

    // 3. Fallback: Ha nyitvatartási időben vagyunk, de nincs külön szezon definiálva
    return { 
        status: 'OPEN', 
        price: apt.price || 0, 
        label: 'Alapár', 
        minNights: 2, 
        maxGuests: 2 
    };
}