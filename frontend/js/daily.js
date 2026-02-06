/**
 * Daily Challenge Mode
 * - Login gerekli
 * - Günde 1 kez oynanabilir
 * - Skor kaydedilir ve leaderboard'da görünür
 */

const letters = document.querySelectorAll(".letter-box");
const loadingDiv = document.querySelector(".loading");
const brandName = document.querySelector(".brand-name");
const resultPopup = document.getElementById("result-popup");
const resultText = resultPopup?.querySelector(".result-text");
const resultDef = resultPopup?.querySelector(".result-def");
const playAgainBtn = document.getElementById("play-again");
const alreadyPlayedPopup = document.getElementById("already-played-popup");
const startPopup = document.getElementById("start-popup");
const startGameBtn = document.getElementById("start-game-btn");
const gameTimer = document.getElementById("game-timer");
const timerDisplay = document.getElementById("timer-display");

const ANSWER_LENGTH = 5;
const TOTAL_TRIES = 6;
let done = false;
let isLoading = false;
let currentGuess = "";
let currentRow = 0;
let remainingLife = 5;
let gameStartMs = 0;
let scoreSent = false;
let timerInterval = null;
let gameStarted = false;

// Valid words set - local dosyadan yüklenir
let validWords = new Set();

// URL'den dil algıla: /en/daily.html → "en", /tr/daily.html → "tr"
// Genel kural: ilk segment 2 harf ise dil kodu kabul edilir (en, tr, de, fr ...)
function detectLanguage() {
    const path = window.location.pathname; // örn: "/en/daily.html"
    const match = path.match(/^\/([a-zA-Z]{2})\//);
    if (match && match[1]) {
        return match[1].toLowerCase();
    }
    // Dil segmenti yoksa veya okunamıyorsa varsayılan "en"
    return 'en';
}

const LANG = detectLanguage();
console.log('Language:', LANG);

// Türkçe için doğru uppercase (i→İ, ı→I)
function toUpper(str) {
    if (LANG === 'tr') {
        return str.toLocaleUpperCase('tr-TR');
    }
    return str.toUpperCase();
}

// Kelime listesini yükle
async function loadValidWords() {
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
        console.log(`Loaded ${validWords.size} valid words for ${LANG}`);
    } catch (e) {
        console.error('Failed to load valid words:', e);
    }
}

// API base URL
function getApiBase() {
    return (window.location.hostname === 'localhost' && window.location.port === '5500')
        ? 'http://localhost:8091'
        : '';
}

function getToken() {
    try {
        return localStorage.getItem("jwtToken");
    } catch (_) {
        return null;
    }
}

// Login kontrolü - login yoksa direkt yönlendir
function checkLogin() {
    const token = getToken();
    if (!token) {
        window.location.href = "auth/login.html";
        return false;
    }
    return true;
}

// Bugün bu dilde oynayıp oynamadığını kontrol et
async function checkDailyStatus() {
    const token = getToken();
    try {
        const res = await fetch(`${getApiBase()}/api/daily/status?lang=${LANG}`, {
            headers: {
                "Authorization": "Bearer " + token
            }
        });
        if (!res.ok) {
            throw new Error("Status check failed");
        }
        return await res.json();
    } catch (err) {
        console.error("Daily status check error:", err);
        return { played: false };
    }
}

// Günlük kelimeyi çek
async function getDailyWord() {
    const res = await fetch(`${getApiBase()}/api/word/daily?lang=${LANG}`);
    const data = await res.json();
    const word = toUpper(data.word);
    console.log(`🎯 Daily Word (${LANG}):`, word); // DEBUG
    return {
        word: word,
        definition: data.definition
    };
}

// Skor kaydet
async function sendScore({ attempts, durationMs, word }) {
    const token = getToken();
    if (!token) {
        console.log("token yok.");
        return;
    }

    try {
        const res = await fetch(`${getApiBase()}/api/scores?lang=${LANG}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + token
            },
            body: JSON.stringify({ attempts, durationMs, word })
        });

        if (!res.ok) {
            const text = await res.text().catch(() => "");
            console.error("Score post failed: ", res.status, text);
        }
        return await res.json().catch(() => ({}));
    } catch (err) {
        console.error("Score post error: ", err);
        return null;
    }
}

// Oyunu gizle, zaten oynadın mesajı göster
function showAlreadyPlayed(score) {
    document.querySelector(".game")?.classList.add("hidden");
    document.querySelector(".keyboard-container")?.classList.add("hidden");
    
    if (alreadyPlayedPopup) {
        alreadyPlayedPopup.classList.remove("hidden");
        const scoreText = alreadyPlayedPopup.querySelector(".score-text");
        if (scoreText && score) {
            if (LANG === 'tr') {
                scoreText.textContent = `Bugünkü skorun: ${score.score} (${score.attempts} deneme)`;
            } else {
                scoreText.textContent = `Today's score: ${score.score} (${score.attempts} attempts)`;
            }
        }
    }
}

