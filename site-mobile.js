(function () {
    function initMobileMenu() {
        document.querySelectorAll('.site-header').forEach(function (header) {
            const nav = header.querySelector('.nav-links');
            const logo = header.querySelector('.logo-container');

            if (!nav) return;

            let button = header.querySelector('.mobile-menu-toggle');

            if (!button) {
                button = document.createElement('button');
                button.className = 'mobile-menu-toggle';
                button.type = 'button';
                button.setAttribute('aria-label', 'Menü megnyitása');
                button.setAttribute('aria-expanded', 'false');
                button.innerHTML = '<span></span><span></span><span></span>';

                if (logo) {
                    logo.insertAdjacentElement('afterend', button);
                } else {
                    header.insertBefore(button, nav);
                }
            }

            button.addEventListener('click', function (event) {
                event.preventDefault();
                event.stopPropagation();

                const isOpen = header.classList.toggle('mobile-open');
                button.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            });

            nav.querySelectorAll('a').forEach(function (link) {
                link.addEventListener('click', function () {
                    header.classList.remove('mobile-open');
                    button.setAttribute('aria-expanded', 'false');
                });
            });
        });

        document.addEventListener('click', function (event) {
            document.querySelectorAll('.site-header.mobile-open').forEach(function (header) {
                if (!header.contains(event.target)) {
                    header.classList.remove('mobile-open');

                    const button = header.querySelector('.mobile-menu-toggle');
                    if (button) button.setAttribute('aria-expanded', 'false');
                }
            });
        });

        document.addEventListener('keydown', function (event) {
            if (event.key !== 'Escape') return;

            document.querySelectorAll('.site-header.mobile-open').forEach(function (header) {
                header.classList.remove('mobile-open');

                const button = header.querySelector('.mobile-menu-toggle');
                if (button) button.setAttribute('aria-expanded', 'false');
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMobileMenu);
    } else {
        initMobileMenu();
    }
})();