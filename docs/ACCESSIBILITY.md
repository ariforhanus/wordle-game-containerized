# Game and account accessibility checkpoint

Updated 2026-11-11; this is a tested improvement scope, not a WCAG certification.

## Feedback and blind mode

Submitted tiles and letter keys show permanent non-color symbols: ✓ correct position, • present elsewhere, × absent. The legend and status descriptions are translated EN/TR. CSS-generated markers do not change word text used by sharing/tests. Explicit accessible names prevent pseudo-content/icon fonts from replacing key/control names; key feedback is associated with aria-describedby. Backspace has a localized descriptive label.

Rows/cells identify their guess and status, and a polite atomic live region summarizes the latest accepted row without announcing each timer tick or typed character. The board is one focusable read-only grid; it does not add thirty tab stops. Blind mode suppresses status markers, classes, descriptions and live-region status details until the game ends. It does not silently expose hidden letter results to screen readers.

## Motion and contrast

CSS respects prefers-reduced-motion across animation/transition/scroll behavior. Board reveal timers are skipped and confetti particles are not generated; live preference changes are observed and old timers/listeners cleaned up. Normal-mode reveals are retained. Loading states remain labeled even when their spinner is static.

Correct/present tiles use dark text, absent tiles use a darker gray, dark-theme idle keys use dark text, and header/action gradients are darker. Real computed board/key foreground/background ratios are tested at >=4.5:1 in light/dark themes. Header/game scoped Axe checks supplement the final full-page account/theme/admin scans below. Automated coverage remains limited to the enumerated interactions; it does not certify every page or assistive technology. Focus outlines are visible, with white outlines on the header.

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

Deletion consent now references the active-data warning and security/backup
retention notices via aria-describedby, in both real EN/TR translations. Notices
are inside the native expandable section and precede the confirmation/password
submission. Actual Chromium/mobile Chromium/Firefox checks expand it, inspect
the accessible description and scan the account card in both themes before
executing deletion; a wrong password preserves the account for explicit retry.

Themed play now labels loading, validates/deduplicates the existing static word
list, and offers an explicit retry for failed/empty data instead of a dead board.
The existing English keyboard remains English even with Turkish UI. A repeated
next answer explicitly resets the round. Its terminal dialog uses the same focus
management; decorative icons are hidden. Theme badges use contrasting text/card
colors, retaining the theme color as a border. The shared result-share button
was corrected after Axe detected insufficient contrast; scoped dialog scans now
check light/dark and normal/hover states on two successive rounds.

## Final account/theme acceptance — 2026-11-11

The final audit exercises login, registration, forgotten/reset password, verification,
account security (including expanded deletion notices), profile, edit/achievements
dialogs, the existing theme selector and both existing themed games. EN/TR and
light/dark combinations use full-page Axe WCAG 2 A/AA + 2.1 AA checks. Admin
navigation/users/words/audit and delete-cancel focus are included in both appearances.
Mobile icon-only admin links retain explicit names. The application owns one main
landmark, with a translated skip link and heading/main focus after SPA navigation.

Native achievement buttons work with Enter/Space. Dialogs have names, labels,
Escape/Tab trapping, inert background and restored trigger focus. Account fields
have labels/autocomplete; validation identifies/focuses the invalid field and API
errors receive focus. Busy submits retain their names. Network read failures offer
explicit retry; avatar upload failures are announced and do not claim full success.
Registration stays busy through its separate upload and retains the created account
with a visible warning if only the photo fails. Recovery routes remount independently
so one flow's completion/token/password cannot appear in the next route.

320px narrow and 736px landscape viewports with root text at 200% check horizontal
reflow, keyboard reachability and profile dialogs. Long usernames wrap and stat/theme
grids can shrink without clipping labels. Actual rendered header/button/stat gradients
are separately sampled for text contrast because Axe reports gradients as incomplete;
stat label opacity is included. Theme accents remain borders around readable cards.
No theme or language was added. See VALIDATION.md for engine results and fixture gates.

The browser audit waits for visible modal opacity to settle; it does not await all
browser-owned animations (Firefox caret promises can remain pending). Assertions and
production animations remain enabled. Local trace recording is off to fit the workspace;
CI retains its existing failure-trace policy.

See VALIDATION.md for exact counts/limits. New tests cover reduced motion/live changes, no blind-mode leakage, names/descriptions/symbols, modal focus/Escape/Tab/storage failure and native keyboard controls. Browser checks inspect rendered pseudo-content and accessibility names, perform scoped Axe checks and measure actual styles; JSDOM alone cannot catch pseudo-content/font accessible-name behavior.

Remaining manual acceptance: real NVDA/VoiceOver speech/browse mode, physical iOS/Android keyboards and Safari, actual browser/OS zoom, and color-vision simulation/user testing. Automated full-page scans cover the account/theme/admin routes above; they do not prove full-site WCAG conformance or replace human review. Production ingress, release image/CI checks and capacity gates are tracked separately in TODO.md and VALIDATION.md. Scoring, daily rights and expiry behavior are unchanged by the accessibility work.
