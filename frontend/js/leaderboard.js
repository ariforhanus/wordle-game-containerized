var LeaderboardPage;
(function (LeaderboardPage) {
    const loadingEl = document.getElementById("leaderboard-loading");
    const tableEl = document.getElementById("leaderboard-table");
    const bodyEl = document.getElementById("leaderboard-body");
    const emptyEl = document.getElementById("leaderboard-empty");
    const playFirstEl = document.getElementById("play-first");
    function escapeHtml(str) {
        const div = document.createElement("div");
        div.textContent = str;
        return div.innerHTML;
    }
    function detectLanguage() {
        const path = window.location.pathname;
        const match = path.match(/^\/([a-zA-Z]{2})\//);
        if (match && match[1]) {
            return match[1].toLowerCase();
        }
        return "en";
    }
    const LANG = detectLanguage();
    function leaderboardApiBase() {
        return window.location.hostname === "localhost" && window.location.port === "5500"
            ? "http://localhost:8091"
            : "";
    }
    function getToken() {
        return localStorage.getItem("jwtToken");
    }
    function getCurrentUsername() {
        try {
            const token = getToken();
            if (!token)
                return null;
            const payload = JSON.parse(atob(token.split(".")[1]));
            return payload.username || null;
        }
        catch (_a) {
            return null;
        }
    }
    async function checkDailyStatus() {
        const token = getToken();
        if (!token) {
            return { played: false, loggedIn: false };
        }
        try {
            const res = await fetch(`${leaderboardApiBase()}/api/v1/daily/status?lang=${LANG}`, {
                headers: {
                    Authorization: "Bearer " + token,
                },
            });
            if (res.status === 401) {
                return { played: false, loggedIn: false };
            }
            if (!res.ok) {
                return { played: false, loggedIn: true };
            }
            const data = await res.json();
            return { played: data.played, loggedIn: true, score: data.score };
        }
        catch (err) {
            console.error("Daily status check error:", err);
            return { played: false, loggedIn: true };
        }
    }
    function showPlayFirst() {
        if (loadingEl)
            loadingEl.classList.add("hidden");
        if (tableEl)
            tableEl.classList.add("hidden");
        if (emptyEl)
            emptyEl.classList.add("hidden");
        if (playFirstEl)
            playFirstEl.classList.remove("hidden");
    }
    async function loadDailyLeaderboard() {
        const status = await checkDailyStatus();
        if (!status.played) {
            showPlayFirst();
            return;
        }
        try {
            const res = await fetch(`${leaderboardApiBase()}/api/v1/leaderboard/daily?lang=${LANG}`);
            if (!res.ok) {
                throw new Error("Failed to fetch leaderboard");
            }
            const data = await res.json();
            if (!Array.isArray(data) || data.length === 0) {
                if (loadingEl)
                    loadingEl.classList.add("hidden");
                if (tableEl)
                    tableEl.classList.add("hidden");
                if (emptyEl)
                    emptyEl.classList.remove("hidden");
                return;
            }
            const currentUser = getCurrentUsername();
            const rows = data
                .map((row, index) => {
                var _a, _b;
                const username = escapeHtml(row.username || "-");
                const score = (_a = row.score) !== null && _a !== void 0 ? _a : "-";
                const streak = (_b = row.currentStreak) !== null && _b !== void 0 ? _b : 0;
                const isCurrentUser = currentUser && username === currentUser;
                const rowClass = isCurrentUser ? 'class="current-user"' : "";
                const youLabel = LANG === "tr"
                    ? ' <span class="you-badge">Sen</span>'
                    : ' <span class="you-badge">You</span>';
                const userLabel = isCurrentUser ? youLabel : "";
                const streakLabel = streak >= 2
                    ? ` <span class="streak-badge"><i class="fa-solid fa-fire"></i> ${streak}</span>`
                    : "";
                return `
        <tr ${rowClass}>
          <td class="leaderboard-rank">${index + 1}</td>
          <td>${username}${userLabel}${streakLabel}</td>
          <td>${score}</td>
        </tr>
      `;
            })
                .join("");
            if (bodyEl)
                bodyEl.innerHTML = rows;
            if (loadingEl)
                loadingEl.classList.add("hidden");
            if (tableEl)
                tableEl.classList.remove("hidden");
        }
        catch (err) {
            const errorMsg = LANG === "tr" ? "Skorlar yüklenemedi." : "Failed to load scores.";
            if (loadingEl)
                loadingEl.textContent = errorMsg;
            if (tableEl)
                tableEl.classList.add("hidden");
            if (emptyEl)
                emptyEl.classList.add("hidden");
            console.error(err);
        }
    }
    document.addEventListener("DOMContentLoaded", loadDailyLeaderboard);
})(LeaderboardPage || (LeaderboardPage = {}));
