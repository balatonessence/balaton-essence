// database.js - Balaton Essence Központi Adatbázis
const defaultDb = {
    adminCode: "admin123",
    owners: [
        { id: "O1", name: "Kovács János", accessCode: "kovacs01" },
        { id: "O2", name: "Nagy Éva", accessCode: "eva1985" }
    ],
    apartments: [
        { 
            id: 1, name: "Aranypart Rezidencia", location: "Siófok", price: 45000, 
            ownerId: "O1", occupancy: 85, status: "active",
            desc: "Siófok legszebb panorámás luxuslakása.",
            bookedDates: [], mainImage: "", gallery: [] 
        },
        { 
            id: 2, name: "Tihanyi Búvóhely", location: "Tihany", price: 52000, 
            ownerId: "O2", occupancy: 70, status: "active",
            desc: "Exkluzív nyugalom a félsziget szívében.",
            bookedDates: [], mainImage: "", gallery: [] 
        },
        { 
            id: 3, name: "Füredi Vitorlás", location: "Balatonfüred", price: 48000, 
            ownerId: "O1", occupancy: 40, status: "active",
            desc: "Modern elegancia pár percre a kikötőtől.",
            bookedDates: [], mainImage: "", gallery: [] 
        }
    ],
    bookings: [] // Forrás példák: 'direct', 'booking.com', 'szallas.hu'
};

let db = JSON.parse(localStorage.getItem('balatonDb'));
if (!db || !db.apartments || db.apartments.length === 0) {
    db = defaultDb;
    localStorage.setItem('balatonDb', JSON.stringify(db));
}

function saveDb() {
    localStorage.setItem('balatonDb', JSON.stringify(db));
}