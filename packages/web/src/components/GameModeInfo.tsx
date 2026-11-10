import { useTranslation } from "react-i18next";
import "./GameModeInfo.css";

export default function GameModeInfo() {
  const { t } = useTranslation();
  return (
    <details className="game-mode-info">
      <summary>{t("modes.compare")}</summary>
      <p><strong>{t("nav.daily")}: </strong>{t("modes.daily")}</p>
      <p><strong>{t("nav.practice")}: </strong>{t("modes.practice")}</p>
    </details>
  );
}
