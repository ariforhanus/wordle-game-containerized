const loadingEl = document.getElementById("leaderboard-loading");
const tableEl = document.getElementById("leaderboard-table");
const bodyEl = document.getElementById("leaderboard-body");
const emptyEl = document.getElementById("leaderboard-empty");
const playFirstEl = document.getElementById("play-first");

function leaderboardApiBase() {
  return (window.location.hostname === "localhost" && window.location.port === "5500")
    ? "http://localhost:8091"
    : "";
}

// LANG ve detectLanguage script.js'den geliyor

function getToken() {
  return localStorage.getItem("jwtToken");
}

// JWT'den username çıkar
function getCurrentUsername() {
  try {
    const token = getToken();
    if (!token) return null;
    
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.username || null;
  } catch (e) {
    return null;
  }
}

// Bugün oynadı mı kontrol et
async function checkDailyStatus() {
  const token = getToken();
  if (!token) {
    return { played: false, loggedIn: false };
  }
  
  try {
    const res = await fetch(`${leaderboardApiBase()}/api/daily/status?lang=${LANG}`, {
      headers: {
        "Authorization": "Bearer " + token
      }
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

// Play first mesajını göster
function showPlayFirst() {
  if (loadingEl) loadingEl.classList.add("hidden");
  if (tableEl) tableEl.classList.add("hidden");
  if (emptyEl) emptyEl.classList.add("hidden");
  if (playFirstEl) playFirstEl.classList.remove("hidden");
}

async function loadDailyLeaderboard() {
  // Önce bugün oynayıp oynamadığını kontrol et
  const status = await checkDailyStatus();
  
  if (!status.played) {
    // Oynamamış - play first göster
    showPlayFirst();
    return;
  }
  
  // Oynadı - leaderboard'u göster
  try {
    const res = await fetch(`${leaderboardApiBase()}/api/leaderboard/daily?lang=${LANG}`);
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

    const rows = data.map((row, index) => {
      const username = row.username || "-";
      const score = row.score ?? "-";
      const isCurrentUser = currentUser && username === currentUser;
      const rowClass = isCurrentUser ? 'class="current-user"' : '';
      const userLabel = isCurrentUser 
        ? (LANG === 'tr' ? ' <span class="you-badge">Sen</span>' : ' <span class="you-badge">You</span>') 
        : '';
      
      return `
        <tr ${rowClass}>
          <td class="leaderboard-rank">${index + 1}</td>
          <td>${username}${userLabel}</td>
          <td>${score}</td>
        </tr>
      `;
    }).join("");

    if (bodyEl) bodyEl.innerHTML = rows;
    if (loadingEl) loadingEl.classList.add("hidden");
    if (tableEl) tableEl.classList.remove("hidden");
  } catch (err) {
    const errorMsg = LANG === 'tr' ? "Skorlar yüklenemedi." : "Failed to load scores.";
    if (loadingEl) loadingEl.textContent = errorMsg;
    if (tableEl) tableEl.classList.add("hidden");
    if (emptyEl) emptyEl.classList.add("hidden");
    console.error(err);
  }
}

document.addEventListener("DOMContentLoaded", loadDailyLeaderboard);
