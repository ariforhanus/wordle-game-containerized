const letters = document.querySelectorAll(".letter-box");
const loadingDiv = document.querySelector(".loading");
const brandName = document.querySelector(".brand-name");
const resultPopup  = document.getElementById("result-popup");
const resultText   = resultPopup?.querySelector(".result-text");
const resultDef    = resultPopup?.querySelector(".result-def");
const playAgainBtn = document.getElementById("play-again");

// Account dropdown elements
const accountBtn = document.getElementById("accountBtn");
const accountDropdown = document.getElementById("accountDropdown");
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
let validWords = new Set();

// URL'den dil algıla: /en/game.html → "en", /tr/game.html → "tr"
// Genel kural: ilk segment 2 harf ise dil kodu kabul edilir (en, tr, de, fr ...)
function detectLanguage() {
    const path = window.location.pathname; // örn: "/en/game.html"
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

// Account dropdown functionality
if (accountBtn && accountDropdown) {
    accountBtn.addEventListener("click", () => {
        accountDropdown.classList.toggle("show");
    });

    // Close dropdown when clicking outside
    document.addEventListener("click", (e) => {
        if (!accountBtn.contains(e.target) && !accountDropdown.contains(e.target)) {
            accountDropdown.classList.remove("show");
        }
    });
}

// Logout functionality
if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
        localStorage.removeItem("jwtToken");
        localStorage.removeItem("tokenExpiry");
        updateAccountMenu();
        accountDropdown.classList.remove("show");
    });
}

// Mobile logout functionality
if (mobileLogoutBtn) {
    mobileLogoutBtn.addEventListener("click", () => {
        localStorage.removeItem("jwtToken");
        localStorage.removeItem("tokenExpiry");
        updateAccountMenu();
        // Close mobile menu
        const fullscreenMenu = document.querySelector(".fullscreen-menu");
        if (fullscreenMenu) {
            fullscreenMenu.classList.remove("show");
            setTimeout(() => {
                fullscreenMenu.classList.add("hidden");
            }, 300);
        }
    });
}

// Update account menu based on authentication status
async function updateAccountMenu() {
    const token = localStorage.getItem("jwtToken");
    const authLinks = document.querySelector('.auth-links');
    const guestOnlyItems = document.querySelectorAll('.guest-only');

    if (!token) {
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
        const res = await fetch(`${apiBase}/auth/me`, {
            headers: {
                "Authorization": "Bearer " + token
            }
        });

        if (!res.ok) {
            throw new Error("Auth check failed");
        }

        if (userInfo) userInfo.classList.remove("hidden");
        if (mobileUserInfo) mobileUserInfo.classList.remove("hidden");
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
            }, 300); // transition süresi kadar
        });
    }
}

setupMobileMenu();

