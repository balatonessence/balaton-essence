/* site-mobile.js */
/* Balaton Essence global mobile behaviour */

(function () {
    function setMenuState(header, isOpen) {
        if (!header) return;

        const button = header.querySelector('.mobile-menu-toggle');
        const nav = header.querySelector('.nav-links');

        header.classList.toggle('mobile-open', isOpen);

        if (button) {
            button.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            button.setAttribute('aria-label', isOpen ? 'Menü bezárása' : 'Menü megnyitása');
        }

        if (nav) {
            nav.classList.toggle('is-open', isOpen);
        }

        document.body.classList.toggle('mobile-menu-active', isOpen);
    }

    function closeAllMenus() {
        document.querySelectorAll('.site-header.mobile-open').forEach(function (header) {
            setMenuState(header, false);
        });
    }

    function ensureMobileButton(header) {
        if (!header) return;

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

        button.type = 'button';
    }

    function initMobileMenu() {
        document.querySelectorAll('.site-header').forEach(ensureMobileButton);

        document.addEventListener('click', function (event) {
            const toggle = event.target.closest('.mobile-menu-toggle');

            if (toggle) {
                event.preventDefault();

                const header = toggle.closest('.site-header');
                const willOpen = !header.classList.contains('mobile-open');

                closeAllMenus();
                setMenuState(header, willOpen);

                return;
            }

            const navLink = event.target.closest('.site-header .nav-links a');

            if (navLink) {
                closeAllMenus();
                return;
            }

            if (!event.target.closest('.site-header')) {
                closeAllMenus();
            }
        });

        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') {
                closeAllMenus();
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMobileMenu);
    } else {
        initMobileMenu();
    }
})();