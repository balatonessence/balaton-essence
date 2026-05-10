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

    let liveApartments = [];
let liveBookings = [];

async function loadLiveData() {
    try {
        const res = await fetch('/api/get-db-content?t=' + Date.now());

        if (!res.ok) {
            throw new Error('Nem sikerült betölteni az adatokat.');
        }

        const db = await res.json();

        liveApartments = Array.isArray(db.apartments)
            ? db.apartments
            : [];

        liveBookings = Array.isArray(db.bookings)
            ? db.bookings
            : [];
    } catch (err) {
        console.error('Asszisztens adatbetöltési hiba:', err);
        liveApartments = [];
        liveBookings = [];
    }
}

loadLiveData();

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

    function formatPrice(value) {
    return Number(value || 0).toLocaleString('hu-HU') + ' Ft';
}

function getApartmentByQuestion(question) {
    const q = normalize(question);

    return liveApartments.find(apt => {
        const fullName = normalize(apt.name || '');

        if (q.includes(fullName)) {
            return true;
        }

        const shortenedName = fullName
            .replace(' apartman', '')
            .replace(' residence', '');

        return shortenedName.length >= 4 && q.includes(shortenedName);
    });
}

function getSeasonPriceText(apt) {
    const seasons = Array.isArray(apt.seasons) ? apt.seasons : [];

    if (seasons.length === 0) {
        return 'Ehhez az apartmanhoz jelenleg nincs megadott ár.';
    }

    return seasons.map(season => {
        let text = `${season.name}: ${formatPrice(season.price)} / éj`;

        if (Number(season.price3 || 0) > 0) {
            text += `, 3 főre ${formatPrice(season.price3)}`;
        }

        if (Number(season.price4 || 0) > 0) {
            text += `, 4 főre ${formatPrice(season.price4)}`;
        }

        text += `, minimum ${season.minNights} éj`;

        return text;
    }).join(' | ');
}

function getMaxGuests(apt) {
    const seasons = Array.isArray(apt.seasons) ? apt.seasons : [];

    return Math.max(
        ...seasons.map(season => Number(season.maxGuests || 0)),
        0
    );
}

function findCheapestSummerApartment() {
    const summerApartments = liveApartments
        .map(apt => {
            const summerSeason = (apt.seasons || []).find(season =>
                normalize(season.name).includes('nyari')
            );

            return summerSeason
                ? { apt, price: Number(summerSeason.price || 0) }
                : null;
        })
        .filter(Boolean)
        .filter(item => item.price > 0)
        .sort((a, b) => a.price - b.price);

    return summerApartments[0] || null;
}

function getRequestedGuests(question) {
    const q = normalize(question);

    if (
        q.includes('4 fo') ||
        q.includes('4 fő') ||
        q.includes('negy fo') ||
        q.includes('negy fő') ||
        q.includes('negyfos') ||
        q.includes('negyfős')
    ) {
        return 4;
    }

    if (
        q.includes('3 fo') ||
        q.includes('3 fő') ||
        q.includes('harom fo') ||
        q.includes('három fő')
    ) {
        return 3;
    }

    if (
        q.includes('2 fo') ||
        q.includes('2 fő') ||
        q.includes('ket fo') ||
        q.includes('két fő') ||
        q.includes('parnak') ||
        q.includes('párnak')
    ) {
        return 2;
    }

    return null;
}

function getRequestedMonth(question) {
    const q = normalize(question);

    const months = [
        { names: ['aprilis', 'április'], number: 4, label: 'április' },
        { names: ['majus', 'május'], number: 5, label: 'május' },
        { names: ['junius', 'június'], number: 6, label: 'június' },
        { names: ['julius', 'július'], number: 7, label: 'július' },
        { names: ['augusztus'], number: 8, label: 'augusztus' },
        { names: ['szeptember'], number: 9, label: 'szeptember' },
        { names: ['oktober', 'október'], number: 10, label: 'október' },
        { names: ['november'], number: 11, label: 'november' },
        { names: ['december'], number: 12, label: 'december' }
    ];

    return months.find(month =>
        month.names.some(name => q.includes(normalize(name)))
    ) || null;
}