async function init() {

    // If this is not the game page, only update the account menu.
    const keyboard = document.querySelector(".keyboard");
    if (!keyboard) {
        updateAccountMenu();
        return;
    }

    // Valid words listesini yükle
    await loadValidWords();

    const today = await getTodaysWord();
    let CORRECT_WORD = toUpper(today.word);
    let DEFINITION = today.definition;
    console.log(CORRECT_WORD);
    console.log(today.definition);

    keyboard.addEventListener("click", function (event) {
    if (done || isLoading) {
        return;
    }

    let inputLetter = toUpper(event.target.textContent?.trim() || '');
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
    else {
        //Do nothing
    }
});



    document.addEventListener("keydown", function (event) {
        if (done || isLoading) {
            //Do nothing
            return;
        }
        inputLetter = toUpper(event.key);
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
        else {
            //Do nothing
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
                const hintText = hintDisplayPopup?.querySelector(".hint-text");
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
            const hintText = hintDisplayPopup?.querySelector(".hint-text");
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

    // Update account menu on init
    updateAccountMenu();
};

init();

    

// Zoom'u engelle ama hızlı yazmayı bozmadan
(function () {
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  let lastTouchTime = 0;

  // Sadece Chrome/diğer tarayıcılar için touchend'i kullan (Safari tıklamayı yutuyor)
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

  // Pinch-to-zoom gesture engelle (her tarayıcı için güvenli)
  document.body.addEventListener('gesturestart', function (e) {
    if (e.cancelable) e.preventDefault();
  }, { passive: false });

  // Çift tıklamayla zoom'u da engelle (her tarayıcı için güvenli)
  document.body.addEventListener('dblclick', function (e) {
    if (e.cancelable) e.preventDefault();
  }, { passive: false });
})();




async function getTodaysWord() {
    // Practice mode: Her refresh yeni random kelime
    const baseUrl = window.location.hostname === 'localhost' && window.location.port === '5500' 
        ? "http://localhost:8091" 
        : "";
    const apiUrl = `${baseUrl}/api/word/random?lang=${LANG}`;
    const res = await fetch(apiUrl);
    const data = await res.json();
    return {
        word: toUpper(data.word),
        definition: data.definition
    };
}


function getLocalWordFallback() {
    // TODO: localden kelime ve definition dönecek.

    return {
        word: "STACK",
        definition: "A LIFO (Last-In-First-Out) data structure used in memory management and algorithms."
    };
}

function isLetter(letter) {
    // İngilizce ve Türkçe harfler
    return /^[a-zA-ZçÇğĞıİöÖşŞüÜ]$/.test(letter);
}

function addLetter(letter) {
    if (currentGuess.length < ANSWER_LENGTH) {
        letters[currentRow * ANSWER_LENGTH + currentGuess.length].innerText = letter;
        currentGuess += letter;
    }
    else if (currentGuess.length === ANSWER_LENGTH) {
        letters[currentRow * ANSWER_LENGTH + currentGuess.length - 1].innerText = letter;
        currentGuess = currentGuess.substring(0, currentGuess.length - 1) + letter;
    }

}
function erase() {
    if (currentGuess.length > 0) {
        letters[currentRow * ANSWER_LENGTH + (currentGuess.length - 1)].innerText = "";
        currentGuess = currentGuess.substring(0, currentGuess.length - 1);
    }
    else {
        //Do nothing
    }
}

async function validateWord(currentGuess) {

}



// Klavye tuşunu güncelle (renk önceliği: correct > close > wrong)
function updateKeyboardKey(letter, status) {
    const keys = document.querySelectorAll(".key");
    for (const key of keys) {
        if (toUpper(key.textContent.trim()) === toUpper(letter)) {
            // Öncelik kontrolü: correct > close > wrong
            if (status === "correct") {
                // Correct her zaman uygulanır
                key.classList.remove("close", "wrong");
                key.classList.add("correct");
            } else if (status === "close") {
                // Close sadece correct değilse uygulanır
                if (!key.classList.contains("correct")) {
                    key.classList.remove("wrong");
                    key.classList.add("close");
                }
            } else if (status === "wrong") {
                // Wrong sadece close veya correct değilse uygulanır
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

    // Harf durumlarını sakla (önce correct'ları işle)
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
                // Zaten correct olarak işaretlendi
            }
            else if (CORRECT_WORD.includes(currentGuess[i]) && map[currentGuess[i]] != 0) {
                letters[currentRow * ANSWER_LENGTH + i].classList.add("close");
                letterStatuses[i] = "close";
                map[currentGuess[i]]--;
            }
            else {
                letters[currentRow * ANSWER_LENGTH + i].classList.add("wrong");
                letterStatuses[i] = "wrong";
            }
        }

        // Klavye tuşlarını güncelle
        for (let i = 0; i < ANSWER_LENGTH; i++) {
            updateKeyboardKey(currentGuess[i], letterStatuses[i]);
        }
    }
    else if (!isItValid && currentGuess.length === ANSWER_LENGTH) {
        for (let i = 0; i < ANSWER_LENGTH; i++) {
            letters[currentRow * ANSWER_LENGTH + i].classList.add("invalid");

        }
        for (let i = 0; i < ANSWER_LENGTH; i++) {
            setTimeout(function () {
                letters[currentRow * ANSWER_LENGTH + i].classList.remove("invalid");
            }, 1000);
        }
    }
    else {
        //Do nothing.
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
    else {
        //Do nothing.
    }

}

function loading(status) {
    loadingDiv.classList.toggle("hidden");
    if (status === true) {
        isLoading = true;
        return isLoading;
    }
    else if (status === false) {
        isLoading = false;
        return isLoading;
    }

}

function winner(correctWord, definitionText) {
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
    // Practice mode: Skor kaydedilmez
}

function loser(correctWord, definitionText) {
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

async function sendScore({attempts, durationMs, word}){
    const token = getToken();
    if(!token){
        console.log("token yok.")
        return;
    }

    try{
        // Use relative path for nginx proxy, fallback to direct backend URL for local development
        const apiUrl = window.location.hostname === 'localhost' && window.location.port === '5500' 
            ? "http://localhost:8091/api/scores" 
            : "/api/scores";
        const res = await fetch(apiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + token
            },
            body: JSON.stringify({attempts, durationMs, word })
        });

        if(!res.ok){
            const text = await res.text().catch(()=>"");
            console.error("Score post failed: ", res.status, text);
        }
        return await res.json().catch(()=>({}));
    }catch (err){
        console.error("Score post error: ", err);
        return null;
    }
}

function saveToken(token){
    try{localStorage.setItem("jwt", token);}catch(_) {}
}

function getToken(){
    try{ return localStorage.getItem("jwtToken");} catch (_) {return null;}
}

function capFirst(word) {
    if (!word) return "";
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}


function makeMap(array) {
    const obj = {
    }
    for (let i = 0; i < array.length; i++) {
        const letter = array[i]
        if (obj[letter]) {
            obj[letter]++
        }
        else {
            obj[letter] = 1;
        }
    }
    return obj;
}