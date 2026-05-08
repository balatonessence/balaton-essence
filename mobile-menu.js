function toggleMobileMenu() {
    const header = document.getElementById('site-header') || document.querySelector('.site-header');
    if (!header) return;

    header.classList.toggle('mobile-open');
}

document.addEventListener('DOMContentLoaded', function () {
    const header = document.getElementById('site-header') || document.querySelector('.site-header');
    const toggle = document.querySelector('.mobile-menu-toggle');

    if (!header || !toggle) {
        console.warn('Mobile menu: header vagy gomb nem található.');
        return;
    }

    toggle.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        toggleMobileMenu();
    });

    header.querySelectorAll('.nav-links a').forEach(link => {
        link.addEventListener('click', function () {
            header.classList.remove('mobile-open');
        });
    });

    document.addEventListener('click', function (event) {
        if (!header.contains(event.target)) {
            header.classList.remove('mobile-open');
        }
    });

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') {
            header.classList.remove('mobile-open');
        }
    });
});