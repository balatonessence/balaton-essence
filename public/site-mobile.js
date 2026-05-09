/* site-mobile.js */
/* Balaton Essence global mobile behaviour */

(function () {
    function closeLanguageDropdowns(header) {
        if (!header) return;

        header.querySelectorAll('.lang-dropdown.lang-open').forEach(function (dropdown) {
            dropdown.classList.remove('lang-open');
        });
    }

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

        if (!isOpen) {
            closeLanguageDropdowns(header);
        }

        document.body.classList.toggle(
            'mobile-menu-active',
            document.querySelectorAll('.site-header.mobile-open').length > 0
        );
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
            const menuButton = event.target.closest('.mobile-menu-toggle');

            if (menuButton) {
                event.preventDefault();
                event.stopPropagation();

                const header = menuButton.closest('.site-header');
                const shouldOpen = !header.classList.contains('mobile-open');

                closeAllMenus();
                setMenuState(header, shouldOpen);

                return;
            }

            const langButton = event.target.closest('.site-header .lang-btn');

            if (langButton) {
                event.preventDefault();
                event.stopPropagation();

                const dropdown = langButton.closest('.lang-dropdown');
                const header = langButton.closest('.site-header');

                if (!dropdown || !header) return;

                header.querySelectorAll('.lang-dropdown.lang-open').forEach(function (otherDropdown) {
                    if (otherDropdown !== dropdown) {
                        otherDropdown.classList.remove('lang-open');
                    }
                });

                dropdown.classList.toggle('lang-open');

                return;
            }

            const langLink = event.target.closest('.site-header .lang-content a');

            if (langLink) {
                closeAllMenus();
                return;
            }

            const navLink = event.target.closest('.site-header .nav-links a');

            if (navLink) {
                closeAllMenus();
                return;
            }

            const clickedInsideHeader = event.target.closest('.site-header');

            if (!clickedInsideHeader) {
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