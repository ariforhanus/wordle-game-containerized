function escapeProfile(value: unknown): string {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
const letters = document.querySelectorAll(".letter-box");
const loadingDiv = document.querySelector(".loading");
const brandName = document.querySelector(".brand-name");
const resultPopup  = document.getElementById("result-popup");
const resultText   = resultPopup?.querySelector(".result-text");
const resultDef    = resultPopup?.querySelector(".result-def");
const playAgainBtn = document.getElementById("play-again");

// Settings dropdown elements
const settingsBtn = document.getElementById("settingsBtn");
const settingsDropdown = document.getElementById("settingsDropdown");
const userInfo = document.getElementById("userInfo");
const logoutBtn = userInfo?.querySelector(".logout-btn");

// Mobile auth elements
const mobileUserInfo = document.getElementById("mobileUserInfo");
const mobileLogoutBtn = mobileUserInfo?.querySelector(".logout-btn");

const ANSWER_LENGTH = 5;
const TOTAL_TRIES = 6;
let done = false;
let isLoading = false;
let currentGuess = "";
let currentRow = 0;
let remainingLife = 5;
let gameStartMs = Date.now();
let scoreSent = false;

// Valid words set - local dosyadan yüklenir
let validWords = new Set<string>();

// URL'den dil algıla: /en/game.html → "en", /tr/game.html → "tr"
// Genel kural: ilk segment 2 harf ise dil kodu kabul edilir (en, tr, de, fr ...)
function detectLanguage(): string {
    const path = window.location.pathname; // örn: "/en/game.html"
    const match = path.match(/^\/([a-zA-Z]{2})\//);
    if (match && match[1]) {
        return match[1].toLowerCase();
    }
    // Dil segmenti yoksa veya okunamıyorsa varsayılan "en"
    return 'en';
}

const LANG = detectLanguage();

// Türkçe için doğru uppercase (i→İ, ı→I)
function toUpper(str: string): string {
    if (LANG === 'tr') {
        return str.toLocaleUpperCase('tr-TR');
    }
    return str.toUpperCase();
}

// Kelime listesini yükle
async function loadValidWords(): Promise<void> {
    try {
        // Dil koduna göre dosya adı: words_<lang>_possible.txt
        let file = `/words_${LANG}_possible.txt`;
        let res = await fetch(file);

        // Dosya bulunamazsa (örneğin yeni bir dil için henüz eklenmediyse) İngilizceye düş
        if (!res.ok) {
            console.warn(`Valid words file not found for lang=${LANG}, falling back to English.`);
            file = '/words_en_possible.txt';
            res = await fetch(file);
        }

        const text = await res.text();
        const words = text.split('\n').map(w => toUpper(w.trim())).filter(w => w.length === 5);
        validWords = new Set(words);
    } catch (e) {
        console.error('Failed to load valid words:', e);
    }
}

// Dark mode functionality (global)
function initDarkMode(): void {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "dark") {
        document.documentElement.setAttribute("data-theme", "dark");
    } else {
        document.documentElement.setAttribute("data-theme", "light");
    }
}

function toggleDarkMode(): void {
    const currentTheme = document.documentElement.getAttribute("data-theme");
    const newTheme = currentTheme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("theme", newTheme);
    updateDarkModeButton();
}

function updateDarkModeButton(): void {
    const darkModeBtn = document.getElementById("darkModeToggle");
    if (darkModeBtn) {
        const isDark = document.documentElement.getAttribute("data-theme") === "dark";
        const label = darkModeBtn.querySelector(".dark-mode-label");
        if (label) {
            label.textContent = LANG === "tr" ? (isDark ? "Açık Mod" : "Koyu Mod") : (isDark ? "Light Mode" : "Dark Mode");
        }
    }
}

// Initialize dark mode on page load (run immediately)
initDarkMode();

// Settings dropdown functionality
if (settingsBtn && settingsDropdown) {
    settingsBtn.addEventListener("click", () => {
        settingsDropdown.classList.toggle("show");
    });

    // Close dropdown when clicking outside
    document.addEventListener("click", (e) => {
        const target = e.target as Node | null;
        if (target && !settingsBtn.contains(target) && !settingsDropdown.contains(target)) {
            settingsDropdown.classList.remove("show");
        }
    });
    
    // Add dark mode toggle button to dropdown
    const dropdownList = settingsDropdown.querySelector("ul");
    if (dropdownList) {
        const darkModeToggle = document.createElement("li");
        darkModeToggle.innerHTML = `
            <button class="dark-mode-toggle" id="darkModeToggle">
                <span class="dark-mode-switch">
                    <span class="dark-mode-slider"></span>
                </span>
                <span class="dark-mode-label">${LANG === "tr" ? "Koyu Mod" : "Dark Mode"}</span>
            </button>
        `;
        // Insert before logout button if exists, otherwise append
        const logoutItem = dropdownList.querySelector(".logout-btn")?.closest("li");
        if (logoutItem) {
            dropdownList.insertBefore(darkModeToggle, logoutItem);
        } else {
            dropdownList.appendChild(darkModeToggle);
        }
        
        const darkModeBtn = document.getElementById("darkModeToggle");
        if (darkModeBtn) {
            darkModeBtn.addEventListener("click", () => {
                toggleDarkMode();
            });
            updateDarkModeButton();
        }
    }
}

// Logout functionality
if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
        localStorage.removeItem("jwtToken");
        localStorage.removeItem("tokenExpiry");
        updateAccountMenu();
        settingsDropdown?.classList.remove("show");
    });
}

// Mobile logout functionality
if (mobileLogoutBtn) {
    mobileLogoutBtn.addEventListener("click", () => {
        localStorage.removeItem("jwtToken");
        localStorage.removeItem("tokenExpiry");
        updateAccountMenu();
        // Close mobile menu
        const fullscreenMenu = document.querySelector(".fullscreen-menu") as HTMLElement | null;
        if (fullscreenMenu) {
            fullscreenMenu.classList.remove("show");
            setTimeout(() => {
                fullscreenMenu.classList.add("hidden");
            }, 300);
        }
    });
}

type UserStats = {
    totalGames: number;
    bestScore: number;
    averageScore: number;
    averageDurationSeconds: number;
    gamesPerLanguage: Record<string, number>;
    currentStreak: number;
    bestStreak: number;
};

type Achievement = {
    id: string;
    icon: string;
    titleEn: string;
    titleTr: string;
    descEn: string;
    descTr: string;
    isUnlocked: (stats: UserStats, lang: string) => boolean;
};

const ACHIEVEMENTS: Achievement[] = [
    {
        id: "first_game",
        icon: "fa-flag-checkered",
        titleEn: "First Step",
        titleTr: "İlk Adım",
        descEn: "Play your first game.",
        descTr: "İlk oyununuzu oynayın.",
        isUnlocked: (s) => s.totalGames >= 1
    },
    {
        id: "ten_games",
        icon: "fa-dice",
        titleEn: "Getting Warm",
        titleTr: "Isınma Turu",
        descEn: "Play 10 games.",
        descTr: "10 oyun oynayın.",
        isUnlocked: (s) => s.totalGames >= 10
    },
    {
        id: "thirty_games",
        icon: "fa-gamepad",
        titleEn: "Regular Player",
        titleTr: "Düzenli Oyuncu",
        descEn: "Play 30 games.",
        descTr: "30 oyun oynayın.",
        isUnlocked: (s) => s.totalGames >= 30
    },
    {
        id: "hundred_games",
        icon: "fa-infinity",
        titleEn: "Addicted",
        titleTr: "Bağımlı",
        descEn: "Play 100 games.",
        descTr: "100 oyun oynayın.",
        isUnlocked: (s) => s.totalGames >= 100
    },
    {
        id: "streak_2",
        icon: "fa-fire",
        titleEn: "On Fire",
        titleTr: "Alev Aldı",
        descEn: "Reach a streak of 2 or more days.",
        descTr: "En az 2 günlük seri yapın.",
        isUnlocked: (s) => s.currentStreak >= 2 || s.bestStreak >= 2
    },
    {
        id: "streak_5",
        icon: "fa-fire-flame-curved",
        titleEn: "Hot Streak",
        titleTr: "Sıcak Seri",
        descEn: "Reach a streak of 5 or more days.",
        descTr: "En az 5 günlük seri yapın.",
        isUnlocked: (s) => s.currentStreak >= 5 || s.bestStreak >= 5
    },
    {
        id: "best_score_high",
        icon: "fa-trophy",
        titleEn: "High Scorer",
        titleTr: "Yüksek Skor",
        descEn: "Achieve a high score (>= 5000).",
        descTr: "5000 veya üzeri skor yapın.",
        isUnlocked: (s) => s.bestScore >= 5000
    },
    {
        id: "fast_player",
        icon: "fa-bolt",
        titleEn: "Speed Runner",
        titleTr: "Hızlı Oyuncu",
        descEn: "Average time under 90 seconds.",
        descTr: "Ortalama sürenizi 90 saniyenin altına düşürün.",
        isUnlocked: (s) => s.totalGames >= 5 && s.averageDurationSeconds <= 90
    },
    {
        id: "multi_language",
        icon: "fa-language",
        titleEn: "Bilingual",
        titleTr: "Çok Dilli",
        descEn: "Play in more than one language.",
        descTr: "Birden fazla dilde oyun oynayın.",
        isUnlocked: (s) => Object.keys(s.gamesPerLanguage || {}).length >= 2
    },
    {
        id: "lang_games_10",
        icon: "fa-globe",
        titleEn: "Local Hero",
        titleTr: "Yerel Kahraman",
        descEn: "Play 10 games in this language.",
        descTr: "Bu dilde 10 oyun oynayın.",
        isUnlocked: (s, lang) => (s.gamesPerLanguage?.[lang] ?? 0) >= 10
    }
];

