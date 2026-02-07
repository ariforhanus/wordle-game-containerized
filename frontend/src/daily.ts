namespace DailyGame {
  const letters = document.querySelectorAll(".letter-box");
  const loadingDiv = document.querySelector(".loading");
  const brandName = document.querySelector(".brand-name");
  const resultPopup = document.getElementById("result-popup");
  const resultText = resultPopup?.querySelector(".result-text") as HTMLElement | null;
  const resultDef = resultPopup?.querySelector(".result-def") as HTMLElement | null;
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
  let timerInterval: number | null = null;
  let gameStarted = false;

  let validWords = new Set<string>();

  function detectLanguage(): string {
    const path = window.location.pathname;
    const match = path.match(/^\/([a-zA-Z]{2})\//);
    if (match && match[1]) {
      return match[1].toLowerCase();
    }
    return "en";
  }

  const LANG = detectLanguage();

  function toUpper(str: string): string {
    if (LANG === "tr") {
      return str.toLocaleUpperCase("tr-TR");
    }
    return str.toUpperCase();
  }

  async function loadValidWords(): Promise<void> {
    try {
      let file = `/words_${LANG}_possible.txt`;
      let res = await fetch(file);
      if (!res.ok) {
        console.warn(`Valid words file not found for lang=${LANG}, falling back to English.`);
        file = "/words_en_possible.txt";
        res = await fetch(file);
      }
      const text = await res.text();
      const words = text
        .split("\n")
        .map((w) => toUpper(w.trim()))
        .filter((w) => w.length === 5);
      validWords = new Set(words);
    } catch (e) {
      console.error("Failed to load valid words:", e);
    }
  }

  function getApiBase(): string {
    return window.location.hostname === "localhost" && window.location.port === "5500"
      ? "http://localhost:8091"
      : "";
  }

  function getToken(): string | null {
    try {
      return localStorage.getItem("jwtToken");
    } catch {
      return null;
    }
  }

  function checkLogin(): boolean {
    const token = getToken();
    if (!token) {
      window.location.href = "auth/login.html";
      return false;
    }
    return true;
  }

  async function checkDailyStatus(): Promise<{ played: boolean; score?: any }> {
    const token = getToken();
    try {
      const res = await fetch(`${getApiBase()}/api/v1/daily/status?lang=${LANG}`, {
        headers: {
          Authorization: "Bearer " + token,
        },
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

  // Cache for daily word to prevent refetching on refresh (using localStorage)
  function getCachedDailyWord(): { word: string; definition: string; date: string } | null {
    try {
      const cached = localStorage.getItem(`dailyWord_${LANG}`);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (e) {
      console.error("Failed to read cached daily word:", e);
    }
    return null;
  }

  function setCachedDailyWord(word: string, definition: string, date: string): void {
    try {
      localStorage.setItem(`dailyWord_${LANG}`, JSON.stringify({ word, definition, date }));
    } catch (e) {
      console.error("Failed to cache daily word:", e);
    }
  }

  async function getDailyWord(): Promise<{ word: string; definition: string }> {
    // Check if we have a cached word for today (UX optimization only)
    // Backend is the source of truth, this cache is just for performance
    // Use Istanbul timezone to match backend (Europe/Istanbul = UTC+3)
    const now = new Date();
    const istOffset = 3 * 60; // Istanbul is UTC+3
    const istTime = new Date(now.getTime() + (istOffset * 60 * 1000) - (now.getTimezoneOffset() * 60 * 1000));
    const today = istTime.toISOString().split('T')[0]; // YYYY-MM-DD format
    
    const cached = getCachedDailyWord();
    
    if (cached && cached.date === today) {
      console.log(`[Daily] Cache hit — word: ${cached.word}, date: ${today}, lang: ${LANG}`);
      return {
        word: cached.word,
        definition: cached.definition,
      };
    }

    console.log(`[Daily] Cache miss — fetching from backend, date: ${today}, lang: ${LANG}`);
    const res = await fetch(`${getApiBase()}/api/v1/word/daily?lang=${LANG}`);
    if (!res.ok) {
      throw new Error(`Failed to fetch daily word: ${res.status}`);
    }
    const data = await res.json();
    const word = toUpper(data.word);
    
    setCachedDailyWord(word, data.definition, today);
    
    return {
      word,
      definition: data.definition,
    };
  }

  async function sendScore(args: {
    attempts: number;
    durationMs: number;
    word: string;
  }): Promise<any> {
    const token = getToken();
    if (!token) {
      console.log("token yok.");
      return;
    }

    try {
      const res = await fetch(`${getApiBase()}/api/v1/scores?lang=${LANG}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify(args),
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

  function showAlreadyPlayed(score: any): void {
    (document.querySelector(".game") as HTMLElement | null)?.classList.add("hidden");
    (document.querySelector(".keyboard-container") as HTMLElement | null)?.classList.add(
      "hidden"
    );

    if (alreadyPlayedPopup) {
      alreadyPlayedPopup.classList.remove("hidden");
      const scoreText = alreadyPlayedPopup.querySelector(".score-text") as HTMLElement | null;
      if (scoreText && score) {
        if (LANG === "tr") {
          scoreText.textContent = `Bugünkü skorun: ${score.score} (${score.attempts} deneme)`;
        } else {
          scoreText.textContent = `Today's score: ${score.score} (${score.attempts} attempts)`;
        }
      }
    }
  }

  function startTimer(): void {
    gameStartMs = Date.now();
    if (gameTimer) gameTimer.classList.remove("hidden");
    timerInterval = window.setInterval(updateTimer, 1000);
    updateTimer();
  }

  function updateTimer(): void {
    if (!timerDisplay) return;
    const elapsed = Math.floor((Date.now() - gameStartMs) / 1000);
    const minutes = Math.floor(elapsed / 60)
      .toString()
      .padStart(2, "0");
    const seconds = (elapsed % 60).toString().padStart(2, "0");
    (timerDisplay as HTMLElement).textContent = `${minutes}:${seconds}`;
  }

  function stopTimer(): void {
    if (timerInterval !== null) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function isLetter(letter: string): boolean {
    return /^[a-zA-ZçÇğĞıİöÖşŞüÜ]$/.test(letter);
  }

  function addLetter(letter: string): void {
    if (currentGuess.length < ANSWER_LENGTH) {
      (letters[currentRow * ANSWER_LENGTH + currentGuess.length] as HTMLElement).innerText =
        letter;
      currentGuess += letter;
    } else if (currentGuess.length === ANSWER_LENGTH) {
      (letters[currentRow * ANSWER_LENGTH + currentGuess.length - 1] as HTMLElement).innerText =
        letter;
      currentGuess = currentGuess.substring(0, currentGuess.length - 1) + letter;
    }
  }

  function erase(): void {
    if (currentGuess.length > 0) {
      (letters[currentRow * ANSWER_LENGTH + (currentGuess.length - 1)] as HTMLElement).innerText =
        "";
      currentGuess = currentGuess.substring(0, currentGuess.length - 1);
    }
  }

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

  async function commit(CORRECT_WORD: string, DEF_TEXT: string): Promise<void> {
    const isItValid = validWords.has(toUpper(currentGuess));
    let map = makeMap(CORRECT_WORD);
    let letterStatuses: ("correct" | "close" | "wrong")[] = [];

    if (isItValid && currentGuess.length === ANSWER_LENGTH) {
      for (let i = 0; i < ANSWER_LENGTH; i++) {
        if (currentGuess[i] === CORRECT_WORD[i]) {
          letters[currentRow * ANSWER_LENGTH + i].classList.add("correct");
          letterStatuses[i] = "correct";
          map[CORRECT_WORD[i]]--;
        }
      }
      for (let i = 0; i < ANSWER_LENGTH; i++) {
        if (currentGuess[i] === CORRECT_WORD[i]) {
        } else if (CORRECT_WORD.includes(currentGuess[i]) && map[currentGuess[i]] != 0) {
          letters[currentRow * ANSWER_LENGTH + i].classList.add("close");
          letterStatuses[i] = "close";
          map[currentGuess[i]]--;
        } else {
          letters[currentRow * ANSWER_LENGTH + i].classList.add("wrong");
          letterStatuses[i] = "wrong";
        }
      }

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

    if (
      currentGuess.length === ANSWER_LENGTH &&
      currentGuess != CORRECT_WORD &&
      remainingLife >= 1 &&
      isItValid
    ) {
      currentRow++;
      remainingLife--;
      currentGuess = "";
      return;
    } else if (currentGuess === CORRECT_WORD) {
      winner(CORRECT_WORD, DEF_TEXT);
      done = true;
      return;
    } else if (
      currentGuess.length === ANSWER_LENGTH &&
      currentGuess != CORRECT_WORD &&
      remainingLife === 0 &&
      isItValid
    ) {
      loser(CORRECT_WORD, DEF_TEXT);
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
    stopTimer();

    if (resultText && resultPopup) {
      if (LANG === "tr") {
        resultText.textContent = `Tebrikler! Kelime: ${correctWord}`;
      } else {
        resultText.textContent = `Congratulations! Word: ${correctWord}`;
        if (resultDef) resultDef.textContent = `Meaning: ${definitionText}`;
      }
      resultPopup.classList.remove("hidden");
    }

    if (scoreSent) return;
    scoreSent = true;

    const durationMs = Date.now() - gameStartMs;
    const attempts = TOTAL_TRIES - remainingLife;
    const word = correctWord;

    sendScore({ attempts, durationMs, word }).then((resp) =>
      console.log("Score Saved:", resp)
    );
  }

  function loser(correctWord: string, definitionText: string): void {
    brandName?.classList.add("loser");
    done = true;
    stopTimer();

    if (resultText && resultPopup) {
      if (LANG === "tr") {
        resultText.textContent = `Kaybettin! Kelime: ${correctWord}`;
      } else {
        resultText.textContent = `Game Over! Word: ${correctWord}`;
        if (resultDef) resultDef.textContent = `Meaning: ${definitionText}`;
      }
      resultPopup.classList.remove("hidden");
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
        }, 300);
      });
    }
  }

  async function init(): Promise<void> {
    // Ensure popups are hidden initially
    if (startPopup) startPopup.classList.add("hidden");
    if (resultPopup) resultPopup.classList.add("hidden");
    if (alreadyPlayedPopup) alreadyPlayedPopup.classList.add("hidden");

    if (!checkLogin()) return;

    (document.querySelector(".game") as HTMLElement | null)?.classList.add("hidden");
    (document.querySelector(".keyboard-container") as HTMLElement | null)?.classList.add(
      "hidden"
    );

    const status = await checkDailyStatus();

    if (status.played) {
      showAlreadyPlayed(status.score);
      return;
    }

    await loadValidWords();

    const today = await getDailyWord();
    let CORRECT_WORD = toUpper(today.word);
    let DEFINITION = today.definition;

    console.log(`[Daily] Word: ${CORRECT_WORD}, Definition: ${DEFINITION}`);
    console.log(`[Daily] Valid words loaded: ${validWords.size}`);

    if (startPopup) {
      startPopup.classList.remove("hidden");
    }

    if (startGameBtn) {
      startGameBtn.addEventListener("click", function () {
        if (gameStarted) return;
        gameStarted = true;

        if (startPopup) startPopup.classList.add("hidden");

        (document.querySelector(".game") as HTMLElement | null)?.classList.remove("hidden");
        (
          document.querySelector(".keyboard-container") as HTMLElement | null
        )?.classList.remove("hidden");

        startTimer();
      });
    }

    const keyboard = document.querySelector(".keyboard") as HTMLElement | null;
    if (keyboard) {
      keyboard.addEventListener("click", function (event: MouseEvent) {
        if (done || isLoading || !gameStarted) return;

        const target = event.target as HTMLElement | null;
        let inputLetter = toUpper(target?.textContent?.trim() || "");
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

    document.addEventListener("keydown", function (event: KeyboardEvent) {
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

    const hintButton = document.querySelector(".hint-button");
    if (hintButton) {
      hintButton.addEventListener("click", () => {
        const popup = document.querySelector(".hint-popup") as HTMLElement | null;
        const hintText = document.querySelector(".hint-text") as HTMLElement | null;
        if (hintText) hintText.textContent = DEFINITION;
        if (popup) popup.classList.remove("hidden");
      });
    }

    const hintOkButton = document.querySelector(".hint-ok-button");
    if (hintOkButton) {
      hintOkButton.addEventListener("click", () => {
        const popup = document.querySelector(".hint-popup") as HTMLElement | null;
        if (popup) popup.classList.add("hidden");
      });
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    setupMobileMenu();
    init();
  });
}

