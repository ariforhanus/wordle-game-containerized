import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import GameModeInfo from "./GameModeInfo";
import en from "../../../i18n/locales/en.json";
import tr from "../../../i18n/locales/tr.json";
const locale = vi.hoisted(() => ({ language: "en" }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => {
  const [group, name] = key.split(".");
  const text = locale.language === "tr" ? tr : en;
  return (text as unknown as Record<string, Record<string, string>>)[group][name];
} }) }));
afterEach(cleanup);
it.each(["en", "tr"])("explains daily/practice rights, timing, rankings and offline prerequisites in %s", (language) => {
  locale.language = language;
  const view = render(<GameModeInfo />);
  const text = language === "en" ? en : tr;
  expect(view.container.querySelector("summary")?.textContent).toBe(text.modes.compare);
  expect(view.container.textContent).toContain(text.modes.daily);
  expect(view.container.textContent).toContain(text.modes.practice);
  expect(view.container.querySelector("details")?.open).toBe(false);
});
