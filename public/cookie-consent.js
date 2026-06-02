window.BE_COOKIE_CONFIG = window.BE_COOKIE_CONFIG || {
    googleAnalyticsId: 'G-E5J0Z7Y03K',
    metaPixelId: ''
};

(function () {
    const CONSENT_KEY = 'balatonEssenceCookieConsent';
    const CONSENT_VERSION = 1;

    const translations = {
        hu: {
            kicker: 'Sütibeállítások',
            title: 'A jobb működéshez sütiket használunk.',
            text: 'A szükséges sütik az oldal működéséhez kellenek. A statisztikai és marketing sütiket csak hozzájárulás után használjuk.',
            acceptAll: 'Elfogadom',
            rejectAll: 'Elutasítom',
            settings: 'Beállítások',
            modalTitle: 'Sütibeállítások',
            modalText: 'Itt módosíthatod, milyen sütiket engedélyezel. A szükséges sütik mindig aktívak.',
            necessaryTitle: 'Szükséges sütik',
            necessaryText: 'Az oldal alapvető működéséhez, biztonságához és a foglalási folyamat használatához szükségesek.',
            analyticsTitle: 'Statisztikai sütik',
            analyticsText: 'Segítenek megérteni, hogyan használják a látogatók az oldalt, hogy javítani tudjuk a működését.',
            marketingTitle: 'Marketing sütik',
            marketingText: 'Hirdetések, remarketing és kampánymérés céljára használhatók.',
            save: 'Mentés',
            floating: 'Sütik'
        },
        en: {
            kicker: 'Cookie settings',
            title: 'We use cookies to improve the website.',
            text: 'Necessary cookies keep the website working. Analytics and marketing cookies are used only after your consent.',
            acceptAll: 'Accept all',
            rejectAll: 'Reject all',
            settings: 'Settings',
            modalTitle: 'Cookie settings',
            modalText: 'You can choose which cookies you allow. Necessary cookies are always active.',
            necessaryTitle: 'Necessary cookies',
            necessaryText: 'Required for core website functions, security and the booking flow.',
            analyticsTitle: 'Analytics cookies',
            analyticsText: 'Help us understand how visitors use the website so we can improve it.',
            marketingTitle: 'Marketing cookies',
            marketingText: 'May be used for ads, remarketing and campaign measurement.',
            save: 'Save',
            floating: 'Cookies'
        },
        de: {
            kicker: 'Cookie-Einstellungen',
            title: 'Wir verwenden Cookies, um die Website zu verbessern.',
            text: 'Notwendige Cookies sichern die Funktion der Website. Statistik- und Marketing-Cookies nutzen wir nur nach Ihrer Zustimmung.',
            acceptAll: 'Alle akzeptieren',
            rejectAll: 'Ablehnen',
            settings: 'Einstellungen',
            modalTitle: 'Cookie-Einstellungen',
            modalText: 'Hier können Sie auswählen, welche Cookies Sie erlauben. Notwendige Cookies sind immer aktiv.',
            necessaryTitle: 'Notwendige Cookies',
            necessaryText: 'Erforderlich für Grundfunktionen, Sicherheit und den Buchungsablauf.',
            analyticsTitle: 'Statistik-Cookies',
            analyticsText: 'Helfen uns zu verstehen, wie Besucher die Website nutzen, damit wir sie verbessern können.',
            marketingTitle: 'Marketing-Cookies',
            marketingText: 'Können für Werbung, Remarketing und Kampagnenmessung verwendet werden.',
            save: 'Speichern',
            floating: 'Cookies'
        }
    };

    function getLang() {
        const path = window.location.pathname.toLowerCase();

        if (path.startsWith('/en/')) return 'en';
        if (path.startsWith('/de/')) return 'de';

        return 'hu';
    }

    function getText() {
        return translations[getLang()] || translations.hu;
    }

    function getStoredConsent() {
        try {
            const raw = localStorage.getItem(CONSENT_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || parsed.version !== CONSENT_VERSION) return null;
            return parsed;
        } catch (err) {
            return null;
        }
    }

    function saveConsent(settings) {
        const consent = {
            version: CONSENT_VERSION,
            necessary: true,
            analytics: settings.analytics === true,
            marketing: settings.marketing === true,
            savedAt: new Date().toISOString()
        };

        localStorage.setItem(CONSENT_KEY, JSON.stringify(consent));
        window.dispatchEvent(new CustomEvent('beCookieConsentChanged', { detail: consent }));
        applyConsent(consent);
        return consent;
    }

    function has(category) {
        const consent = getStoredConsent();
        return !!(consent && consent[category] === true);
    }

    function injectScript(src, id) {
        if (!src || document.getElementById(id)) return;
        const script = document.createElement('script');
        script.async = true;
        script.src = src;
        script.id = id;
        document.head.appendChild(script);
    }

    function applyConsent(consent) {
        const config = window.BE_COOKIE_CONFIG || {};

        if (consent && consent.analytics === true && config.googleAnalyticsId) {
            window.dataLayer = window.dataLayer || [];
            function gtag(){ window.dataLayer.push(arguments); }
            window.gtag = window.gtag || gtag;
            injectScript('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(config.googleAnalyticsId), 'be-ga-script');
            window.gtag('js', new Date());
            window.gtag('config', config.googleAnalyticsId, { anonymize_ip: true });
        }

        if (consent && consent.marketing === true && config.metaPixelId && !window.fbq) {
            !function(f,b,e,v,n,t,s){
                if(f.fbq)return;n=f.fbq=function(){n.callMethod?
                n.callMethod.apply(n,arguments):n.queue.push(arguments)};
                if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
                n.queue=[];t=b.createElement(e);t.async=!0;
                t.src=v;s=b.getElementsByTagName(e)[0];
                s.parentNode.insertBefore(t,s)
            }(window, document,'script','https://connect.facebook.net/en_US/fbevents.js');
            window.fbq('init', config.metaPixelId);
            window.fbq('track', 'PageView');
        }
    }

    function createBanner() {
        if (document.getElementById('be-cookie-banner')) return;
        const t = getText();

        const banner = document.createElement('div');
        banner.id = 'be-cookie-banner';
        banner.className = 'be-cookie-banner';
        banner.innerHTML = `
            <div class="be-cookie-content">
                <div class="be-cookie-kicker">${t.kicker}</div>
                <div class="be-cookie-title">${t.title}</div>
                <div class="be-cookie-text">${t.text}</div>
            </div>
            <div class="be-cookie-actions">
                <button type="button" class="be-cookie-btn be-cookie-btn-outline" data-cookie-action="reject">${t.rejectAll}</button>
                <button type="button" class="be-cookie-btn be-cookie-btn-outline" data-cookie-action="settings">${t.settings}</button>
                <button type="button" class="be-cookie-btn be-cookie-btn-primary" data-cookie-action="accept">${t.acceptAll}</button>
            </div>
        `;

        const floating = document.createElement('button');
        floating.id = 'be-cookie-floating';
        floating.type = 'button';
        floating.className = 'be-cookie-floating';
        floating.textContent = t.floating;
        floating.setAttribute('aria-label', t.settings);

        const modal = document.createElement('div');
        modal.id = 'be-cookie-modal';
        modal.className = 'be-cookie-modal';
        modal.innerHTML = `
            <div class="be-cookie-panel" role="dialog" aria-modal="true" aria-labelledby="be-cookie-modal-title">
                <h2 id="be-cookie-modal-title">${t.modalTitle}</h2>
                <p>${t.modalText}</p>

                <div class="be-cookie-option">
                    <div>
                        <strong>${t.necessaryTitle}</strong>
                        <span>${t.necessaryText}</span>
                    </div>
                    <label class="be-cookie-switch" aria-label="${t.necessaryTitle}">
                        <input type="checkbox" checked disabled>
                        <span class="be-cookie-slider"></span>
                    </label>
                </div>

                <div class="be-cookie-option">
                    <div>
                        <strong>${t.analyticsTitle}</strong>
                        <span>${t.analyticsText}</span>
                    </div>
                    <label class="be-cookie-switch" aria-label="${t.analyticsTitle}">
                        <input type="checkbox" id="be-cookie-analytics">
                        <span class="be-cookie-slider"></span>
                    </label>
                </div>

                <div class="be-cookie-option">
                    <div>
                        <strong>${t.marketingTitle}</strong>
                        <span>${t.marketingText}</span>
                    </div>
                    <label class="be-cookie-switch" aria-label="${t.marketingTitle}">
                        <input type="checkbox" id="be-cookie-marketing">
                        <span class="be-cookie-slider"></span>
                    </label>
                </div>

                <div class="be-cookie-modal-actions">
                    <button type="button" class="be-cookie-btn be-cookie-btn-outline" data-cookie-action="reject">${t.rejectAll}</button>
                    <button type="button" class="be-cookie-btn be-cookie-btn-primary" data-cookie-action="save">${t.save}</button>
                    <button type="button" class="be-cookie-btn be-cookie-btn-primary" data-cookie-action="accept">${t.acceptAll}</button>
                </div>
            </div>
        `;

        document.body.appendChild(banner);
        document.body.appendChild(floating);
        document.body.appendChild(modal);

        document.addEventListener('click', function (event) {
            const actionEl = event.target.closest('[data-cookie-action]');
            if (!actionEl) return;
            const action = actionEl.dataset.cookieAction;

            if (action === 'accept') {
                saveConsent({ analytics: true, marketing: true });
                hideBanner();
                closeSettings();
                showFloating();
            }

            if (action === 'reject') {
                saveConsent({ analytics: false, marketing: false });
                hideBanner();
                closeSettings();
                showFloating();
            }

            if (action === 'settings') {
                openSettings();
            }

            if (action === 'save') {
                const analytics = document.getElementById('be-cookie-analytics')?.checked === true;
                const marketing = document.getElementById('be-cookie-marketing')?.checked === true;
                saveConsent({ analytics, marketing });
                hideBanner();
                closeSettings();
                showFloating();
            }
        });

        floating.addEventListener('click', openSettings);
        modal.addEventListener('click', function (event) {
            if (event.target === modal) closeSettings();
        });
    }

    function showBanner() {
        document.getElementById('be-cookie-banner')?.classList.add('is-visible');
        document.getElementById('be-cookie-floating')?.classList.remove('is-visible');
    }

    function hideBanner() {
        document.getElementById('be-cookie-banner')?.classList.remove('is-visible');
    }

    function showFloating() {
        document.getElementById('be-cookie-floating')?.classList.add('is-visible');
    }

    function openSettings() {
        const consent = getStoredConsent();
        const analytics = document.getElementById('be-cookie-analytics');
        const marketing = document.getElementById('be-cookie-marketing');
        if (analytics) analytics.checked = consent ? consent.analytics === true : false;
        if (marketing) marketing.checked = consent ? consent.marketing === true : false;
        document.getElementById('be-cookie-modal')?.classList.add('is-visible');
    }

    function closeSettings() {
        document.getElementById('be-cookie-modal')?.classList.remove('is-visible');
    }

    function init() {
        createBanner();
        const consent = getStoredConsent();
        if (consent) {
            applyConsent(consent);
            showFloating();
        } else {
            showBanner();
        }
    }

    window.BEConsent = {
        get: getStoredConsent,
        has,
        openSettings,
        acceptAll: function () { return saveConsent({ analytics: true, marketing: true }); },
        rejectAll: function () { return saveConsent({ analytics: false, marketing: false }); },
        reset: function () { localStorage.removeItem(CONSENT_KEY); window.location.reload(); }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
