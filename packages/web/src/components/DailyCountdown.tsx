import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { dailyGameApi } from "@wordle/api";

type Calendar =
  | { state: "loading" | "error" }
  | { state: "counting" | "ready"; remainingMs: number; timeZone: string };

export default function DailyCountdown({
  language,
  gameDate,
  onCheckToday,
}: {
  language: string;
  gameDate: string;
  onCheckToday: () => void;
}) {
  const { t } = useTranslation();
  const [calendar, setCalendar] = useState<Calendar>({ state: "loading" });
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    setCalendar({ state: "loading" });
    const requestedAt = performance.now();
    dailyGameApi.status(language).then((result) => {
      if (!active) return;
      const serverNow = Date.parse(result.serverNow ?? "");
      const nextGameAt = Date.parse(result.nextGameAt ?? "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(result.date) || result.date < gameDate ||
          !result.timeZone || !Number.isFinite(serverNow) || !Number.isFinite(nextGameAt) || nextGameAt <= serverNow) {
        throw new Error("Server calendar unavailable");
      }
      const receivedAt = performance.now();
      // Approximate one-way network time; only the server can authorize a new Start.
      const remainingAtReceipt = result.date > gameDate ? 0 : Math.max(0,
        nextGameAt - serverNow - (receivedAt - requestedAt) / 2);
      const tick = () => {
        const remainingMs = Math.max(0, remainingAtReceipt - (performance.now() - receivedAt));
        setCalendar({ state: remainingMs > 0 ? "counting" : "ready", remainingMs, timeZone: result.timeZone });
        if (remainingMs === 0) clearInterval(timer);
      };
      tick();
      if (remainingAtReceipt > 0) timer = setInterval(tick, 1000);
    }).catch(() => {
      if (active) setCalendar({ state: "error" });
    });
    return () => { active = false; clearInterval(timer); };
  }, [language, gameDate, revision]);

  useEffect(() => {
    // Re-sync after suspension or returning to the tab; never creates a game.
    const refresh = () => {
      if (document.visibilityState === "visible") setRevision((value) => value + 1);
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  let countdown = "";
  if (calendar.state === "counting") {
    const seconds = Math.ceil(calendar.remainingMs / 1000);
    countdown = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
      .map((value) => String(value).padStart(2, "0")).join(":");
  }
  return (
    <section aria-label={t("daily.nextGame")}>
      <h3>{t("daily.nextGame")}</h3>
      {calendar.state === "loading" && <p role="status">{t("daily.nextGameLoading")}</p>}
      {calendar.state === "error" && <div role="alert">
        <p>{t("daily.nextGameUnavailable")}</p>
        <button onClick={() => setRevision((value) => value + 1)}>{t("daily.retryStatus")}</button>
      </div>}
      {calendar.state === "counting" && <p role="timer" aria-live="off" aria-label={t("daily.nextGame")}>{countdown}</p>}
      {calendar.state === "ready" && <>
        <p role="status">{t("daily.nextGameReady")}</p>
        <button onClick={onCheckToday}>{t("daily.nextGameCheck")}</button>
      </>}
      {(calendar.state === "counting" || calendar.state === "ready") &&
        <p>{t("daily.nextGameZone", { timeZone: calendar.timeZone })}</p>}
    </section>
  );
}
