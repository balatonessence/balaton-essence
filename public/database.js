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

function getAptStatusAndPrice(apt, date = new Date(), guests = 2) {
    if (!apt) {
        return {
            status: 'CLOSED',
            price: 0,
            label: '',
            minNights: 1,
            maxGuests: 2
        };
    }

    const seasons = Array.isArray(apt.seasons) ? apt.seasons : [];

    if (seasons.length === 0) {
        return {
            status: 'CLOSED',
            price: 0,
            label: '',
            minNights: 1,
            maxGuests: Number(apt.maxGuests || 2)
        };
    }

    const selectedDate = new Date(date);
    const selectedMonthDay = String(selectedDate.getMonth() + 1).padStart(2, '0') + '-' + String(selectedDate.getDate()).padStart(2, '0');

    const getMonthDay = (dateStr) => {
        if (!dateStr) return '';

        const parts = String(dateStr).split('-');

        if (parts.length !== 3) return '';

        return `${parts[1]}-${parts[2]}`;
    };

    const isDateInSeason = (season) => {
        const startMonthDay = getMonthDay(season.start);
        const endMonthDay = getMonthDay(season.end);

        if (!startMonthDay || !endMonthDay) return false;

        if (startMonthDay <= endMonthDay) {
            return selectedMonthDay >= startMonthDay && selectedMonthDay <= endMonthDay;
        }

        return selectedMonthDay >= startMonthDay || selectedMonthDay <= endMonthDay;
    };

    const activeSeason = seasons.find(isDateInSeason);

    if (!activeSeason) {
        return {
            status: 'CLOSED',
            price: 0,
            label: '',
            minNights: 1,
            maxGuests: Number(apt.maxGuests || 2)
        };
    }

    let price = Number(activeSeason.price || 0);

    if (Number(guests) === 3 && Number(activeSeason.price3 || 0) > 0) {
        price = Number(activeSeason.price3);
    }

    if (Number(guests) >= 4 && Number(activeSeason.price4 || 0) > 0) {
        price = Number(activeSeason.price4);
    }

    return {
        status: 'OPEN',
        price,
        label: activeSeason.name || '',
        minNights: Number(activeSeason.minNights || 1),
        maxGuests: Number(activeSeason.maxGuests || apt.maxGuests || 2)
    };
}