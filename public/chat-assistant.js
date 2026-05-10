(function () {
    const assistantData = {
        hu: {
            title: 'Balaton Essence asszisztens',
            welcome: 'Szia! Miben segíthetek?',
            placeholder: 'Írd be a kérdésed...',
            fallback: 'Erre most még nem tudok biztos választ adni. Írj nekünk az info@balatonessence.com címre, vagy hívd a +36 20 499 5484 számot.',
            quickReplies: [
                'Hogyan tudok foglalni?',
                'Van reggeli?',
                'Milyen szolgáltatások vannak?',
                'Hol találhatók az apartmanok?',
                'Hogyan tudok kapcsolatba lépni?'
            ],
            answers: [
                {
                    keywords: ['foglal', 'foglalni', 'booking', 'szállás'],
                    answer: 'Foglalni az apartmanok oldalán tudsz: válaszd ki a szállást, add meg az időpontot és a vendégek számát, majd online bankkártyás előlegfizetéssel véglegesítheted a foglalást.'
                },
                {
                    keywords: ['reggeli', 'breakfast'],
                    answer: 'Igen, fonyódi apartmanjainkhoz reggeli tál is rendelhető. A rendelést a foglaláshoz kapcsolódó linken keresztül lehet leadni.'
                },
                {
                    keywords: ['szolgáltatás', 'szolgáltatások', 'sup', 'napozószék', 'napernyő', 'hajó'],
                    answer: 'Elérhető többek között SUP, napozószék, napernyő, hajóbérlés, valamint reggeli és különleges tálrendelés is.'
                },
                {
                    keywords: ['hol', 'cím', 'apartmanok', 'fonyód', 'helyszín'],
                    answer: 'Apartmanjaink a Balaton déli partján találhatók, több közvetlen vízparti szállással, köztük Fonyódon is.'
                },
                {
                    keywords: ['kapcsolat', 'telefon', 'email', 'e-mail', 'elérhetőség'],
                    answer: 'Kapcsolat: info@balatonessence.com · +36 20 499 5484'
                },
                {
                    keywords: ['lemondás', 'storno', 'törlés'],
                    answer: 'Érkezés előtt 14 nappal a foglalás ingyenesen lemondható, a befizetett előleg teljes egészében visszajár. 14 napon belüli lemondás esetén az előleg 50%-a jár vissza.'
                },
                {
                    keywords: ['fizetés', 'előleg', 'bankkártya'],
                    answer: 'A foglalás véglegesítéséhez 50% előleg fizetendő online bankkártyával. A fennmaradó összeget a helyszínen kell rendezni.'
                },
                {
                    keywords: ['bor mámór', 'bor mamor', 'ederics'],
                    answer: 'A Balaton Essence története a Bor Mámor Ederics Vendégházzal indult, amely jelenleg felújítás alatt áll, ezért most még nem foglalható.'
                }
            ]
        },

        en: {
            title: 'Balaton Essence assistant',
            welcome: 'Hi! How can I help you?',
            placeholder: 'Type your question...',
            fallback: 'I am not sure about that yet. Please contact us at info@balatonessence.com or call +36 20 499 5484.',
            quickReplies: [
                'How can I book?',
                'Is breakfast available?',
                'What services are available?',
                'Where are the apartments?',
                'How can I contact you?'
            ],
            answers: [
                {
                    keywords: ['book', 'booking', 'reservation'],
                    answer: 'You can book on the apartment pages: choose your stay, select the dates and number of guests, then confirm the reservation with an online card deposit payment.'
                },
                {
                    keywords: ['breakfast'],
                    answer: 'Yes, breakfast platters can be ordered for our apartments in Fonyód through the link connected to the reservation.'
                },
                {
                    keywords: ['services', 'sup', 'sunbed', 'umbrella', 'boat'],
                    answer: 'Available services include SUP, sunbeds, parasols, boat rental, breakfast, and special platter orders.'
                },
                {
                    keywords: ['where', 'location', 'apartments', 'fonyod'],
                    answer: 'Our apartments are located on the southern shore of Lake Balaton, including several directly waterfront stays and apartments in Fonyód.'
                },
                {
                    keywords: ['contact', 'phone', 'email'],
                    answer: 'Contact: info@balatonessence.com · +36 20 499 5484'
                },
                {
                    keywords: ['cancel', 'cancellation'],
                    answer: 'Bookings can be cancelled free of charge up to 14 days before arrival, with a full refund of the deposit. Within 14 days, 50% of the paid deposit is refunded.'
                },
                {
                    keywords: ['payment', 'deposit', 'card'],
                    answer: 'A 50% deposit is required to confirm the booking and is paid online by card. The remaining balance is payable on site.'
                },
                {
                    keywords: ['bor mamor', 'ederics'],
                    answer: 'The story of Balaton Essence began with Bor Mámor Ederics Guesthouse, which is currently under renovation and is not bookable at the moment.'
                }
            ]
        },

        de: {
            title: 'Balaton Essence Assistent',
            welcome: 'Hallo! Wie kann ich helfen?',
            placeholder: 'Frage eingeben...',
            fallback: 'Darauf habe ich derzeit noch keine sichere Antwort. Bitte schreiben Sie an info@balatonessence.com oder rufen Sie +36 20 499 5484 an.',
            quickReplies: [
                'Wie kann ich buchen?',
                'Gibt es Frühstück?',
                'Welche Leistungen gibt es?',
                'Wo befinden sich die Apartments?',
                'Wie kann ich Kontakt aufnehmen?'
            ],
            answers: [
                {
                    keywords: ['buchen', 'buchung', 'reservierung'],
                    answer: 'Sie können direkt auf den Apartmentseiten buchen: Unterkunft auswählen, Zeitraum und Gästezahl angeben und die Buchung mit einer Online-Anzahlung per Bankkarte abschließen.'
                },
                {
                    keywords: ['frühstück', 'fruhstuck'],
                    answer: 'Ja, für unsere Apartments in Fonyód können Frühstücksplatten über den zur Buchung gehörenden Link bestellt werden.'
                },
                {
                    keywords: ['leistungen', 'sup', 'sonnenliege', 'sonnenschirm', 'boot'],
                    answer: 'Verfügbar sind unter anderem SUP, Sonnenliegen, Sonnenschirme, Bootsverleih, Frühstück sowie besondere Plattenbestellungen.'
                },
                {
                    keywords: ['wo', 'lage', 'apartments', 'fonyod'],
                    answer: 'Unsere Apartments befinden sich am Südufer des Balatons, darunter mehrere direkt am Wasser gelegene Unterkünfte und Apartments in Fonyód.'
                },
                {
                    keywords: ['kontakt', 'telefon', 'email'],
                    answer: 'Kontakt: info@balatonessence.com · +36 20 499 5484'
                },
                {
                    keywords: ['stornierung', 'storno', 'kündigung'],
                    answer: 'Bis 14 Tage vor Anreise ist eine kostenlose Stornierung mit vollständiger Rückerstattung der Anzahlung möglich. Innerhalb von 14 Tagen werden 50% der Anzahlung zurückerstattet.'
                },
                {
                    keywords: ['zahlung', 'anzahlung', 'karte'],
                    answer: 'Zur Bestätigung der Buchung ist eine Anzahlung von 50% erforderlich, die online per Bankkarte bezahlt wird. Der Restbetrag ist vor Ort zu zahlen.'
                },
                {
                    keywords: ['bor mamor', 'ederics'],
                    answer: 'Die Geschichte von Balaton Essence begann mit dem Bor Mámor Ederics Gästehaus, das derzeit renoviert wird und momentan nicht buchbar ist.'
                }
            ]
        }
    };

    function getLang() {
        const lang = document.documentElement.lang || 'hu';
        return ['hu', 'en', 'de'].includes(lang) ? lang : 'hu';
    }

    const lang = getLang();
    const t = assistantData[lang];

    const style = document.createElement('style');
    style.textContent = `
        .be-chat-button {
            position: fixed;
            right: 22px;
            bottom: 22px;
            width: 62px;
            height: 62px;
            border: none;
            border-radius: 50%;
            background: #172318;
            color: white;
            font-size: 27px;
            cursor: pointer;
            z-index: 99998;
            box-shadow: 0 18px 42px rgba(0,0,0,0.28);
        }

        .be-chat-window {
            position: fixed;
            right: 22px;
            bottom: 96px;
            width: min(380px, calc(100vw - 28px));
            height: 520px;
            background: #fff;
            border: 1px solid #e3e0d8;
            border-radius: 22px;
            box-shadow: 0 25px 70px rgba(0,0,0,0.25);
            display: none;
            flex-direction: column;
            overflow: hidden;
            z-index: 99999;
        }

        .be-chat-window.open {
            display: flex;
        }

        .be-chat-header {
            background: linear-gradient(135deg, #172318, #253421);
            color: white;
            padding: 18px 20px;
        }

        .be-chat-header-title {
            font-family: 'Playfair Display', serif;
            font-size: 1.25rem;
        }

        .be-chat-header-subtitle {
            margin-top: 4px;
            color: rgba(255,255,255,0.72);
            font-size: 0.76rem;
        }

        .be-chat-messages {
            flex: 1;
            padding: 18px;
            overflow-y: auto;
            background: #fcfbf9;
        }

        .be-message {
            max-width: 86%;
            padding: 12px 14px;
            margin-bottom: 12px;
            border-radius: 16px;
            line-height: 1.5;
            font-size: 0.88rem;
        }

        .be-message.bot {
            background: white;
            border: 1px solid #e3e0d8;
            color: #2c3325;
        }

        .be-message.user {
            margin-left: auto;
            background: #5c7a4d;
            color: white;
        }

        .be-quick-replies {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            padding: 0 18px 14px;
            background: #fcfbf9;
        }

        .be-quick-reply {
            border: 1px solid #d2cec3;
            background: white;
            color: #172318;
            border-radius: 999px;
            padding: 8px 11px;
            font-size: 0.72rem;
            font-weight: 700;
            cursor: pointer;
        }

        .be-chat-input-wrap {
            display: flex;
            gap: 8px;
            padding: 14px;
            border-top: 1px solid #e3e0d8;
            background: white;
        }

        .be-chat-input {
            flex: 1;
            border: 1px solid #e3e0d8;
            border-radius: 999px;
            padding: 12px 14px;
            outline: none;
            font-family: inherit;
        }

        .be-chat-send {
            width: 44px;
            height: 44px;
            border: none;
            border-radius: 50%;
            background: #5c7a4d;
            color: white;
            font-size: 18px;
            cursor: pointer;
        }

        @media (max-width: 560px) {
            .be-chat-button {
                right: 16px;
                bottom: 16px;
            }

            .be-chat-window {
                right: 14px;
                bottom: 88px;
                width: calc(100vw - 28px);
                height: min(520px, calc(100vh - 110px));
            }
        }
    `;
    document.head.appendChild(style);

    const button = document.createElement('button');
    button.className = 'be-chat-button';
    button.type = 'button';
    button.setAttribute('aria-label', t.title);
    button.innerHTML = '💬';

    const windowEl = document.createElement('div');
    windowEl.className = 'be-chat-window';
    windowEl.innerHTML = `
        <div class="be-chat-header">
            <div class="be-chat-header-title">${t.title}</div>
            <div class="be-chat-header-subtitle">0–24 automatikus segítség</div>
        </div>

        <div class="be-chat-messages" id="be-chat-messages"></div>
        <div class="be-quick-replies" id="be-quick-replies"></div>

        <div class="be-chat-input-wrap">
            <input class="be-chat-input" id="be-chat-input" type="text" placeholder="${t.placeholder}">
            <button class="be-chat-send" id="be-chat-send" type="button">➤</button>
        </div>
    `;

    document.body.appendChild(button);
    document.body.appendChild(windowEl);

    const messages = document.getElementById('be-chat-messages');
    const input = document.getElementById('be-chat-input');
    const send = document.getElementById('be-chat-send');
    const quickReplies = document.getElementById('be-quick-replies');

    function addMessage(text, type) {
        const el = document.createElement('div');
        el.className = `be-message ${type}`;
        el.textContent = text;
        messages.appendChild(el);
        messages.scrollTop = messages.scrollHeight;
    }

    function normalize(text) {
        return String(text || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
    }

    function findAnswer(question) {
        const q = normalize(question);

        for (const item of t.answers) {
            if (item.keywords.some(keyword => q.includes(normalize(keyword)))) {
                return item.answer;
            }
        }

        return t.fallback;
    }

    function sendMessage(text) {
        if (!text.trim()) return;

        addMessage(text, 'user');

        setTimeout(() => {
            addMessage(findAnswer(text), 'bot');
        }, 250);

        input.value = '';
    }

    button.addEventListener('click', () => {
        windowEl.classList.toggle('open');

        if (windowEl.classList.contains('open') && messages.children.length === 0) {
            addMessage(t.welcome, 'bot');
        }
    });

    send.addEventListener('click', () => {
        sendMessage(input.value);
    });

    input.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            sendMessage(input.value);
        }
    });

    quickReplies.innerHTML = t.quickReplies.map(reply => `
        <button class="be-quick-reply" type="button">${reply}</button>
    `).join('');

    quickReplies.querySelectorAll('.be-quick-reply').forEach(btn => {
        btn.addEventListener('click', () => {
            sendMessage(btn.textContent);
        });
    });
})();