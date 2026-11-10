import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import "./HowToPlayModal.css";
import { useDialogFocus } from "../hooks/useDialogFocus";

const STORAGE_KEY = "wordle_htp_seen";

interface HowToPlayModalProps {
  /**
   * If true, opens regardless of localStorage (e.g. from help button).
   * If omitted/false, auto-opens only on first ever visit (localStorage check).
   */
  forceOpen?: boolean;
  /** If true, skip the auto-open on first visit (only open via forceOpen) */
  manualOnly?: boolean;
  onClose?: () => void;
}

export default function HowToPlayModal({
  forceOpen,
  manualOnly,
  onClose,
}: HowToPlayModalProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  // Auto-show on first ever visit (only if not manualOnly)
  useEffect(() => {
    if (manualOnly) return;
    try { if (!localStorage.getItem(STORAGE_KEY)) setOpen(true); }
    catch { setOpen(true); }
  }, [manualOnly]);

  // Force-open from parent (help button)
  useEffect(() => {
    if (forceOpen) {
      setOpen(true);
    }
  }, [forceOpen]);

  function close() {
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* Help must remain dismissible. */ }
    setOpen(false);
    onClose?.();
  }

  const dialogRef = useDialogFocus(open, close);

  if (!open) return null;

  return (
    <div className="htp-overlay" onClick={close} role="presentation">
      <div ref={dialogRef} tabIndex={-1} className="htp-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="htp-dialog-title">
        <h2 className="htp-title" id="htp-dialog-title">{t("game.howToPlay")}</h2>
        <p className="htp-desc">{t("game.howToPlayDesc")}</p>

        <div className="htp-examples">
          {/* Correct example */}
          <div className="htp-example">
            <div className="htp-tiles">
              <div className="htp-tile htp-correct">W</div>
              <div className="htp-tile">O</div>
              <div className="htp-tile">R</div>
              <div className="htp-tile">D</div>
              <div className="htp-tile">S</div>
            </div>
            <p className="htp-explain">
              <strong>W</strong> {t("game.howCorrect")}
            </p>
          </div>

          {/* Present example */}
          <div className="htp-example">
            <div className="htp-tiles">
              <div className="htp-tile">P</div>
              <div className="htp-tile htp-present">I</div>
              <div className="htp-tile">L</div>
              <div className="htp-tile">L</div>
              <div className="htp-tile">S</div>
            </div>
            <p className="htp-explain">
              <strong>I</strong> {t("game.howPresent")}
            </p>
          </div>

          {/* Absent example */}
          <div className="htp-example">
            <div className="htp-tiles">
              <div className="htp-tile">V</div>
              <div className="htp-tile">A</div>
              <div className="htp-tile">G</div>
              <div className="htp-tile htp-absent">U</div>
              <div className="htp-tile">E</div>
            </div>
            <p className="htp-explain">
              <strong>U</strong> {t("game.howAbsent")}
            </p>
          </div>
        </div>

        <button className="btn-primary htp-btn" onClick={close}>
          {t("game.howGotIt")}
        </button>
      </div>
    </div>
  );
}
