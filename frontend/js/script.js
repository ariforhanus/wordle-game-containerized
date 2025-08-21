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
function updateAccountMenu() {
    const token = localStorage.getItem("jwtToken");
    
    if (token) {
        // User is logged in - show logout, hide login/register
        try {
            const payload = token.split('.')[1];
            const decodedPayload = JSON.parse(atob(payload));
            const username = decodedPayload.sub;
            
            // Desktop: show logout
            if (userInfo) userInfo.classList.remove("hidden");
            
            // Mobile: show logout
            if (mobileUserInfo) mobileUserInfo.classList.remove("hidden");
            
            // Hide login/register links everywhere
            const authLinks = document.querySelector('.auth-links');
            if (authLinks) authLinks.style.display = 'none';
            
        } catch (error) {
            console.error("Token decode error:", error);
            // Token geçersizse temizle
            localStorage.removeItem("jwtToken");
            localStorage.removeItem("tokenExpiry");
            updateAccountMenu(); // Tekrar çağır
        }
    } else {
        // User is not logged in - show login/register, hide logout
        if (userInfo) userInfo.classList.add("hidden");
        if (mobileUserInfo) mobileUserInfo.classList.add("hidden");
        
        // Show login/register links everywhere
        const authLinks = document.querySelector('.auth-links');
        if (authLinks) authLinks.style.display = 'flex';
    }
}


async function init() {

    const today = await getTodaysWord();
    let CORRECT_WORD = today.word.toUpperCase();
    let DEFINITION = today.definition;
    console.log(CORRECT_WORD);
    console.log(today.definition);

    document.querySelector(".keyboard").addEventListener("click", function (event) {
    if (done || isLoading) {
        return;
    }

    let inputLetter = event.target.textContent?.trim().toUpperCase();
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
        inputLetter = event.key.toUpperCase();
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

        document.querySelector(".hint-button").addEventListener("click", () => {
        const popup = document.querySelector(".hint-popup");
        const hintText = document.querySelector(".hint-text");
        hintText.textContent = DEFINITION;
        popup.classList.remove("hidden");
    });

    document.querySelector(".hint-ok-button").addEventListener("click", () => {
        document.querySelector(".hint-popup").classList.add("hidden");
    });

        const burger = document.querySelector(".burger");
    const fullscreenMenu = document.querySelector(".fullscreen-menu");
    const closeBtn = document.querySelector(".close-menu");

    burger.addEventListener("click", () => {
        fullscreenMenu.classList.remove("hidden");
        fullscreenMenu.classList.add("show");
    });

    closeBtn.addEventListener("click", () => {
        fullscreenMenu.classList.remove("show");
        setTimeout(() => {
            fullscreenMenu.classList.add("hidden");
        }, 300); // transition süresi kadar
    });

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
    const res = await fetch("http://localhost:8091/api/word");
    const data = await res.json();
    return {
        word: data.word.toUpperCase(),
        definition: data.definition
    };
    //TODO format kontrolü we try-catch eklenecek hata olursa getLocalWordFallback() fonksiyonu çağırılacak.
}


function getLocalWordFallback() {
    // TODO: localden kelime ve definition dönecek.

    return {
        word: "STACK",
        definition: "A LIFO (Last-In-First-Out) data structure used in memory management and algorithms."
    };
}

function isLetter(letter) {
    return /^[a-zA-Z]$/.test(letter);
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



async function commit(CORRECT_WORD, DEF_TEXT) {

    //TODO check commit function.


    loading(true);
    const response = await fetch("https://words.dev-apis.com/validate-word", {
        method: "POST",
        body: JSON.stringify(
            {
                "word": currentGuess
            }
        )
    })
    loading(false);
    
    let map = makeMap(CORRECT_WORD);
    const responsedData = await response.json();
    const isItValid = responsedData.validWord;
    console.log(isItValid);


    if (isItValid && currentGuess.length === ANSWER_LENGTH) {
        for (let i = 0; i < ANSWER_LENGTH; i++) {
            if (currentGuess[i] === CORRECT_WORD[i]) {
                letters[currentRow * ANSWER_LENGTH + i].classList.add("correct");
                map[CORRECT_WORD[i]]--;
            }

        }
        for (let i = 0; i < ANSWER_LENGTH; i++) {
            if (currentGuess[i] === CORRECT_WORD[i]) {
            }
            else if (CORRECT_WORD.includes(currentGuess[i]) && map[currentGuess[i]] != 0) {
                letters[currentRow * ANSWER_LENGTH + i].classList.add("close");
                map[CORRECT_WORD[i]]--;
                console.log(map);
            }
            else {
                letters[currentRow * ANSWER_LENGTH + i].classList.add("wrong");
                console.log(map);
            }
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
    if (resultText && resultDef && resultPopup) {
        resultText.textContent = `Tebrikler! Kelime: ${correctWord}`;
        resultDef.textContent  = `Anlam: ${definitionText}`;
        resultPopup.classList.remove("hidden");
    }

    if(scoreSent) return;
    scoreSent = true;

    const durationMs = Date.now() - gameStartMs;
    const attempts = TOTAL_TRIES - remainingLife;
    const word = correctWord;

    sendScore({ attempts, durationMs, word}).then(resp=> console.log("Score Saved:", resp));
}

function loser(correctWord, definitionText) {
    brandName?.classList.add("loser");
    done = true;
    if (resultText && resultDef && resultPopup) {
        resultText.textContent = `Game Over! Correct Word: ${capFirst(correctWord)}`; //TODO: capfirst çalışmıyor
        resultDef.textContent  = `Meaning: ${definitionText}`;
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
        // JWT token'dan username'i al
        const username = extractUsernameFromToken(token);
        if(!username) {
            console.error("Username token'dan alınamadı");
            return;
        }

        const res = await fetch("http://localhost:8091/api/scores", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + token
            },
            body: JSON.stringify({username, attempts, durationMs, word })
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

// JWT token'dan username'i çıkar
function extractUsernameFromToken(token) {
    try {
        // JWT token'ı decode et (payload kısmını al)
        const payload = token.split('.')[1];
        const decodedPayload = JSON.parse(atob(payload));
        return decodedPayload.sub; // JWT'de username 'sub' field'ında
    } catch (error) {
        console.error("Token decode error:", error);
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