// Timer fonksiyonları
function startTimer() {
    gameStartMs = Date.now();
    if (gameTimer) gameTimer.classList.remove("hidden");
    timerInterval = setInterval(updateTimer, 1000);
    updateTimer();
}

function updateTimer() {
    if (!timerDisplay) return;
    const elapsed = Math.floor((Date.now() - gameStartMs) / 1000);
    const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const seconds = (elapsed % 60).toString().padStart(2, '0');
    timerDisplay.textContent = `${minutes}:${seconds}`;
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

async function init() {
    // Login kontrolü
    if (!checkLogin()) return;

    // Oyunu ve klavyeyi başlangıçta gizle
    document.querySelector(".game")?.classList.add("hidden");
    document.querySelector(".keyboard-container")?.classList.add("hidden");

    // Bugün bu dilde oynayıp oynamadığını kontrol et
    const status = await checkDailyStatus();
    
    if (status.played) {
        // Zaten oynadı - alreadyPlayedPopup göster
        showAlreadyPlayed(status.score);
        return;
    }

    // Oynamadı - oyunu hazırla ve startPopup göster
    
    // Valid words listesini yükle
    await loadValidWords();

    // Kelimeyi önceden yükle
    const today = await getDailyWord();
    let CORRECT_WORD = toUpper(today.word);
    let DEFINITION = today.definition;

    // Start popup'ını göster
    if (startPopup) {
        startPopup.classList.remove("hidden");
    }

    // Start butonuna tıklanınca oyunu başlat
    if (startGameBtn) {
        startGameBtn.addEventListener("click", function() {
            if (gameStarted) return;
            gameStarted = true;
            
            // Popup'ı gizle
            if (startPopup) startPopup.classList.add("hidden");
            
            // Oyunu ve klavyeyi göster
            document.querySelector(".game")?.classList.remove("hidden");
            document.querySelector(".keyboard-container")?.classList.remove("hidden");
            
            // Timer'ı başlat
            startTimer();
        });
    }

    const keyboard = document.querySelector(".keyboard");
    if (keyboard) {
        keyboard.addEventListener("click", function (event) {
            if (done || isLoading || !gameStarted) return;

            let inputLetter = toUpper(event.target.textContent?.trim() || '');
            if (!inputLetter) return;

            if (isLetter(inputLetter)) {
                addLetter(inputLetter);
            } else if (inputLetter === "ENTER") {
                if (currentGuess.length === ANSWER_LENGTH) {
                    commit(CORRECT_WORD, DEFINITION);
                }
            } else if (inputLetter === "⌫") {
                erase();
            }
        });
    }

    document.addEventListener("keydown", function (event) {
        if (done || isLoading || !gameStarted) return;
        let inputLetter = toUpper(event.key);
        if (isLetter(inputLetter)) {
            addLetter(inputLetter);
        } else if (inputLetter === "ENTER") {
            if (currentGuess.length === ANSWER_LENGTH) {
                commit(CORRECT_WORD, DEFINITION);
            }
        } else if (inputLetter === "BACKSPACE") {
            erase();
        }
    });

    // Hint button
    const hintButton = document.querySelector(".hint-button");
    if (hintButton) {
        hintButton.addEventListener("click", () => {
            const popup = document.querySelector(".hint-popup");
            const hintText = document.querySelector(".hint-text");
            if (hintText) hintText.textContent = DEFINITION;
            if (popup) popup.classList.remove("hidden");
        });
    }

    const hintOkButton = document.querySelector(".hint-ok-button");
    if (hintOkButton) {
        hintOkButton.addEventListener("click", () => {
            const popup = document.querySelector(".hint-popup");
            if (popup) popup.classList.add("hidden");
        });
    }
}

function isLetter(letter) {
    // İngilizce ve Türkçe harfler
    return /^[a-zA-ZçÇğĞıİöÖşŞüÜ]$/.test(letter);
}

function addLetter(letter) {
    if (currentGuess.length < ANSWER_LENGTH) {
        letters[currentRow * ANSWER_LENGTH + currentGuess.length].innerText = letter;
        currentGuess += letter;
    } else if (currentGuess.length === ANSWER_LENGTH) {
        letters[currentRow * ANSWER_LENGTH + currentGuess.length - 1].innerText = letter;
        currentGuess = currentGuess.substring(0, currentGuess.length - 1) + letter;
    }
}

function erase() {
    if (currentGuess.length > 0) {
        letters[currentRow * ANSWER_LENGTH + (currentGuess.length - 1)].innerText = "";
        currentGuess = currentGuess.substring(0, currentGuess.length - 1);
    }
}

// Klavye tuşunu güncelle (renk önceliği: correct > close > wrong)
function updateKeyboardKey(letter, status) {
    const keys = document.querySelectorAll(".key");
    for (const key of keys) {
        if (toUpper(key.textContent.trim()) === toUpper(letter)) {
            // Öncelik kontrolü: correct > close > wrong
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

async function commit(CORRECT_WORD, DEF_TEXT) {
    // Local validation - API kullanmıyoruz
    const isItValid = validWords.has(toUpper(currentGuess));

    let map = makeMap(CORRECT_WORD);
    let letterStatuses = [];

    if (isItValid && currentGuess.length === ANSWER_LENGTH) {
        // Önce correct olanları bul
        for (let i = 0; i < ANSWER_LENGTH; i++) {
            if (currentGuess[i] === CORRECT_WORD[i]) {
                letters[currentRow * ANSWER_LENGTH + i].classList.add("correct");
                letterStatuses[i] = "correct";
                map[CORRECT_WORD[i]]--;
            }
        }
        // Sonra close ve wrong olanları bul
        for (let i = 0; i < ANSWER_LENGTH; i++) {
            if (currentGuess[i] === CORRECT_WORD[i]) {
                // already marked
            } else if (CORRECT_WORD.includes(currentGuess[i]) && map[currentGuess[i]] != 0) {
                letters[currentRow * ANSWER_LENGTH + i].classList.add("close");
                letterStatuses[i] = "close";
                map[currentGuess[i]]--;
            } else {
                letters[currentRow * ANSWER_LENGTH + i].classList.add("wrong");
                letterStatuses[i] = "wrong";
            }
        }

        // Klavye tuşlarını güncelle
        for (let i = 0; i < ANSWER_LENGTH; i++) {
            updateKeyboardKey(currentGuess[i], letterStatuses[i]);
        }
    } else if (!isItValid && currentGuess.length === ANSWER_LENGTH) {
        for (let i = 0; i < ANSWER_LENGTH; i++) {
            letters[currentRow * ANSWER_LENGTH + i].classList.add("invalid");
        }
        setTimeout(() => {
            for (let i = 0; i < ANSWER_LENGTH; i++) {
                letters[currentRow * ANSWER_LENGTH + i].classList.remove("invalid");
            }
        }, 1000);
    }

    if (currentGuess.length === ANSWER_LENGTH && currentGuess != CORRECT_WORD && remainingLife >= 1 && isItValid) {
        currentRow++;
        remainingLife--;
        currentGuess = "";
        return;
    } else if (currentGuess === CORRECT_WORD) {
        winner(CORRECT_WORD, DEF_TEXT);
        done = true;
        return;
    } else if (currentGuess.length === ANSWER_LENGTH && currentGuess != CORRECT_WORD && remainingLife === 0 && isItValid) {
        loser(CORRECT_WORD, DEF_TEXT);
        done = true;
        return;
    }
}

function loading(status) {
    loadingDiv?.classList.toggle("hidden");
    isLoading = status;
    return isLoading;
}

function winner(correctWord, definitionText) {
    brandName?.classList.add("winner");
    done = true;
    stopTimer(); // Timer'ı durdur
    
    if (resultText && resultPopup) {
        if (LANG === 'tr') {
            resultText.textContent = `Tebrikler! Kelime: ${correctWord}`;
        } else {
            resultText.textContent = `Congratulations! Word: ${correctWord}`;
            if (resultDef) resultDef.textContent = `Meaning: ${definitionText}`;
        }
        resultPopup.classList.remove("hidden");
    }

    // Daily Challenge: Skor kaydet
    if (scoreSent) return;
    scoreSent = true;

    const durationMs = Date.now() - gameStartMs;
    const attempts = TOTAL_TRIES - remainingLife;
    const word = correctWord;

    sendScore({ attempts, durationMs, word }).then(resp => console.log("Score Saved:", resp));
}

function loser(correctWord, definitionText) {
    brandName?.classList.add("loser");
    done = true;
    stopTimer(); // Timer'ı durdur
    
    if (resultText && resultPopup) {
        if (LANG === 'tr') {
            resultText.textContent = `Kaybettin! Kelime: ${correctWord}`;
        } else {
            resultText.textContent = `Game Over! Word: ${correctWord}`;
            if (resultDef) resultDef.textContent = `Meaning: ${definitionText}`;
        }
        resultPopup.classList.remove("hidden");
    }
    // Kaybetse de günlük hakkı biter (skor 0)
}

function makeMap(array) {
    const obj = {};
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

// Burger menu (mobile)
function setupMobileMenu() {
    const burger = document.querySelector(".burger");
    const fullscreenMenu = document.querySelector(".fullscreen-menu");
    const closeBtn = document.querySelector(".close-menu");

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
            }, 300);
        });
    }
}

document.addEventListener("DOMContentLoaded", () => {
    setupMobileMenu();
    init();
});
