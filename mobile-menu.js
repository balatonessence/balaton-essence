(function () {
    function initMobileMenu() {
        const header = document.getElementById('site-header');
        const button = document.querySelector('.mobile-menu-toggle');

        if (!header || !button) return;

        button.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            header.classList.toggle('mobile-open');
        });

        const menuLinks = header.querySelectorAll('.nav-links a');

        menuLinks.forEach(link => {
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
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMobileMenu);
    } else {
        initMobileMenu();
    }
})();