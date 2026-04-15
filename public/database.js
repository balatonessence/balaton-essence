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

function getAptStatusAndPrice(apt, targetDate = new Date(), guestCount = 2) {
    const dateStr = targetDate.toISOString().split('T')[0];
    const month = targetDate.getMonth() + 1;
    const day = targetDate.getDate();

    const isInsideGlobalWindow = (month > 4 || (month === 4 && day >= 1)) && 
                                 (month < 9 || (month === 9 && day <= 30));

    if (!isInsideGlobalWindow) {
        return { status: 'CLOSED', price: null, label: 'Zárva', maxGuests: 4 };
    }

    if (apt.seasons && apt.seasons.length > 0) {
        for (let s of apt.seasons) {
            if (dateStr >= s.start && dateStr <= s.end) {
                let finalPrice = s.price; 
                if (guestCount == 3 && s.price3) finalPrice = s.price3;
                if (guestCount >= 4 && s.price4) finalPrice = s.price4;

                return { 
                    status: 'OPEN', 
                    price: finalPrice, 
                    label: s.name, 
                    minNights: s.minNights || 2, 
                    maxGuests: s.maxGuests || 4 
                };
            }
        }
    }

    return { status: 'OPEN', price: apt.price || 0, label: 'Alapár', minNights: 2, maxGuests: 2 };
}