function evaluateAchievements(stats: UserStats, lang: string): {
    unlocked: number;
    total: number;
    items: { id: string; icon: string; title: string; desc: string; unlocked: boolean; }[];
} {
    const items = ACHIEVEMENTS.map(a => {
        const unlocked = a.isUnlocked(stats, lang);
        return {
            id: a.id,
            icon: a.icon,
            title: lang === "tr" ? a.titleTr : a.titleEn,
            desc: lang === "tr" ? a.descTr : a.descEn,
            unlocked
        };
    });
    // Başarılanlar en üstte dursun
    items.sort((a, b) => {
        if (a.unlocked === b.unlocked) return 0;
        return a.unlocked ? -1 : 1;
    });
    const unlockedCount = items.filter(i => i.unlocked).length;
    return {
        unlocked: unlockedCount,
        total: items.length,
        items
    };
}

function openAchievementsPopup(data: {
    unlocked: number;
    total: number;
    items: { id: string; icon: string; title: string; desc: string; unlocked: boolean; }[];
}): void {
    let overlay = document.getElementById("achievementsOverlay") as HTMLElement | null;
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "achievementsOverlay";
        overlay.className = "achievements-overlay hidden";
        overlay.innerHTML = `
            <div class="achievements-backdrop"></div>
            <div class="achievements-modal">
                <div class="achievements-header">
                    <h2><i class="fa-solid fa-medal"></i> ${LANG === "tr" ? "Başarılar" : "Achievements"}</h2>
                    <button class="achievements-close" aria-label="Close">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
                <p class="achievements-progress">
                    ${LANG === "tr" ? "Tamamlanan" : "Completed"} 
                    <strong id="achievementsProgressText"></strong>
                </p>
                <div class="achievements-list-container">
                    <ul class="achievements-list"></ul>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const closeBtn = overlay.querySelector(".achievements-close") as HTMLElement | null;
        const backdrop = overlay.querySelector(".achievements-backdrop") as HTMLElement | null;
        if (closeBtn) {
            closeBtn.addEventListener("click", () => {
                overlay?.classList.add("hidden");
            });
        }
        if (backdrop) {
            backdrop.addEventListener("click", () => {
                overlay?.classList.add("hidden");
            });
        }
    }

    const progressText = overlay.querySelector("#achievementsProgressText") as HTMLElement | null;
    if (progressText) {
        progressText.textContent = `${data.unlocked}/${data.total}`;
    }

    const listEl = overlay.querySelector(".achievements-list") as HTMLElement | null;
    if (listEl) {
        listEl.innerHTML = "";
        data.items.forEach(item => {
            const li = document.createElement("li");
            li.className = "achievement-item" + (item.unlocked ? " achievement-unlocked" : " achievement-locked");
            li.innerHTML = `
                <div class="achievement-icon">
                    <i class="fa-solid ${item.icon}"></i>
                </div>
                <div class="achievement-text">
                    <div class="achievement-title">${item.title}</div>
                    <div class="achievement-desc">${item.desc}</div>
                </div>
            `;
            listEl.appendChild(li);
        });
    }

    overlay.classList.remove("hidden");
}

async function loadUserStats(token: string): Promise<UserStats | null> {
    try {
        const apiBase = (window.location.hostname === 'localhost' && window.location.port === '5500')
            ? 'http://localhost:8091'
            : '';
        const res = await fetch(`${apiBase}/api/v1/stats/me`, {
            headers: {
                "Authorization": "Bearer " + token
            }
        });
        if (!res.ok) {
            console.warn("Stats request failed with status", res.status);
            return null;
        }
        const data = await res.json() as UserStats;
        return data;
    } catch (e) {
        console.error("Stats load error:", e);
        return null;
    }
}

// Ülke kodundan isim al
function getCountryNameFromCode(code: string): string | null {
    const countries = LANG === "tr" ? [
        { code: "AF", name: "Afganistan" },
        { code: "AL", name: "Arnavutluk" },
        { code: "DZ", name: "Cezayir" },
        { code: "AR", name: "Arjantin" },
        { code: "AU", name: "Avustralya" },
        { code: "AT", name: "Avusturya" },
        { code: "BD", name: "Bangladeş" },
        { code: "BE", name: "Belçika" },
        { code: "BR", name: "Brezilya" },
        { code: "BG", name: "Bulgaristan" },
        { code: "CA", name: "Kanada" },
        { code: "CL", name: "Şili" },
        { code: "CN", name: "Çin" },
        { code: "CO", name: "Kolombiya" },
        { code: "HR", name: "Hırvatistan" },
        { code: "CZ", name: "Çek Cumhuriyeti" },
        { code: "DK", name: "Danimarka" },
        { code: "EG", name: "Mısır" },
        { code: "FI", name: "Finlandiya" },
        { code: "FR", name: "Fransa" },
        { code: "DE", name: "Almanya" },
        { code: "GR", name: "Yunanistan" },
        { code: "HK", name: "Hong Kong" },
        { code: "HU", name: "Macaristan" },
        { code: "IN", name: "Hindistan" },
        { code: "ID", name: "Endonezya" },
        { code: "IR", name: "İran" },
        { code: "IE", name: "İrlanda" },
        { code: "IL", name: "İsrail" },
        { code: "IT", name: "İtalya" },
        { code: "JP", name: "Japonya" },
        { code: "JO", name: "Ürdün" },
        { code: "KE", name: "Kenya" },
        { code: "KR", name: "Güney Kore" },
        { code: "KW", name: "Kuveyt" },
        { code: "MY", name: "Malezya" },
        { code: "MX", name: "Meksika" },
        { code: "MA", name: "Fas" },
        { code: "NL", name: "Hollanda" },
        { code: "NZ", name: "Yeni Zelanda" },
        { code: "NG", name: "Nijerya" },
        { code: "NO", name: "Norveç" },
        { code: "PK", name: "Pakistan" },
        { code: "PE", name: "Peru" },
        { code: "PH", name: "Filipinler" },
        { code: "PL", name: "Polonya" },
        { code: "PT", name: "Portekiz" },
        { code: "QA", name: "Katar" },
        { code: "RO", name: "Romanya" },
        { code: "RU", name: "Rusya" },
        { code: "SA", name: "Suudi Arabistan" },
        { code: "SG", name: "Singapur" },
        { code: "ZA", name: "Güney Afrika" },
        { code: "ES", name: "İspanya" },
        { code: "SE", name: "İsveç" },
        { code: "CH", name: "İsviçre" },
        { code: "TW", name: "Tayvan" },
        { code: "TH", name: "Tayland" },
        { code: "TR", name: "Türkiye" },
        { code: "UA", name: "Ukrayna" },
        { code: "AE", name: "Birleşik Arap Emirlikleri" },
        { code: "GB", name: "Birleşik Krallık" },
        { code: "US", name: "Amerika Birleşik Devletleri" },
        { code: "VE", name: "Venezuela" },
        { code: "VN", name: "Vietnam" }
    ] : [
        { code: "AF", name: "Afghanistan" },
        { code: "AL", name: "Albania" },
        { code: "DZ", name: "Algeria" },
        { code: "AR", name: "Argentina" },
        { code: "AU", name: "Australia" },
        { code: "AT", name: "Austria" },
        { code: "BD", name: "Bangladesh" },
        { code: "BE", name: "Belgium" },
        { code: "BR", name: "Brazil" },
        { code: "BG", name: "Bulgaria" },
        { code: "CA", name: "Canada" },
        { code: "CL", name: "Chile" },
        { code: "CN", name: "China" },
        { code: "CO", name: "Colombia" },
        { code: "HR", name: "Croatia" },
        { code: "CZ", name: "Czech Republic" },
        { code: "DK", name: "Denmark" },
        { code: "EG", name: "Egypt" },
        { code: "FI", name: "Finland" },
        { code: "FR", name: "France" },
        { code: "DE", name: "Germany" },
        { code: "GR", name: "Greece" },
        { code: "HK", name: "Hong Kong" },
        { code: "HU", name: "Hungary" },
        { code: "IN", name: "India" },
        { code: "ID", name: "Indonesia" },
        { code: "IR", name: "Iran" },
        { code: "IE", name: "Ireland" },
        { code: "IL", name: "Israel" },
        { code: "IT", name: "Italy" },
        { code: "JP", name: "Japan" },
        { code: "JO", name: "Jordan" },
        { code: "KE", name: "Kenya" },
        { code: "KR", name: "South Korea" },
        { code: "KW", name: "Kuwait" },
        { code: "MY", name: "Malaysia" },
        { code: "MX", name: "Mexico" },
        { code: "MA", name: "Morocco" },
        { code: "NL", name: "Netherlands" },
        { code: "NZ", name: "New Zealand" },
        { code: "NG", name: "Nigeria" },
        { code: "NO", name: "Norway" },
        { code: "PK", name: "Pakistan" },
        { code: "PE", name: "Peru" },
        { code: "PH", name: "Philippines" },
        { code: "PL", name: "Poland" },
        { code: "PT", name: "Portugal" },
        { code: "QA", name: "Qatar" },
        { code: "RO", name: "Romania" },
        { code: "RU", name: "Russia" },
        { code: "SA", name: "Saudi Arabia" },
        { code: "SG", name: "Singapore" },
        { code: "ZA", name: "South Africa" },
        { code: "ES", name: "Spain" },
        { code: "SE", name: "Sweden" },
        { code: "CH", name: "Switzerland" },
        { code: "TW", name: "Taiwan" },
        { code: "TH", name: "Thailand" },
        { code: "TR", name: "Turkey" },
        { code: "UA", name: "Ukraine" },
        { code: "AE", name: "United Arab Emirates" },
        { code: "GB", name: "United Kingdom" },
        { code: "US", name: "United States" },
        { code: "VE", name: "Venezuela" },
        { code: "VN", name: "Vietnam" }
    ];
    if (code === "XX") {
        return LANG === "tr" ? "Diğerleri" : "Others";
    }
    const country = countries.find(c => c.code === code);
    return country ? country.name : null;
}

// Ülke listesi - merkezi fonksiyon (register sayfasındaki sırayla aynı)
function getCountryOptionsHTML(selectedValue?: string): string {
    const countries = LANG === "tr" ? [
        { code: "AF", name: "Afganistan" },
        { code: "DE", name: "Almanya" },
        { code: "US", name: "Amerika Birleşik Devletleri" },
        { code: "AO", name: "Angola" },
        { code: "AR", name: "Arjantin" },
        { code: "AL", name: "Arnavutluk" },
        { code: "AU", name: "Avustralya" },
        { code: "AT", name: "Avusturya" },
        { code: "AZ", name: "Azerbaycan" },
        { code: "BD", name: "Bangladeş" },
        { code: "BY", name: "Belarus" },
        { code: "BE", name: "Belçika" },
        { code: "AE", name: "Birleşik Arap Emirlikleri" },
        { code: "GB", name: "Birleşik Krallık" },
        { code: "BO", name: "Bolivya" },
        { code: "BA", name: "Bosna-Hersek" },
        { code: "BW", name: "Botsvana" },
        { code: "BR", name: "Brezilya" },
        { code: "BG", name: "Bulgaristan" },
        { code: "DZ", name: "Cezayir" },
        { code: "CN", name: "Çin" },
        { code: "CZ", name: "Çek Cumhuriyeti" },
        { code: "DK", name: "Danimarka" },
        { code: "DO", name: "Dominik Cumhuriyeti" },
        { code: "EC", name: "Ekvador" },
        { code: "SV", name: "El Salvador" },
        { code: "ID", name: "Endonezya" },
        { code: "ER", name: "Eritre" },
        { code: "AM", name: "Ermenistan" },
        { code: "EE", name: "Estonya" },
        { code: "ET", name: "Etiyopya" },
        { code: "MA", name: "Fas" },
        { code: "PH", name: "Filipinler" },
        { code: "FI", name: "Finlandiya" },
        { code: "FR", name: "Fransa" },
        { code: "GH", name: "Gana" },
        { code: "GT", name: "Guatemala" },
        { code: "ZA", name: "Güney Afrika" },
        { code: "KR", name: "Güney Kore" },
        { code: "GE", name: "Gürcistan" },
        { code: "IN", name: "Hindistan" },
        { code: "HR", name: "Hırvatistan" },
        { code: "NL", name: "Hollanda" },
        { code: "HK", name: "Hong Kong" },
        { code: "IQ", name: "Irak" },
        { code: "IR", name: "İran" },
        { code: "IE", name: "İrlanda" },
        { code: "ES", name: "İspanya" },
        { code: "IL", name: "İsrail" },
        { code: "SE", name: "İsveç" },
        { code: "CH", name: "İsviçre" },
        { code: "IT", name: "İtalya" },
        { code: "IS", name: "İzlanda" },
        { code: "JM", name: "Jamaika" },
        { code: "JP", name: "Japonya" },
        { code: "KH", name: "Kamboçya" },
        { code: "CM", name: "Kamerun" },
        { code: "CA", name: "Kanada" },
        { code: "ME", name: "Karadağ" },
        { code: "QA", name: "Katar" },
        { code: "KZ", name: "Kazakistan" },
        { code: "KE", name: "Kenya" },
        { code: "CO", name: "Kolombiya" },
        { code: "CR", name: "Kosta Rika" },
        { code: "XK", name: "Kosova" },
        { code: "KW", name: "Kuveyt" },
        { code: "CU", name: "Küba" },
        { code: "LA", name: "Laos" },
        { code: "LV", name: "Letonya" },
        { code: "LY", name: "Libya" },
        { code: "LT", name: "Litvanya" },
        { code: "LU", name: "Lüksemburg" },
        { code: "HU", name: "Macaristan" },
        { code: "MG", name: "Madagaskar" },
        { code: "MY", name: "Malezya" },
        { code: "MT", name: "Malta" },
        { code: "MX", name: "Meksika" },
        { code: "EG", name: "Mısır" },
        { code: "MN", name: "Moğolistan" },
        { code: "MD", name: "Moldova" },
        { code: "MM", name: "Myanmar" },
        { code: "NP", name: "Nepal" },
        { code: "NG", name: "Nijerya" },
        { code: "NO", name: "Norveç" },
        { code: "OM", name: "Umman" },
        { code: "PK", name: "Pakistan" },
        { code: "PA", name: "Panama" },
        { code: "PY", name: "Paraguay" },
        { code: "PE", name: "Peru" },
        { code: "PL", name: "Polonya" },
        { code: "PT", name: "Portekiz" },
        { code: "RO", name: "Romanya" },
        { code: "RU", name: "Rusya" },
        { code: "SA", name: "Suudi Arabistan" },
        { code: "RS", name: "Sırbistan" },
        { code: "SG", name: "Singapur" },
        { code: "SK", name: "Slovakya" },
        { code: "SI", name: "Slovenya" },
        { code: "LK", name: "Sri Lanka" },
        { code: "SD", name: "Sudan" },
        { code: "SY", name: "Suriye" },
        { code: "CL", name: "Şili" },
        { code: "TZ", name: "Tanzanya" },
        { code: "TH", name: "Tayland" },
        { code: "TW", name: "Tayvan" },
        { code: "TN", name: "Tunus" },
        { code: "TR", name: "Türkiye" },
        { code: "UG", name: "Uganda" },
        { code: "UA", name: "Ukrayna" },
        { code: "UY", name: "Uruguay" },
        { code: "VE", name: "Venezuela" },
        { code: "VN", name: "Vietnam" },
        { code: "YE", name: "Yemen" },
        { code: "NZ", name: "Yeni Zelanda" },
        { code: "GR", name: "Yunanistan" },
        { code: "ZM", name: "Zambiya" },
        { code: "ZW", name: "Zimbabve" },
        { code: "XX", name: "Diğerleri" }
    ] : [
        { code: "AF", name: "Afghanistan" },
        { code: "AL", name: "Albania" },
        { code: "DZ", name: "Algeria" },
        { code: "AO", name: "Angola" },
        { code: "AR", name: "Argentina" },
        { code: "AM", name: "Armenia" },
        { code: "AU", name: "Australia" },
        { code: "AT", name: "Austria" },
        { code: "AZ", name: "Azerbaijan" },
        { code: "BD", name: "Bangladesh" },
        { code: "BY", name: "Belarus" },
        { code: "BE", name: "Belgium" },
        { code: "BO", name: "Bolivia" },
        { code: "BA", name: "Bosnia and Herzegovina" },
        { code: "BW", name: "Botswana" },
        { code: "BR", name: "Brazil" },
        { code: "BG", name: "Bulgaria" },
        { code: "KH", name: "Cambodia" },
        { code: "CM", name: "Cameroon" },
        { code: "CA", name: "Canada" },
        { code: "CL", name: "Chile" },
        { code: "CN", name: "China" },
        { code: "CO", name: "Colombia" },
        { code: "CR", name: "Costa Rica" },
        { code: "HR", name: "Croatia" },
        { code: "CU", name: "Cuba" },
        { code: "CY", name: "Cyprus" },
        { code: "CZ", name: "Czech Republic" },
        { code: "DK", name: "Denmark" },
        { code: "DO", name: "Dominican Republic" },
        { code: "EC", name: "Ecuador" },
        { code: "EG", name: "Egypt" },
        { code: "SV", name: "El Salvador" },
        { code: "EE", name: "Estonia" },
        { code: "ET", name: "Ethiopia" },
        { code: "FI", name: "Finland" },
        { code: "FR", name: "France" },
        { code: "GE", name: "Georgia" },
        { code: "DE", name: "Germany" },
        { code: "GH", name: "Ghana" },
        { code: "GR", name: "Greece" },
        { code: "GT", name: "Guatemala" },
        { code: "HK", name: "Hong Kong" },
        { code: "HU", name: "Hungary" },
        { code: "IS", name: "Iceland" },
        { code: "IN", name: "India" },
        { code: "ID", name: "Indonesia" },
        { code: "IR", name: "Iran" },
        { code: "IQ", name: "Iraq" },
        { code: "IE", name: "Ireland" },
        { code: "IL", name: "Israel" },
        { code: "IT", name: "Italy" },
        { code: "JM", name: "Jamaica" },
        { code: "JP", name: "Japan" },
        { code: "JO", name: "Jordan" },
        { code: "KZ", name: "Kazakhstan" },
        { code: "KE", name: "Kenya" },
        { code: "KR", name: "South Korea" },
        { code: "KW", name: "Kuwait" },
        { code: "LA", name: "Laos" },
        { code: "LV", name: "Latvia" },
        { code: "LB", name: "Lebanon" },
        { code: "LY", name: "Libya" },
        { code: "LT", name: "Lithuania" },
        { code: "LU", name: "Luxembourg" },
        { code: "MG", name: "Madagascar" },
        { code: "MY", name: "Malaysia" },
        { code: "MT", name: "Malta" },
        { code: "MX", name: "Mexico" },
        { code: "MD", name: "Moldova" },
        { code: "MN", name: "Mongolia" },
        { code: "ME", name: "Montenegro" },
        { code: "MA", name: "Morocco" },
        { code: "MM", name: "Myanmar" },
        { code: "NP", name: "Nepal" },
        { code: "NL", name: "Netherlands" },
        { code: "NZ", name: "New Zealand" },
        { code: "NI", name: "Nicaragua" },
        { code: "NG", name: "Nigeria" },
        { code: "NO", name: "Norway" },
        { code: "OM", name: "Oman" },
        { code: "PK", name: "Pakistan" },
        { code: "PA", name: "Panama" },
        { code: "PY", name: "Paraguay" },
        { code: "PE", name: "Peru" },
        { code: "PH", name: "Philippines" },
        { code: "PL", name: "Poland" },
        { code: "PT", name: "Portugal" },
        { code: "QA", name: "Qatar" },
        { code: "RO", name: "Romania" },
        { code: "RU", name: "Russia" },
        { code: "SA", name: "Saudi Arabia" },
        { code: "RS", name: "Serbia" },
        { code: "SG", name: "Singapore" },
        { code: "SK", name: "Slovakia" },
        { code: "SI", name: "Slovenia" },
        { code: "ZA", name: "South Africa" },
        { code: "ES", name: "Spain" },
        { code: "LK", name: "Sri Lanka" },
        { code: "SD", name: "Sudan" },
        { code: "SE", name: "Sweden" },
        { code: "CH", name: "Switzerland" },
        { code: "SY", name: "Syria" },
        { code: "TW", name: "Taiwan" },
        { code: "TZ", name: "Tanzania" },
        { code: "TH", name: "Thailand" },
        { code: "TN", name: "Tunisia" },
        { code: "TR", name: "Turkey" },
        { code: "UG", name: "Uganda" },
        { code: "UA", name: "Ukraine" },
        { code: "AE", name: "United Arab Emirates" },
        { code: "GB", name: "United Kingdom" },
        { code: "US", name: "United States" },
        { code: "UY", name: "Uruguay" },
        { code: "VE", name: "Venezuela" },
        { code: "VN", name: "Vietnam" },
        { code: "YE", name: "Yemen" },
        { code: "ZM", name: "Zambia" },
        { code: "ZW", name: "Zimbabwe" },
        { code: "XX", name: "Others" }
    ];

    const selectLabel = LANG === "tr" ? "Ülke seç" : "Select country";
    let html = `<option value="">${selectLabel}</option>`;
    countries.forEach(country => {
        const selected = selectedValue === country.code ? ' selected' : '';
        html += `<option value="${country.code}"${selected}>${country.name}</option>`;
    });
    return html;
}

async function updateUserProfile(
    token: string,
    payload: { username?: string; firstName?: string; lastName?: string; nationality?: string }
): Promise<boolean> {
    try {
        const apiBase = (window.location.hostname === 'localhost' && window.location.port === '5500')
            ? 'http://localhost:8091'
            : '';
        const res = await fetch(`${apiBase}/api/v1/auth/profile`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + token
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            if (errorData.error === "username_taken") {
                console.warn("Username already taken");
                throw new Error("USERNAME_TAKEN");
            }
            console.warn("Profile update failed with status", res.status);
            return false;
        }
        return true;
    } catch (e) {
        console.error("Profile update error:", e);
        return false;
    }
}

function openImageCropper(file: File, onCrop: (dataUrl: string) => void): void {
    let cropperOverlay = document.getElementById("imageCropperOverlay") as HTMLElement | null;
    if (!cropperOverlay) {
        cropperOverlay = document.createElement("div");
        cropperOverlay.id = "imageCropperOverlay";
        cropperOverlay.className = "image-cropper-overlay hidden";
        document.body.appendChild(cropperOverlay);
    }

    const cropTitle = LANG === "tr" ? "Fotoğrafı Kırp" : "Crop Photo";
    const cropHint = LANG === "tr" ? "Kırpma alanını sürükleyin veya köşelerden boyutlandırın" : "Drag to move or resize from corners";
    const cancelLabel = LANG === "tr" ? "İptal" : "Cancel";
    const applyLabel = LANG === "tr" ? "Uygula" : "Apply";

    const reader = new FileReader();
    reader.onload = (e) => {
        const imageSrc = e.target?.result as string;
        
        cropperOverlay!.innerHTML = `
            <div class="image-cropper-backdrop"></div>
            <div class="image-cropper-modal">
                <div class="image-cropper-header">
                    <h2><i class="fa-solid fa-crop"></i> ${cropTitle}</h2>
                    <button class="image-cropper-close" aria-label="Close">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
                <div class="image-cropper-content">
                    <div class="image-cropper-canvas-container">
                        <canvas id="imageCropperCanvas"></canvas>
                        <p class="image-cropper-hint">${cropHint}</p>
                    </div>
                </div>
                <div class="image-cropper-actions">
                    <button type="button" class="image-cropper-cancel">${cancelLabel}</button>
                    <button type="button" class="image-cropper-apply">${applyLabel}</button>
                </div>
            </div>
        `;

        const canvas = cropperOverlay!.querySelector("#imageCropperCanvas") as HTMLCanvasElement;
        const closeBtn = cropperOverlay!.querySelector(".image-cropper-close") as HTMLElement;
        const backdrop = cropperOverlay!.querySelector(".image-cropper-backdrop") as HTMLElement;
        const cancelBtn = cropperOverlay!.querySelector(".image-cropper-cancel") as HTMLElement;
        const applyBtn = cropperOverlay!.querySelector(".image-cropper-apply") as HTMLElement;

        const img = new Image();
        img.onload = () => {
            const maxDisplaySize = 500;
            let displayWidth = img.width;
            let displayHeight = img.height;
            let scale = 1;
            
            if (displayWidth > maxDisplaySize || displayHeight > maxDisplaySize) {
                scale = Math.min(maxDisplaySize / displayWidth, maxDisplaySize / displayHeight);
                displayWidth = displayWidth * scale;
                displayHeight = displayHeight * scale;
            }

            canvas.width = displayWidth;
            canvas.height = displayHeight;
            const ctx = canvas.getContext("2d")!;
            
            // Crop box (kare, merkezde)
            let cropSize = Math.min(displayWidth, displayHeight) * 0.8;
            let cropX = (displayWidth - cropSize) / 2;
            let cropY = (displayHeight - cropSize) / 2;
            let isDragging = false;
            let isResizing = false;
            let resizeCorner = -1; // 0: top-left, 1: top-right, 2: bottom-left, 3: bottom-right
            let dragStartX = 0;
            let dragStartY = 0;
            let cropStartX = 0;
            let cropStartY = 0;
            let cropStartSize = 0;
            const handleSize = 15;
            const minCropSize = 50;
            
            const getCornerAt = (x: number, y: number): number => {
                const corners = [
                    [cropX, cropY], // top-left
                    [cropX + cropSize, cropY], // top-right
                    [cropX, cropY + cropSize], // bottom-left
                    [cropX + cropSize, cropY + cropSize] // bottom-right
                ];
                for (let i = 0; i < corners.length; i++) {
                    const [cx, cy] = corners[i];
                    const dist = Math.sqrt(Math.pow(x - cx, 2) + Math.pow(y - cy, 2));
                    if (dist <= handleSize) {
                        return i;
                    }
                }
                return -1;
            };
            
            const draw = () => {
                // Draw image
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, displayWidth, displayHeight);
                
                // Draw overlay (darken outside crop area) - saydam yapmak için daha açık
                ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                
                // Clear crop area (saydam yap)
                ctx.save();
                ctx.globalCompositeOperation = "destination-out";
                ctx.fillRect(cropX, cropY, cropSize, cropSize);
                ctx.restore();
                
                // Draw crop box border
                ctx.strokeStyle = "white";
                ctx.lineWidth = 2;
                ctx.strokeRect(cropX, cropY, cropSize, cropSize);
                
                // Draw corner handles
                ctx.fillStyle = "white";
                ctx.strokeStyle = "#22c1c3";
                ctx.lineWidth = 2;
                const corners = [
                    [cropX, cropY],
                    [cropX + cropSize, cropY],
                    [cropX, cropY + cropSize],
                    [cropX + cropSize, cropY + cropSize]
                ];
                corners.forEach(([x, y]) => {
                    ctx.beginPath();
                    ctx.arc(x, y, handleSize/2, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                });
            };

            draw();

            // Mouse events
            canvas.addEventListener("mousedown", (e) => {
                const rect = canvas.getBoundingClientRect();
                const x = (e.clientX - rect.left) * (canvas.width / rect.width);
                const y = (e.clientY - rect.top) * (canvas.height / rect.height);
                
                // Check if click is on a corner handle
                const corner = getCornerAt(x, y);
                if (corner !== -1) {
                    isResizing = true;
                    resizeCorner = corner;
                    dragStartX = x;
                    dragStartY = y;
                    cropStartX = cropX;
                    cropStartY = cropY;
                    cropStartSize = cropSize;
                    canvas.style.cursor = "nwse-resize";
                }
                // Check if click is inside crop box (for dragging)
                else if (x >= cropX && x <= cropX + cropSize && y >= cropY && y <= cropY + cropSize) {
                    isDragging = true;
                    dragStartX = x;
                    dragStartY = y;
                    cropStartX = cropX;
                    cropStartY = cropY;
                    canvas.style.cursor = "move";
                }
            });

            canvas.addEventListener("mousemove", (e) => {
                const rect = canvas.getBoundingClientRect();
                const x = (e.clientX - rect.left) * (canvas.width / rect.width);
                const y = (e.clientY - rect.top) * (canvas.height / rect.height);
                
                if (isResizing && resizeCorner !== -1) {
                    const deltaX = x - dragStartX;
                    const deltaY = y - dragStartY;
                    
                    if (resizeCorner === 0) { // top-left
                        const newSize = cropStartSize - deltaX;
                        const newSizeY = cropStartSize - deltaY;
                        const finalSize = Math.max(minCropSize, Math.min(newSize, newSizeY));
                        cropX = cropStartX + cropStartSize - finalSize;
                        cropY = cropStartY + cropStartSize - finalSize;
                        cropSize = finalSize;
                    } else if (resizeCorner === 1) { // top-right
                        const newSize = cropStartSize + deltaX;
                        const newSizeY = cropStartSize - deltaY;
                        const finalSize = Math.max(minCropSize, Math.min(newSize, newSizeY));
                        cropY = cropStartY + cropStartSize - finalSize;
                        cropSize = finalSize;
                    } else if (resizeCorner === 2) { // bottom-left
                        const newSize = cropStartSize - deltaX;
                        const newSizeY = cropStartSize + deltaY;
                        const finalSize = Math.max(minCropSize, Math.min(newSize, newSizeY));
                        cropX = cropStartX + cropStartSize - finalSize;
                        cropSize = finalSize;
                    } else if (resizeCorner === 3) { // bottom-right
                        const newSize = cropStartSize + deltaX;
                        const newSizeY = cropStartSize + deltaY;
                        const finalSize = Math.max(minCropSize, Math.min(newSize, newSizeY));
                        cropSize = finalSize;
                    }
                    
                    // Keep within canvas bounds
                    cropX = Math.max(0, Math.min(canvas.width - cropSize, cropX));
                    cropY = Math.max(0, Math.min(canvas.height - cropSize, cropY));
                    cropSize = Math.min(cropSize, canvas.width - cropX, canvas.height - cropY);
                    
                    draw();
                } else if (isDragging) {
                    const deltaX = x - dragStartX;
                    const deltaY = y - dragStartY;
                    
                    cropX = Math.max(0, Math.min(canvas.width - cropSize, cropStartX + deltaX));
                    cropY = Math.max(0, Math.min(canvas.height - cropSize, cropStartY + deltaY));
                    
                    draw();
                } else {
                    // Update cursor
                    const corner = getCornerAt(x, y);
                    if (corner !== -1) {
                        canvas.style.cursor = "nwse-resize";
                    } else if (x >= cropX && x <= cropX + cropSize && y >= cropY && y <= cropY + cropSize) {
                        canvas.style.cursor = "move";
                    } else {
                        canvas.style.cursor = "default";
                    }
                }
            });

            canvas.addEventListener("mouseup", () => {
                isDragging = false;
                isResizing = false;
                resizeCorner = -1;
                canvas.style.cursor = "default";
            });

            canvas.addEventListener("mouseleave", () => {
                isDragging = false;
                isResizing = false;
                resizeCorner = -1;
                canvas.style.cursor = "default";
            });

            // Touch events for mobile
            canvas.addEventListener("touchstart", (e) => {
                e.preventDefault();
                const touch = e.touches[0];
                const rect = canvas.getBoundingClientRect();
                const x = (touch.clientX - rect.left) * (canvas.width / rect.width);
                const y = (touch.clientY - rect.top) * (canvas.height / rect.height);
                
                const corner = getCornerAt(x, y);
                if (corner !== -1) {
                    isResizing = true;
                    resizeCorner = corner;
                    dragStartX = x;
                    dragStartY = y;
                    cropStartX = cropX;
                    cropStartY = cropY;
                    cropStartSize = cropSize;
                } else if (x >= cropX && x <= cropX + cropSize && y >= cropY && y <= cropY + cropSize) {
                    isDragging = true;
                    dragStartX = x;
                    dragStartY = y;
                    cropStartX = cropX;
                    cropStartY = cropY;
                }
            });

            canvas.addEventListener("touchmove", (e) => {
                e.preventDefault();
                const touch = e.touches[0];
                const rect = canvas.getBoundingClientRect();
                const x = (touch.clientX - rect.left) * (canvas.width / rect.width);
                const y = (touch.clientY - rect.top) * (canvas.height / rect.height);
                
                if (isResizing && resizeCorner !== -1) {
                    const deltaX = x - dragStartX;
                    const deltaY = y - dragStartY;
                    
                    if (resizeCorner === 0) {
                        const newSize = cropStartSize - deltaX;
                        const newSizeY = cropStartSize - deltaY;
                        const finalSize = Math.max(minCropSize, Math.min(newSize, newSizeY));
                        cropX = cropStartX + cropStartSize - finalSize;
                        cropY = cropStartY + cropStartSize - finalSize;
                        cropSize = finalSize;
                    } else if (resizeCorner === 1) {
                        const newSize = cropStartSize + deltaX;
                        const newSizeY = cropStartSize - deltaY;
                        const finalSize = Math.max(minCropSize, Math.min(newSize, newSizeY));
                        cropY = cropStartY + cropStartSize - finalSize;
                        cropSize = finalSize;
                    } else if (resizeCorner === 2) {
                        const newSize = cropStartSize - deltaX;
                        const newSizeY = cropStartSize + deltaY;
                        const finalSize = Math.max(minCropSize, Math.min(newSize, newSizeY));
                        cropX = cropStartX + cropStartSize - finalSize;
                        cropSize = finalSize;
                    } else if (resizeCorner === 3) {
                        const newSize = cropStartSize + deltaX;
                        const newSizeY = cropStartSize + deltaY;
                        const finalSize = Math.max(minCropSize, Math.min(newSize, newSizeY));
                        cropSize = finalSize;
                    }
                    
                    cropX = Math.max(0, Math.min(canvas.width - cropSize, cropX));
                    cropY = Math.max(0, Math.min(canvas.height - cropSize, cropY));
                    cropSize = Math.min(cropSize, canvas.width - cropX, canvas.height - cropY);
                    
                    draw();
                } else if (isDragging) {
                    const deltaX = x - dragStartX;
                    const deltaY = y - dragStartY;
                    
                    cropX = Math.max(0, Math.min(canvas.width - cropSize, cropStartX + deltaX));
                    cropY = Math.max(0, Math.min(canvas.height - cropSize, cropStartY + deltaY));
                    
                    draw();
                }
            });

            canvas.addEventListener("touchend", () => {
                isDragging = false;
                isResizing = false;
                resizeCorner = -1;
            });

            applyBtn.addEventListener("click", () => {
                // Calculate source coordinates in original image
                const sourceX = cropX / scale;
                const sourceY = cropY / scale;
                const sourceSize = cropSize / scale;
                
                // Create cropped canvas (400x400 for avatar)
                const outputSize = 400;
                const croppedCanvas = document.createElement("canvas");
                croppedCanvas.width = outputSize;
                croppedCanvas.height = outputSize;
                const croppedCtx = croppedCanvas.getContext("2d")!;
                
                croppedCtx.drawImage(
                    img,
                    sourceX, sourceY, sourceSize, sourceSize,
                    0, 0, outputSize, outputSize
                );
                
                const dataUrl = croppedCanvas.toDataURL("image/jpeg", 0.9);
                onCrop(dataUrl);
                cropperOverlay!.classList.add("hidden");
            });

            const closeCropper = () => {
                cropperOverlay!.classList.add("hidden");
            };

            closeBtn.addEventListener("click", closeCropper);
            backdrop.addEventListener("click", closeCropper);
            cancelBtn.addEventListener("click", closeCropper);
        };
        img.src = imageSrc;
    };
    reader.readAsDataURL(file);
    cropperOverlay.classList.remove("hidden");
}

function dataURLtoFile(dataUrl: string, filename: string): Promise<File> {
    return fetch(dataUrl)
        .then(res => res.blob())
        .then(blob => new File([blob], filename, { type: "image/jpeg" }));
}

async function uploadAvatar(token: string, file: File): Promise<boolean> {
    try {
        const apiBase = (window.location.hostname === 'localhost' && window.location.port === '5500')
            ? 'http://localhost:8091'
            : '';
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch(`${apiBase}/api/v1/auth/avatar`, {
            method: "POST",
            headers: {
                "Authorization": "Bearer " + token
            },
            body: formData
        });

        if (!res.ok) {
            console.warn("Avatar upload failed with status", res.status);
            return false;
        }
        return true;
    } catch (e) {
        console.error("Avatar upload error:", e);
        return false;
    }
}

function openEditProfilePopup(token: string, user: {
    username: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    nationality?: string;
    avatar?: string;
    avatarContentType?: string;
}): void {
    let overlay = document.getElementById("editProfileOverlay") as HTMLElement | null;
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "editProfileOverlay";
        overlay.className = "edit-profile-overlay hidden";
        document.body.appendChild(overlay);
    }

    const usernameLabel = LANG === "tr" ? "Kullanıcı Adı" : "Username";
    const emailLabel = LANG === "tr" ? "E-posta" : "Email";
    const firstNameLabel = LANG === "tr" ? "Ad" : "First Name";
    const lastNameLabel = LANG === "tr" ? "Soyad" : "Last Name";
    const countryLabel = LANG === "tr" ? "Ülke" : "Country";
    const avatarLabel = LANG === "tr" ? "Profil Fotoğrafı" : "Profile Photo";
    const avatarHint = LANG === "tr" ? "(en fazla 512KB, JPEG/PNG/WEBP)" : "(max 512KB, JPEG/PNG/WEBP)";
    const saveLabel = LANG === "tr" ? "Kaydet" : "Save";
    const cancelLabel = LANG === "tr" ? "İptal" : "Cancel";
    const title = LANG === "tr" ? "Profili Düzenle" : "Edit Profile";

    // Current avatar preview
    let currentAvatarHTML = '';
    if (user.avatar && user.avatarContentType) {
        currentAvatarHTML = `<img src="data:${user.avatarContentType};base64,${user.avatar}" alt="Avatar" class="edit-profile-avatar-preview" />`;
    } else {
        currentAvatarHTML = `<div class="edit-profile-avatar-preview-placeholder"><i class="fa-solid fa-user"></i></div>`;
    }

    overlay.innerHTML = `
        <div class="edit-profile-backdrop"></div>
        <div class="edit-profile-modal">
            <div class="edit-profile-header">
                <h2><i class="fa-solid fa-pencil"></i> ${title}</h2>
                <button class="edit-profile-close" aria-label="Close">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
            <form id="editProfileForm" class="edit-profile-form" enctype="multipart/form-data">
                <div class="edit-profile-avatar-section">
                    <label>${avatarLabel}</label>
                    <div class="edit-profile-avatar-container">
                        <div class="edit-profile-avatar-current" id="editProfileAvatarPreview">
                            ${currentAvatarHTML}
                        </div>
                        <input type="file" name="avatar" id="editProfileAvatarInput" accept="image/jpeg,image/png,image/webp" class="edit-profile-avatar-input" />
                        <label for="editProfileAvatarInput" class="edit-profile-avatar-upload-btn">
                            <i class="fa-solid fa-camera"></i> ${LANG === "tr" ? "Fotoğraf Seç" : "Choose Photo"}
                        </label>
                    </div>
                    <p class="edit-profile-avatar-hint">${avatarHint}</p>
                </div>
                <div class="edit-profile-field">
                    <label>${usernameLabel}</label>
                    <input type="text" name="username" value="${escapeProfile(user.username)}" autocomplete="username" required />
                </div>
                <div class="edit-profile-grid edit-profile-grid-compact">
                    <div class="edit-profile-field">
                        <label>${firstNameLabel}</label>
                        <input type="text" name="firstName" value="${escapeProfile(user.firstName)}" autocomplete="given-name" />
                    </div>
                    <div class="edit-profile-field">
                        <label>${lastNameLabel}</label>
                        <input type="text" name="lastName" value="${escapeProfile(user.lastName)}" autocomplete="family-name" />
                    </div>
                </div>
                <div class="edit-profile-field edit-profile-field-email">
                    <label>${emailLabel}</label>
                    <input type="email" name="email" value="${escapeProfile(user.email)}" readonly class="edit-profile-readonly" />
                </div>
                <div class="edit-profile-field edit-profile-field-country">
                    <label>${countryLabel}</label>
                    <select name="nationality" class="edit-profile-select">
                        ${getCountryOptionsHTML(user.nationality ?? undefined)}
                    </select>
                </div>
                <div class="edit-profile-message" id="editProfileMessage"></div>
                <div class="edit-profile-actions">
                    <button type="button" class="edit-profile-cancel">${cancelLabel}</button>
                    <button type="submit" class="edit-profile-save">${saveLabel}</button>
                </div>
            </form>
        </div>
    `;

    const closeBtn = overlay.querySelector(".edit-profile-close") as HTMLElement | null;
    const backdrop = overlay.querySelector(".edit-profile-backdrop") as HTMLElement | null;
    const cancelBtn = overlay.querySelector(".edit-profile-cancel") as HTMLElement | null;
    const form = overlay.querySelector("#editProfileForm") as HTMLFormElement | null;
    const messageEl = overlay.querySelector("#editProfileMessage") as HTMLElement | null;

    const closePopup = () => {
        overlay?.classList.add("hidden");
    };

    if (closeBtn) closeBtn.addEventListener("click", closePopup);
    if (backdrop) backdrop.addEventListener("click", closePopup);
    if (cancelBtn) cancelBtn.addEventListener("click", closePopup);

    // Avatar preview on file select
    const avatarInput = overlay.querySelector("#editProfileAvatarInput") as HTMLInputElement | null;
    const avatarPreview = overlay.querySelector("#editProfileAvatarPreview") as HTMLElement | null;
    let selectedFile: File | null = null;
    
    if (avatarInput && avatarPreview) {
        avatarInput.addEventListener("change", (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) {
                const maxBytes = 512 * 1024; // 512KB
                if (file.size > maxBytes) {
                    if (messageEl) {
                        messageEl.textContent = LANG === "tr" 
                            ? "Profil fotoğrafı en fazla 512KB olabilir."
                            : "Profile photo must be max 512KB.";
                        messageEl.classList.add("error");
                        messageEl.classList.remove("success");
                        messageEl.style.display = "block";
                    }
                    avatarInput.value = "";
                    return;
                }

                selectedFile = file;
                openImageCropper(file, (croppedDataUrl: string) => {
                    avatarPreview.innerHTML = `<img src="${croppedDataUrl}" alt="Avatar preview" class="edit-profile-avatar-preview" />`;
                    // Update the file input with cropped image
                    dataURLtoFile(croppedDataUrl, file.name).then(croppedFile => {
                        selectedFile = croppedFile;
                        const dataTransfer = new DataTransfer();
                        dataTransfer.items.add(croppedFile);
                        avatarInput.files = dataTransfer.files;
                    });
                });
            }
        });
    }

    if (form) {
        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (messageEl) {
                messageEl.textContent = LANG === "tr" ? "Kaydediliyor..." : "Saving...";
                messageEl.classList.remove("success", "error");
                messageEl.style.display = "block";
            }

            const formData = new FormData(form);
            const username = (formData.get("username") as string | null)?.trim() ?? "";
            const firstName = (formData.get("firstName") as string | null)?.trim() ?? "";
            const lastName = (formData.get("lastName") as string | null)?.trim() ?? "";
            const nationality = (formData.get("nationality") as string | null)?.trim() ?? "";
            // If nationality is empty string, send null
            const nationalityValue = nationality === "" ? null : nationality;

            // Validate username
            if (!username || username.length < 3) {
                if (messageEl) {
                    messageEl.textContent = LANG === "tr"
                        ? "Kullanıcı adı en az 3 karakter olmalıdır."
                        : "Username must be at least 3 characters.";
                    messageEl.classList.add("error");
                    messageEl.classList.remove("success");
                    messageEl.style.display = "block";
                }
                return;
            }

            // Update profile info first
            let ok = false;
            try {
                ok = await updateUserProfile(token, { username, firstName, lastName, nationality: nationalityValue ?? undefined });
            } catch (e: any) {
                if (e.message === "USERNAME_TAKEN") {
                    if (messageEl) {
                        messageEl.textContent = LANG === "tr"
                            ? "Bu kullanıcı adı zaten alınmış."
                            : "This username is already taken.";
                        messageEl.classList.add("error");
                        messageEl.classList.remove("success");
                        messageEl.style.display = "block";
                    }
                    return;
                }
            }

            // Upload avatar if selected
            let avatarOk = true;
            const avatarFile = formData.get("avatar") as File | null;
            if (avatarFile && avatarFile.size > 0) {
                avatarOk = await uploadAvatar(token, avatarFile);
            }

            if (ok && avatarOk) {
                if (messageEl) {
                    messageEl.textContent = LANG === "tr" ? "Profil güncellendi." : "Profile updated.";
                    messageEl.classList.add("success");
                    messageEl.classList.remove("error");
                }
                // Reload user info to reflect changes
                setTimeout(async () => {
                    await renderUserInfo(token);
                    setTimeout(closePopup, 500);
                }, 500);
            } else {
                if (messageEl) {
                    const errorText = LANG === "tr"
                        ? "Profil güncellenemedi."
                        : "Failed to update profile.";
                    messageEl.textContent = errorText;
                    messageEl.classList.add("error");
                    messageEl.classList.remove("success");
                }
            }
        });
    }

    overlay.classList.remove("hidden");
}

/**
 * User sayfası için kullanıcı bilgilerini render et (üst kısım)
 */
async function renderUserInfo(token: string): Promise<void> {
    const userInfoSection = document.getElementById("userInfoSection") as HTMLElement | null;
    if (!userInfoSection) return;

    try {
        const apiBase = (window.location.hostname === 'localhost' && window.location.port === '5500')
            ? 'http://localhost:8091'
            : '';
        const res = await fetch(`${apiBase}/api/v1/auth/me`, {
            headers: {
                "Authorization": "Bearer " + token
            }
        });
        if (!res.ok) {
            throw new Error("Failed to fetch user info");
        }
        const user = await res.json() as {
            username: string;
            email?: string;
            firstName?: string;
            lastName?: string;
            nationality?: string;
            avatar?: string;
            avatarContentType?: string;
        };

        // Avatar HTML
        let avatarHTML = '';
        if (user.avatar && user.avatarContentType) {
            avatarHTML = `<img src="data:${user.avatarContentType};base64,${user.avatar}" alt="${escapeProfile(user.username)}" class="user-avatar-img" />`;
        } else {
            avatarHTML = `<i class="fa-solid fa-user"></i>`;
        }

        userInfoSection.innerHTML = `
            <div class="user-info-card">
                <button class="user-edit-btn" id="userEditBtn" aria-label="${LANG === "tr" ? "Düzenle" : "Edit"}">
                    <i class="fa-solid fa-pencil"></i>
                </button>
                <div class="user-avatar">
                    ${avatarHTML}
                </div>
                <h2 class="user-name">@${escapeProfile(user.username)}</h2>
            </div>
        `;

        // Edit button click handler
        const editBtn = document.getElementById("userEditBtn");
        if (editBtn) {
            editBtn.addEventListener("click", () => {
                openEditProfilePopup(token, user);
            });
        }
    } catch (e) {
        console.error("Error loading user info:", e);
        userInfoSection.innerHTML = `
            <div class="user-info-card">
                <p>${LANG === "tr" ? "Kullanıcı bilgileri yüklenemedi." : "Failed to load user info."}</p>
            </div>
        `;
    }
}

/**
 * Stats kartını stats sayfasında veya user sayfasında göster.
 */
function renderUserStats(stats: UserStats | null): void {
    // Stats sayfası için
    const statsPageContainer = document.getElementById("statsPageContainer") as HTMLElement | null;
    // User sayfası için
    const userStatsContainer = document.getElementById("userStatsContainer") as HTMLElement | null;
    
    const pageContainer = statsPageContainer || userStatsContainer;

    if (!pageContainer) {
        return;
    }

    // Önce içeriği temizle
    pageContainer.innerHTML = "";

    if (!stats) {
        // Login değilse veya istatistik yoksa mesaj göster
        const empty = document.createElement("div");
        empty.className = "user-stats-summary stats-empty";
        empty.innerHTML = `
            <div class="stats-line">
                <span>${LANG === "tr" ? "İstatistikleri görmek için giriş yap." : "Log in to see your statistics."}</span>
            </div>
        `;
        pageContainer.appendChild(empty);
        return;
    }

    const langGames = stats.gamesPerLanguage?.[LANG] ?? 0;
    const currentStreak = stats.currentStreak ?? 0;
    const achievementData = evaluateAchievements(stats, LANG);
    
    // Stats grid container
    const statsGrid = document.createElement("div");
    statsGrid.className = "stats-grid";
    
    // Her stat için ayrı kart (Achievements en başta)
    const statsCards = [
        {
            icon: "fa-medal",
            label: LANG === "tr" ? "Başarılar" : "Achievements",
            value: `${achievementData.unlocked}/${achievementData.total}`,
            gradient: "linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)",
            onClick: () => openAchievementsPopup(achievementData)
        },
        {
            icon: "fa-trophy",
            label: LANG === "tr" ? "En İyi Skor" : "Best Score",
            value: stats.bestScore.toString(),
            gradient: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)"
        },
        {
            icon: "fa-chart-line",
            label: LANG === "tr" ? "Ortalama Skor" : "Average Score",
            value: stats.averageScore.toFixed(1),
            gradient: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)"
        },
        {
            icon: "fa-clock",
            label: LANG === "tr" ? "Ortalama Süre" : "Avg. Duration",
            value: `${stats.averageDurationSeconds.toFixed(1)}s`,
            gradient: "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)"
        },
        {
            icon: "fa-fire",
            label: LANG === "tr" ? "Mevcut Seri" : "Current Streak",
            value: currentStreak.toString(),
            gradient: "linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%)"
        },
        {
            icon: "fa-globe",
            label: LANG === "tr" ? "Oyun Sayısı" : "Games",
            value: langGames.toString(),
            gradient: "linear-gradient(135deg, #fa709a 0%, #fee140 100%)"
        }
    ];
    
    statsCards.forEach(card => {
        const cardEl = document.createElement("div");
        cardEl.className = "stat-card";
        cardEl.style.background = card.gradient;
        cardEl.innerHTML = `
            <div class="stat-icon">
                <i class="fa-solid ${card.icon}"></i>
            </div>
            <div class="stat-content">
                <div class="stat-label">${card.label}</div>
                <div class="stat-value">${card.value}</div>
            </div>
        `;
        if (card.onClick) {
            cardEl.classList.add("stat-card-clickable");
            cardEl.addEventListener("click", () => card.onClick());
        }
        statsGrid.appendChild(cardEl);
    });
    
    pageContainer.appendChild(statsGrid);
}

// Update account menu based on authentication status
async function updateAccountMenu(): Promise<void> {
    const token = localStorage.getItem("jwtToken");
    const authLinks = document.querySelector('.auth-links') as HTMLElement | null;
    const guestOnlyItems = document.querySelectorAll('.guest-only') as NodeListOf<HTMLElement>;

    if (!token) {
        renderUserStats(null);
        if (userInfo) userInfo.classList.add("hidden");
        if (mobileUserInfo) mobileUserInfo.classList.add("hidden");
        if (authLinks) authLinks.style.display = 'flex';
        guestOnlyItems.forEach((el) => {
            el.style.display = "";
        });
        return;
    }

    try {
        const apiBase = (window.location.hostname === 'localhost' && window.location.port === '5500')
            ? 'http://localhost:8091'
            : '';
        const res = await fetch(`${apiBase}/api/v1/auth/me`, {
            headers: {
                "Authorization": "Bearer " + token
            }
        });

        if (!res.ok) {
            throw new Error("Auth check failed");
        }

        if (userInfo) userInfo.classList.remove("hidden");
        if (mobileUserInfo) mobileUserInfo.classList.remove("hidden");
        
        // User sayfası için kullanıcı bilgilerini render et
        const userInfoSection = document.getElementById("userInfoSection");
        if (userInfoSection) {
            await renderUserInfo(token);
        }
        
        const stats = await loadUserStats(token);
        renderUserStats(stats);
        if (authLinks) authLinks.style.display = 'none';
        guestOnlyItems.forEach((el) => {
            el.style.display = "none";
        });
    } catch (error) {
        console.error("Auth check error:", error);
        localStorage.removeItem("jwtToken");
        localStorage.removeItem("tokenExpiry");
        if (userInfo) userInfo.classList.add("hidden");
        if (mobileUserInfo) mobileUserInfo.classList.add("hidden");
        if (authLinks) authLinks.style.display = 'flex';
        guestOnlyItems.forEach((el) => {
            el.style.display = "";
        });
    }
}

function setupMobileMenu(): void {
    const burger = document.querySelector(".burger") as HTMLElement | null;
    const fullscreenMenu = document.querySelector(".fullscreen-menu") as HTMLElement | null;
    const closeBtn = document.querySelector(".close-menu") as HTMLElement | null;

    if (burger && fullscreenMenu) {
        burger.addEventListener("click", () => {
            fullscreenMenu.classList.remove("hidden");
            fullscreenMenu.classList.add("show");
        });
    }

    if (closeBtn && fullscreenMenu) {
        closeBtn.addEventListener("click", () => {
            fullscreenMenu.classList.remove("show");
            setTimeout(() => {
                fullscreenMenu.classList.add("hidden");
            }, 300); // transition süresi kadar
        });
    }

    // Add dark mode toggle to mobile menu
    if (fullscreenMenu) {
        const menuList = fullscreenMenu.querySelector("ul");
        if (menuList && !fullscreenMenu.querySelector("#mobileDarkModeToggle")) {
            const darkModeToggle = document.createElement("li");
            darkModeToggle.innerHTML = `
                <button class="dark-mode-toggle mobile-dark-toggle" id="mobileDarkModeToggle" style="display: flex; align-items: center; justify-content: center; gap: 12px; width: 100%; padding: 16px 24px; background: none; border: none; text-align: center; font-size: 24px; font-weight: 600; cursor: pointer;">
                    <span class="dark-mode-switch">
                        <span class="dark-mode-slider"></span>
                    </span>
                    <span class="dark-mode-label">${LANG === "tr" ? "Koyu Mod" : "Dark Mode"}</span>
                </button>
            `;
            // Insert after language link
            const langItem = menuList.querySelector('a[href*="/tr/"], a[href*="/en/"]')?.closest("li");
            if (langItem) {
                menuList.insertBefore(darkModeToggle, langItem);
            } else {
                menuList.appendChild(darkModeToggle);
            }

            const darkModeBtn = fullscreenMenu.querySelector("#mobileDarkModeToggle");
            if (darkModeBtn) {
                darkModeBtn.addEventListener("click", () => {
                    toggleDarkMode();
                    updateDarkModeButton();
                    // Also update mobile button label
                    const label = darkModeBtn.querySelector(".dark-mode-label");
                    if (label) {
                        const isDark = document.documentElement.getAttribute("data-theme") === "dark";
                        label.textContent = LANG === "tr" ? (isDark ? "Açık Mod" : "Koyu Mod") : (isDark ? "Light Mode" : "Dark Mode");
                    }
                });
            }
        }
    }
}

setupMobileMenu();

async function init(): Promise<void> {
    // If this is the daily page, skip - daily.ts handles its own init
    if (window.location.pathname.includes("daily.html")) {
        await updateAccountMenu();
        return;
    }

    // If this is not the game page, only update the account menu.
    const keyboard = document.querySelector(".keyboard") as HTMLElement | null;
    if (!keyboard) {
        await updateAccountMenu();
        return;
    }


    await loadValidWords();

    const today = await getTodaysWord();
    let CORRECT_WORD = toUpper(today.word);
    let DEFINITION = today.definition;

    console.log(`[Practice] Word: ${CORRECT_WORD}, Definition: ${DEFINITION}`);
    console.log(`[Practice] Valid words loaded: ${validWords.size}, Lang: ${LANG}`);

    keyboard.addEventListener("click", function (event: MouseEvent) {
        if (done || isLoading) {
            return;
        }

        const target = event.target as HTMLElement | null;
        if (!target || !target.classList.contains("key")) return;

        // kısa basma animasyonu
        target.classList.add("key-pressed");
        setTimeout(() => target.classList.remove("key-pressed"), 90);

        let inputLetter = toUpper(target.textContent?.trim() || '');
        if (!inputLetter) return;

        if (isLetter(inputLetter)) {
            addLetter(inputLetter);
        }
        else if (inputLetter === "ENTER") {
            if (currentGuess.length === ANSWER_LENGTH) {
                commit(CORRECT_WORD, today.definition);
            }
        }
        else if (inputLetter === "⌫") {
            erase();
        }
    });

    document.addEventListener("keydown", function (event: KeyboardEvent) {
        if (done || isLoading) {
            return;
        }
        let inputLetter = toUpper(event.key);
        if (isLetter(inputLetter)) {
            addLetter(inputLetter);
        }
        else if (inputLetter === "ENTER") {
            if (currentGuess.length === ANSWER_LENGTH) {
                commit(CORRECT_WORD, today.definition);
            }
        }
        else if (inputLetter === "BACKSPACE") {
            erase();
        }
    });

    // Hint system - only for English Practice mode
    const hintButton = document.getElementById("hint-btn");
    const hintEnablePopup = document.getElementById("hint-enable-popup");
    const hintDisplayPopup = document.getElementById("hint-display-popup");
    const hintEnableBtn = document.getElementById("hint-enable-btn");
    const hintCancelBtn = document.getElementById("hint-cancel-btn");
    let hintsEnabled = false;

    if (hintButton && LANG === 'en') {
        hintButton.addEventListener("click", () => {
            if (!hintsEnabled) {
                // Show enable confirmation popup
                if (hintEnablePopup) hintEnablePopup.classList.remove("hidden");
            } else {
                // Show hint
                const hintText = hintDisplayPopup?.querySelector(".hint-text") as HTMLElement | null;
                if (hintText) hintText.textContent = DEFINITION;
                if (hintDisplayPopup) hintDisplayPopup.classList.remove("hidden");
            }
        });
    }

    // Hint enable button
    if (hintEnableBtn) {
        hintEnableBtn.addEventListener("click", () => {
            hintsEnabled = true;
            if (hintButton) hintButton.classList.remove("hint-disabled");
            if (hintEnablePopup) hintEnablePopup.classList.add("hidden");
            // Show the hint immediately after enabling
            const hintText = hintDisplayPopup?.querySelector(".hint-text") as HTMLElement | null;
            if (hintText) hintText.textContent = DEFINITION;
            if (hintDisplayPopup) hintDisplayPopup.classList.remove("hidden");
        });
    }

    // Hint cancel button
    if (hintCancelBtn) {
        hintCancelBtn.addEventListener("click", () => {
            if (hintEnablePopup) hintEnablePopup.classList.add("hidden");
        });
    }

    // Hint display OK button
    const hintOkButton = hintDisplayPopup?.querySelector(".hint-ok-button");
    if (hintOkButton) {
        hintOkButton.addEventListener("click", () => {
            if (hintDisplayPopup) hintDisplayPopup.classList.add("hidden");
        });
    }

    if (playAgainBtn) {
        playAgainBtn.addEventListener("click", () => {
            window.location.reload(); // yeni kelime + reset
        });
    }

    await updateAccountMenu();
};

init();

// Zoom'u engelle ama hızlı yazmayı bozmadan
(function () {
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  let lastTouchTime = 0;

  if (!isSafari) {
    document.body.addEventListener('touchend', function (event) {
      const now = new Date().getTime();
      const timeDiff = now - lastTouchTime;

      if (timeDiff < 200 && event.cancelable) {
        event.preventDefault();
      }

      lastTouchTime = now;
    }, { passive: false });
  }

  document.body.addEventListener('gesturestart', function (e) {
    if (e.cancelable) e.preventDefault();
  }, { passive: false });

  document.body.addEventListener('dblclick', function (e) {
    if (e.cancelable) e.preventDefault();
  }, { passive: false });
})();

async function getTodaysWord(): Promise<{word: string; definition: string}> {
    const baseUrl = window.location.hostname === 'localhost' && window.location.port === '5500' 
        ? "http://localhost:8091" 
        : "";
    const apiUrl = `${baseUrl}/api/v1/word/random?lang=${LANG}`;
    const res = await fetch(apiUrl);
    const data = await res.json();
    return {
        word: toUpper(data.word),
        definition: data.definition
    };
}


function isLetter(letter: string): boolean {
    return /^[a-zA-ZçÇğĞıİöÖşŞüÜ]$/.test(letter);
}

function addLetter(letter: string): void {
    if (currentGuess.length < ANSWER_LENGTH) {
        (letters[currentRow * ANSWER_LENGTH + currentGuess.length] as HTMLElement).innerText = letter;
        currentGuess += letter;
    }
    else if (currentGuess.length === ANSWER_LENGTH) {
        (letters[currentRow * ANSWER_LENGTH + currentGuess.length - 1] as HTMLElement).innerText = letter;
        currentGuess = currentGuess.substring(0, currentGuess.length - 1) + letter;
    }
}

function erase(): void {
    if (currentGuess.length > 0) {
        (letters[currentRow * ANSWER_LENGTH + (currentGuess.length - 1)] as HTMLElement).innerText = "";
        currentGuess = currentGuess.substring(0, currentGuess.length - 1);
    }
}

// Klavye tuşunu güncelle (renk önceliği: correct > close > wrong)
function updateKeyboardKey(letter: string, status: "correct" | "close" | "wrong"): void {
    const keys = document.querySelectorAll(".key") as NodeListOf<HTMLElement>;
    for (const key of keys) {
        if (toUpper(key.textContent?.trim() || "") === toUpper(letter)) {
            if (status === "correct") {
                key.classList.remove("close", "wrong");
                key.classList.add("correct");
            } else if (status === "close") {
                if (!key.classList.contains("correct")) {
                    key.classList.remove("wrong");
                    key.classList.add("close");
                }
            } else if (status === "wrong") {
                if (!key.classList.contains("correct") && !key.classList.contains("close")) {
                    key.classList.add("wrong");
                }
            }
            break;
        }
    }
}

async function commit(CORRECT_WORD: string, DEF_TEXT: string): Promise<void> {
    const isItValid = validWords.has(toUpper(currentGuess));
    let map = makeMap(CORRECT_WORD);
    let letterStatuses: ("correct" | "close" | "wrong")[] = [];

    if (isItValid && currentGuess.length === ANSWER_LENGTH) {
        const startIndex = currentRow * ANSWER_LENGTH;
        const endIndex = startIndex + ANSWER_LENGTH;

        for (let i = 0; i < ANSWER_LENGTH; i++) {
            if (currentGuess[i] === CORRECT_WORD[i]) {
                letters[startIndex + i].classList.add("correct");
                letterStatuses[i] = "correct";
                map[CORRECT_WORD[i]]--;
            }
        }
        for (let i = 0; i < ANSWER_LENGTH; i++) {
            if (currentGuess[i] === CORRECT_WORD[i]) {
            }
            else if (CORRECT_WORD.includes(currentGuess[i]) && map[currentGuess[i]] != 0) {
                letters[startIndex + i].classList.add("close");
                letterStatuses[i] = "close";
                map[currentGuess[i]]--;
            }
            else {
                letters[startIndex + i].classList.add("wrong");
                letterStatuses[i] = "wrong";
            }
        }

        for (let i = 0; i < ANSWER_LENGTH; i++) {
            updateKeyboardKey(currentGuess[i], letterStatuses[i]);
        }

        // küçük bounce efekti
        for (let i = startIndex; i < endIndex; i++) {
            const box = letters[i] as HTMLElement;
            box.classList.add("flip-in");
            setTimeout(() => box.classList.remove("flip-in"), 150);
        }
    }
    else if (!isItValid && currentGuess.length === ANSWER_LENGTH) {
        const startIndex = currentRow * ANSWER_LENGTH;
        const endIndex = startIndex + ANSWER_LENGTH;

        for (let i = startIndex; i < endIndex; i++) {
            letters[i].classList.add("invalid");
        }
        const rowElement = letters[startIndex].parentElement;
        if (rowElement) {
            rowElement.classList.add("row-shake");
            setTimeout(() => rowElement.classList.remove("row-shake"), 250);
        }
        for (let i = startIndex; i < endIndex; i++) {
            setTimeout(function () {
                letters[i].classList.remove("invalid");
            }, 250);
        }
    }

    if (currentGuess.length === ANSWER_LENGTH && currentGuess != CORRECT_WORD && remainingLife >= 1 && isItValid) {
        currentRow++;
        remainingLife--;
        currentGuess = "";
        return;
    }
    else if (currentGuess === CORRECT_WORD) {
        winner(CORRECT_WORD, DEF_TEXT);
        done = true;
        return;
    }
    else if (currentGuess.length === ANSWER_LENGTH && currentGuess != CORRECT_WORD && remainingLife === 0 && isItValid) {
        loser(CORRECT_WORD,DEF_TEXT);
        done = true;
        return;
    }
}

function loading(status: boolean): boolean {
    loadingDiv?.classList.toggle("hidden");
    isLoading = status;
    return isLoading;
}

function winner(correctWord: string, definitionText: string): void {
    brandName?.classList.add("winner");
    done = true;
    if (resultText && resultPopup) {
        if (LANG === 'tr') {
            resultText.textContent = `Tebrikler! Kelime: ${correctWord}`;
        } else {
            resultText.textContent = `Congratulations! Word: ${correctWord}`;
            if (resultDef) resultDef.textContent = `Meaning: ${definitionText}`;
        }
        resultPopup.classList.remove("hidden");
    }
}

function loser(correctWord: string, definitionText: string): void {
    brandName?.classList.add("loser");
    done = true;
    if (resultText && resultPopup) {
        if (LANG === 'tr') {
            resultText.textContent = `Kaybettin! Kelime: ${capFirst(correctWord)}`;
        } else {
            resultText.textContent = `Game Over! Word: ${capFirst(correctWord)}`;
            if (resultDef) resultDef.textContent = `Meaning: ${definitionText}`;
        }
        resultPopup.classList.remove("hidden");
    }
}

function getToken(): string | null {
    try{ return localStorage.getItem("jwtToken");} catch (_) {return null;}
}

function capFirst(word: string): string {
    if (!word) return "";
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function makeMap(array: string): Record<string, number> {
    const obj: Record<string, number> = {};
    for (let i = 0; i < array.length; i++) {
        const letter = array[i];
        if (obj[letter]) {
            obj[letter]++;
        } else {
            obj[letter] = 1;
        }
    }
    return obj;
}


