function initDevNotice() {
    if (sessionStorage.getItem('devModalShown') === 'true') return;

    const modal = document.createElement('div');
    modal.id = 'dev-modal';

    // Kényszerített stílusok (Inline CSS), hogy ne legyen bugos mobilon sem
    Object.assign(modal.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        zIndex: '100000', // Brutál magas z-index, hogy semmi ne takarja ki
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        boxSizing: 'border-box'
    });

    modal.innerHTML = `
        <div style="background-color: #b0413e; color: white; padding: 30px; border-radius: 15px; text-align: center; max-width: 450px; width: 100%; font-family: sans-serif; box-shadow: 0 15px 35px rgba(0,0,0,0.6); border: 2px solid rgba(255,255,255,0.2);">
            <h2 style="margin-top: 0; margin-bottom: 15px; font-size: 1.4rem; letter-spacing: 1px;">Figyelem / Attention</h2>
            <div style="font-size: 0.95rem; line-height: 1.6; margin-bottom: 25px;">
                <p style="margin: 5px 0;"><strong>HU:</strong> Az oldal fejlesztés alatt áll, foglalás jelenleg nem lehetséges.</p>
                <p style="margin: 5px 0;"><strong>EN:</strong> Site under development, booking is currently not possible.</p>
                <p style="margin: 5px 0;"><strong>DE:</strong> Seite in Entwicklung, Buchung derzeit nicht möglich.</p>
            </div>
            <button id="close-dev-modal" style="background-color: white; color: #b0413e; border: none; padding: 14px 40px; font-weight: bold; border-radius: 8px; cursor: pointer; text-transform: uppercase; font-size: 1rem; width: 100%; max-width: 200px; transition: 0.2s;">OK</button>
        </div>
    `;

    document.body.appendChild(modal);

    // Bezárás gomb
    const closeBtn = document.getElementById('close-dev-modal');
    closeBtn.onclick = function() {
        modal.remove();
        sessionStorage.setItem('devModalShown', 'true');
    };

    // Gomb interakció (opcionális finomítás)
    closeBtn.onmousedown = () => closeBtn.style.transform = 'scale(0.95)';
    closeBtn.onmouseup = () => closeBtn.style.transform = 'scale(1)';
}

// Biztonságos indítás
if (document.readyState === 'complete') {
    initDevNotice();
} else {
    window.addEventListener('load', initDevNotice);
}