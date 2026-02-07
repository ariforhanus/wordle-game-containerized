import { useTranslation } from "react-i18next";
import "./GuessDistribution.css";

interface Props {
  distribution: Record<string, number>;
}

export default function GuessDistribution({ distribution }: Props) {
  const { t } = useTranslation();

  // Build array for 1-6 attempts
  const bars: { attempt: number; count: number }[] = [];
  let maxCount = 0;
  for (let i = 1; i <= 6; i++) {
    const count = distribution[String(i)] ?? 0;
    bars.push({ attempt: i, count });
    if (count > maxCount) maxCount = count;
  }

  const totalGames = bars.reduce((s, b) => s + b.count, 0);

  if (totalGames === 0) {
    return (
      <div className="gd-container">
        <h3 className="gd-title">{t("profile.guessDistribution")}</h3>
        <p className="gd-empty">{t("profile.noData")}</p>
      </div>
    );
  }

  return (
    <div className="gd-container">
      <h3 className="gd-title">{t("profile.guessDistribution")}</h3>
      <div className="gd-chart">
        {bars.map((b) => {
          const pct = maxCount > 0 ? (b.count / maxCount) * 100 : 0;
          return (
            <div key={b.attempt} className="gd-row">
              <span className="gd-label">{b.attempt}</span>
              <div className="gd-bar-track">
                <div
                  className={`gd-bar ${b.count > 0 ? "gd-bar-filled" : ""}`}
                  style={{ width: `${Math.max(pct, b.count > 0 ? 8 : 2)}%` }}
                >
                  <span className="gd-count">{b.count}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
