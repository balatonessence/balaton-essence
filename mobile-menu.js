function toggleMobileMenu() {
    const header = document.getElementById('site-header') || document.querySelector('.site-header');
    if (!header) return;

    header.classList.toggle('mobile-open');
}

document.addEventListener('click', function(event) {
    const header = document.getElementById('site-header') || document.querySelector('.site-header');
    if (!header) return;

    if (!header.contains(event.target)) {
        header.classList.remove('mobile-open');
    }
});

document.addEventListener('keydown', function(event) {
    if (event.key !== 'Escape') return;

    const header = document.getElementById('site-header') || document.querySelector('.site-header');
    if (!header) return;

    header.classList.remove('mobile-open');
});