function getSeasonForMonth(apt, monthNumber) {
    const seasons = Array.isArray(apt.seasons) ? apt.seasons : [];

    return seasons.find(season => {
        if (!season.start || !season.end) return false;

        const startMonth = Number(String(season.start).slice(5, 7));
        const endMonth = Number(String(season.end).slice(5, 7));

        return monthNumber >= startMonth && monthNumber <= endMonth;
    }) || null;
}

function getPriceForGuests(season, guests) {
    if (!season) return 0;

    if (guests >= 4 && Number(season.price4 || 0) > 0) {
        return Number(season.price4);
    }

    if (guests === 3 && Number(season.price3 || 0) > 0) {
        return Number(season.price3);
    }

    return Number(season.price || 0);
}

function getRecommendedApartments(question) {
    const q = normalize(question);
    const guests = getRequestedGuests(question);
    const month = getRequestedMonth(question);

    const isRecommendationQuestion =
        q.includes('ajanl') ||
        q.includes('ajánl') ||
        q.includes('melyik lenne jo') ||
        q.includes('melyik lenne jó') ||
        q.includes('mit valasszak') ||
        q.includes('mit válasszak') ||
        q.includes('legjobb');

    if (!isRecommendationQuestion) {
        return null;
    }

    let candidates = liveApartments.map(apt => {
        const maxGuests = getMaxGuests(apt);

        if (guests && maxGuests < guests) {
            return null;
        }

        let season = null;
        let price = 0;

        if (month) {
            season = getSeasonForMonth(apt, month.number);

            if (!season) {
                return null;
            }

            price = getPriceForGuests(season, guests || 2);
        } else {
            const firstSeason = Array.isArray(apt.seasons) ? apt.seasons[0] : null;
            season = firstSeason;
            price = getPriceForGuests(firstSeason, guests || 2);
        }

        return {
            apt,
            season,
            price,
            maxGuests
        };
    })
    .filter(Boolean)
    .filter(item => item.price > 0)
    .sort((a, b) => a.price - b.price);

    if (q.includes('balatonszemes')) {
        candidates = candidates.filter(item =>
            normalize(item.apt.location).includes('balatonszemes')
        );
    }

    if (q.includes('fonyod') || q.includes('fonyód')) {
        candidates = candidates.filter(item =>
            normalize(item.apt.location).includes('fonyod')
        );
    }

    if (candidates.length === 0) {
        return 'Erre a kérésre most nem találtam megfelelő apartmant a megadott adatok alapján.';
    }

    const best = candidates[0];
    const alternatives = candidates.slice(1, 3);

    let answer = '';

    if (month && guests) {
        answer = `${month.label} hónapra ${guests} főnek ár alapján ezt ajánlanám elsőként: ${best.apt.name}, ${formatPrice(best.price)} / éj ártól.`;
    } else if (month) {
        answer = `${month.label} hónapra ár alapján ezt ajánlanám elsőként: ${best.apt.name}, ${formatPrice(best.price)} / éj ártól.`;
    } else if (guests) {
        answer = `${guests} főre ár alapján ezt ajánlanám elsőként: ${best.apt.name}, ${formatPrice(best.price)} / éj ártól.`;
    } else {
        answer = `Ár alapján ezt ajánlanám elsőként: ${best.apt.name}, ${formatPrice(best.price)} / éj ártól.`;
    }

    if (alternatives.length > 0) {
        answer += ` További jó lehetőség: ${alternatives
            .map(item => `${item.apt.name} (${formatPrice(item.price)} / éj)`)
            .join(', ')}.`;
    }

    answer += ' A tényleges elérhetőséget mindig a foglalási naptár mutatja meg.';

    return answer;
}

function levenshtein(a, b) {
    const matrix = [];

    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }

    return matrix[b.length][a.length];
}

function isSimilarWord(word, target, maxDistance = 1) {
    return levenshtein(normalize(word), normalize(target)) <= maxDistance;
}

