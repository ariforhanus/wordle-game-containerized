namespace LeaderboardPage {
  const loadingEl = document.getElementById("leaderboard-loading") as HTMLElement | null;
  const tableEl = document.getElementById("leaderboard-table") as HTMLElement | null;
  const bodyEl = document.getElementById("leaderboard-body") as HTMLElement | null;
  const emptyEl = document.getElementById("leaderboard-empty") as HTMLElement | null;
  const playFirstEl = document.getElementById("play-first") as HTMLElement | null;

  function escapeHtml(str: string): string {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function detectLanguage(): string {
    const path = window.location.pathname;
    const match = path.match(/^\/([a-zA-Z]{2})\//);
    if (match && match[1]) {
      return match[1].toLowerCase();
    }
    return "en";
  }

  const LANG = detectLanguage();

  function leaderboardApiBase(): string {
    return window.location.hostname === "localhost" && window.location.port === "5500"
      ? "http://localhost:8091"
      : "";
  }

  function getToken(): string | null {
    return localStorage.getItem("jwtToken");
  }

  function getCurrentUsername(): string | null {
    try {
      const token = getToken();
      if (!token) return null;
      const payload = JSON.parse(atob(token.split(".")[1]));
      return payload.username || null;
    } catch {
      return null;
    }
  }

  async function checkDailyStatus(): Promise<{ played: boolean; loggedIn: boolean; score?: any }> {
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
    } catch (err) {
      console.error("Daily status check error:", err);
      return { played: false, loggedIn: true };
    }
  }

  function showPlayFirst(): void {
    if (loadingEl) loadingEl.classList.add("hidden");
    if (tableEl) tableEl.classList.add("hidden");
    if (emptyEl) emptyEl.classList.add("hidden");
    if (playFirstEl) playFirstEl.classList.remove("hidden");
  }

  async function loadDailyLeaderboard(): Promise<void> {
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
        if (loadingEl) loadingEl.classList.add("hidden");
        if (tableEl) tableEl.classList.add("hidden");
        if (emptyEl) emptyEl.classList.remove("hidden");
        return;
      }

      const currentUser = getCurrentUsername();

      const rows = data
        .map((row: any, index: number) => {
          const username = escapeHtml(row.username || "-");
          const score = row.score ?? "-";
          const streak = row.currentStreak ?? 0;
          const isCurrentUser = currentUser && username === currentUser;
          const rowClass = isCurrentUser ? 'class="current-user"' : "";
          const youLabel =
            LANG === "tr"
              ? ' <span class="you-badge">Sen</span>'
              : ' <span class="you-badge">You</span>';
          const userLabel = isCurrentUser ? youLabel : "";

          const streakLabel =
            streak >= 2
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

      if (bodyEl) bodyEl.innerHTML = rows;
      if (loadingEl) loadingEl.classList.add("hidden");
      if (tableEl) tableEl.classList.remove("hidden");
    } catch (err) {
      const errorMsg = LANG === "tr" ? "Skorlar yüklenemedi." : "Failed to load scores.";
      if (loadingEl) loadingEl.textContent = errorMsg;
      if (tableEl) tableEl.classList.add("hidden");
      if (emptyEl) emptyEl.classList.add("hidden");
      console.error(err);
    }
  }

  document.addEventListener("DOMContentLoaded", loadDailyLeaderboard);
}

