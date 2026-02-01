const loadingEl = document.getElementById("leaderboard-loading");
const tableEl = document.getElementById("leaderboard-table");
const bodyEl = document.getElementById("leaderboard-body");
const emptyEl = document.getElementById("leaderboard-empty");

function apiBase() {
  return (window.location.hostname === "localhost" && window.location.port === "5500")
    ? "http://localhost:8091"
    : "";
}

async function loadDailyLeaderboard() {
  try {
    const res = await fetch(`${apiBase()}/api/leaderboard/daily`);
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

    const rows = data.map((row, index) => {
      const username = row.username || "-";
      const score = row.score ?? "-";
      return `
        <tr>
          <td class="leaderboard-rank">${index + 1}</td>
          <td>${username}</td>
          <td>${score}</td>
        </tr>
      `;
    }).join("");

    if (bodyEl) bodyEl.innerHTML = rows;
    if (loadingEl) loadingEl.classList.add("hidden");
    if (tableEl) tableEl.classList.remove("hidden");
  } catch (err) {
    if (loadingEl) loadingEl.textContent = "Skorlar yüklenemedi.";
    if (tableEl) tableEl.classList.add("hidden");
    if (emptyEl) emptyEl.classList.add("hidden");
    console.error(err);
  }
}

document.addEventListener("DOMContentLoaded", loadDailyLeaderboard);
