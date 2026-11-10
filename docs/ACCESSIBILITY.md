# Game and account accessibility checkpoint

Implemented 2026-11-10; this is a tested improvement scope, not a WCAG certification.

## Feedback and blind mode

Submitted tiles and letter keys show permanent non-color symbols: ✓ correct position, • present elsewhere, × absent. The legend and status descriptions are translated EN/TR. CSS-generated markers do not change word text used by sharing/tests. Explicit accessible names prevent pseudo-content/icon fonts from replacing key/control names; key feedback is associated with aria-describedby. Backspace has a localized descriptive label.

Rows/cells identify their guess and status, and a polite atomic live region summarizes the latest accepted row without announcing each timer tick or typed character. The board is one focusable read-only grid; it does not add thirty tab stops. Blind mode suppresses status markers, classes, descriptions and live-region status details until the game ends. It does not silently expose hidden letter results to screen readers.

## Motion and contrast

CSS respects prefers-reduced-motion across animation/transition/scroll behavior. Board reveal timers are skipped and confetti particles are not generated; live preference changes are observed and old timers/listeners cleaned up. Normal-mode reveals are retained. Loading states remain labeled even when their spinner is static.

Correct/present tiles use dark text, absent tiles use a darker gray, dark-theme idle keys use dark text, and header/action gradients are darker. Real computed board/key foreground/background ratios are tested at >=4.5:1 in light/dark themes. Header/game scoped Axe checks supplement this; gradients, every page/component and every interaction still need a full audit. Focus outlines are visible, with white outlines on the header.

## Focus and keyboard

Help and practice/themed hint/result dialogs move focus inside, keep Tab within their controls, make background siblings inert, and restore connected prior focus on teardown. Help/hint Escape closes; the terminal result requires its existing share/play-again actions. Optional help storage cannot prevent closing. Opening another help dialog after the round ends is disabled.

Form/select/header/dialog input, shortcuts and IME composition are ignored by game keyboard handlers. Enter on native buttons/links/summary retains native activation rather than accidentally submitting a turn. Starting to type into the game from a game control moves focus to the board, so subsequent Enter submits the word. Keyboard listeners are installed with the board commit to avoid a visible board with a stale listener. Mobile navigation Escape closes and returns focus to its toggle.

Dialogs have viewport-bounded scrolling. The mobile menu is used through tablet widths and scrolls within the remaining viewport height. Board tiles flex within narrow containers; key sizing avoids intrinsic minimum-width overflow. Browser tests exercise 320×568, 736×320, text enlarged to 200%, dialog reachability and the language picker. Text enlargement/emulation is not a substitute for actual browser zoom or physical-device testing.

## Evidence and remaining work

Account password-confirmation mismatches focus the named confirmation field,
associate the visible error using aria-describedby, set aria-invalid and clear it
when edited, without sending credentials. Reset validation focuses the new
password when its length is invalid. Inputs/selects have visible focus outlines;
account links use contrasting light/dark colors. Browser checks cover account
security and recovery forms with scoped Axe in both themes.

Themed play now labels loading, validates/deduplicates the existing static word
list, and offers an explicit retry for failed/empty data instead of a dead board.
The existing English keyboard remains English even with Turkish UI. A repeated
next answer explicitly resets the round. Its terminal dialog uses the same focus
management; decorative icons are hidden. Theme badges use contrasting text/card
colors, retaining the theme color as a border. The shared result-share button
was corrected after Axe detected insufficient contrast; scoped dialog scans now
check light/dark and normal/hover states on two successive rounds.

See VALIDATION.md for exact counts/limits. New tests cover reduced motion/live changes, no blind-mode leakage, names/descriptions/symbols, modal focus/Escape/Tab/storage failure and native keyboard controls. Browser checks inspect rendered pseudo-content and accessibility names, perform scoped Axe checks and measure actual styles; JSDOM alone cannot catch pseudo-content/font accessible-name behavior.

Remaining: real NVDA/VoiceOver speech and browse-mode review, color-vision simulation/user testing, full site/complete account-flow focus/contrast review, physical mobile devices and full browser zoom. Firefox now passes locally (25 tests; SMTP and two production-only cases skipped); WebKit/Chromium checks remain emulated engine coverage. Production Nginx/offline and full release capacity/CI gates are separate. This accessibility work does not change scoring or daily rights/expiry; the concurrent backend rotation/V8 work is documented separately in `WORD_ROTATION.md`.