function extractGuestCount(question) {
    const q = normalize(question);

    // 4en, 4 fő, 4 főre, 4 fős, 4-en
    const numericMatch = q.match(/(\d{1,2})\s*[- ]?(fo|fos|fore|en)\b/);

    if (numericMatch) {
        return Number(numericMatch[1]);
    }

    const words = q.split(/\s+/);

    const numberWords = {
        egy: 1,
        ketto: 2,
        ketten: 2,
        harom: 3,
        harman: 3,
        negy: 4,
        negyen: 4,
        ot: 5,
        oten: 5,
        hat: 6,
        hatan: 6
    };

    for (const word of words) {
        for (const [target, value] of Object.entries(numberWords)) {
            if (isSimilarWord(word, target, 1)) {
                return value;
            }
        }
    }

    return null;
}

function findApartmentAnswer(question) {
    const q = normalize(question);

    if (!liveApartments.length) {
        return null;
    }

    const recommendation = getRecommendedApartments(question);

    if (recommendation) {
        return recommendation;
    }

    if (
        q.includes('balatonszemes') ||
        q.includes('melyik apartman van balatonszemesen')
    ) {
        const szemesApartments = liveApartments
            .filter(apt => normalize(apt.location).includes('balatonszemes'))
            .map(apt => apt.name);

        if (szemesApartments.length > 0) {
            return `Balatonszemesen jelenleg ez az apartman érhető el: ${szemesApartments.join(', ')}.`;
        }
    }

    const guestCount = extractGuestCount(question);

        if (guestCount) {
            const matchingApartments = liveApartments
                .filter(apt => getMaxGuests(apt) >= guestCount)
                .map(apt => apt.name);

            if (matchingApartments.length > 0) {
                return `${guestCount} fő fogadására alkalmas apartmanjaink: ${matchingApartments.join(', ')}.`;
            }
        }

    if (
        q.includes('legolcsobb') &&
        (q.includes('nyar') || q.includes('nyari'))
    ) {
        const cheapest = findCheapestSummerApartment();

        if (cheapest) {
            return `Nyáron jelenleg a legkedvezőbb árú apartman: ${cheapest.apt.name}, ${formatPrice(cheapest.price)} / éj ártól.`;
        }
    }

    const apt = getApartmentByQuestion(question);

    if (!apt) {
        return null;
    }

    if (
        q.includes('hol') ||
        q.includes('cim') ||
        q.includes('cím') ||
        q.includes('talalhato') ||
        q.includes('található')
    ) {
        return `${apt.name} címe: ${apt.address}.`;
    }

    if (
        q.includes('hany fo') ||
        q.includes('hány fő') ||
        q.includes('fer el') ||
        q.includes('fér el') ||
        q.includes('kapacitas') ||
        q.includes('kapacitás')
    ) {
        const maxGuests = getMaxGuests(apt);

        return `${apt.name} legfeljebb ${maxGuests} fő fogadására alkalmas.`;
    }

    if (
        q.includes('mennyibe') ||
        q.includes('ar') ||
        q.includes('ár') ||
        q.includes('mennyiert') ||
        q.includes('mennyiért')
    ) {
        return `${apt.name} árai: ${getSeasonPriceText(apt)}.`;
    }

    return `${apt.name} ${apt.location} településen található. Címe: ${apt.address}. ${getSeasonPriceText(apt)}.`;
}

function findAnswer(question) {
    const apartmentAnswer = findApartmentAnswer(question);

    if (apartmentAnswer) {
        return apartmentAnswer;
    }

    const q = normalize(question);

    const matchedAnswers = t.answers
        .map(item => {
            const matches = item.keywords.filter(keyword =>
                q.includes(normalize(keyword))
            );

            return {
                item,
                score: matches.length
            };
        })
        .filter(result => result.score > 0)
        .sort((a, b) => b.score - a.score);

    if (matchedAnswers.length === 0) {
        return t.fallback;
    }

    const bestMatch = matchedAnswers[0];

    if (bestMatch.score === 1 && q.split(' ').length >= 4) {
        return t.fallback;
    }

    return bestMatch.item.answer;
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