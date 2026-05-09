/* site-mobile.js */
/* Balaton Essence global mobile behaviour */

(function () {
    function ensureMobileButtons() {
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

            button.setAttribute('type', 'button');
            button.setAttribute('aria-expanded', header.classList.contains('mobile-open') ? 'true' : 'false');
        });
    }

    function closeAllMenusExcept(exceptHeader) {
        document.querySelectorAll('.site-header.mobile-open').forEach(function (header) {
            if (header === exceptHeader) return;

            header.classList.remove('mobile-open');

            const button = header.querySelector('.mobile-menu-toggle');
            if (button) {
                button.setAttribute('aria-expanded', 'false');
            }
        });
    }

    function toggleHeader(header) {
        if (!header) return;

        const button = header.querySelector('.mobile-menu-toggle');
        const isOpen = !header.classList.contains('mobile-open');

        closeAllMenusExcept(header);

        header.classList.toggle('mobile-open', isOpen);

        if (button) {
            button.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        }
    }

    function closeHeader(header) {
        if (!header) return;

        header.classList.remove('mobile-open');

        const button = header.querySelector('.mobile-menu-toggle');
        if (button) {
            button.setAttribute('aria-expanded', 'false');
        }
    }

    function initMobileMenu() {
        ensureMobileButtons();

        document.addEventListener('click', function (event) {
            const toggle = event.target.closest('.mobile-menu-toggle');

            if (toggle) {
                event.preventDefault();
                event.stopPropagation();

                const header = toggle.closest('.site-header');
                toggleHeader(header);
                return;
            }

            const navLink = event.target.closest('.site-header .nav-links a');

            if (navLink) {
                const header = navLink.closest('.site-header');
                closeHeader(header);
                return;
            }

            const clickedInsideHeader = event.target.closest('.site-header');

            if (!clickedInsideHeader) {
                closeAllMenusExcept(null);
            }
        }, true);

        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') {
                closeAllMenusExcept(null);
            }
        });

        const observer = new MutationObserver(function () {
            ensureMobileButtons();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMobileMenu);
    } else {
        initMobileMenu();
    }
})();