import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { render, cleanup, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Header from "./Header";
const locale = vi.hoisted(() => ({ language: "en", changeLanguage: vi.fn() }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: locale }) }));
vi.mock("@wordle/api", () => ({ isAuthenticated: () => false, clearToken: vi.fn(), authApi: { getMe: vi.fn() } }));
beforeEach(() => { locale.language = "en"; vi.clearAllMocks(); localStorage.clear(); });
afterEach(cleanup);
function mount() { return render(<MemoryRouter><Header /></MemoryRouter>); }
it("uses native language names without flags or duplicate country/language codes", () => {
  const view = mount();
  const actions = within(view.container.querySelector(".desktop-actions") as HTMLElement);
  const select = actions.getByRole("combobox", { name: "nav.language" }) as HTMLSelectElement;
  expect(select.value).toBe("en");
  expect(Array.from(select.options).map((option) => option.text)).toEqual(["English", "Türkçe"]);
  expect(select.textContent).not.toMatch(/🇬🇧|🇹🇷|GB|\bEN\b/);
  fireEvent.change(select, { target: { value: "tr" } });
  expect(locale.changeLanguage).toHaveBeenCalledExactlyOnceWith("tr");
  expect(localStorage.getItem("wordle_lang")).toBe("tr");
});
it("persists a mobile selection and closes the menu", () => {
  const view = mount();
  const menuButton = within(view.container).getByRole("button", { name: "nav.menu" });
  const menu = view.container.querySelector("#mobile-nav-menu") as HTMLElement;
  expect(menu.hasAttribute("inert")).toBe(true);
  fireEvent.click(menuButton);
  expect(menuButton.getAttribute("aria-expanded")).toBe("true");
  fireEvent.change(menu.querySelector("select")!, { target: { value: "tr" } });
  expect(locale.changeLanguage).toHaveBeenCalledWith("tr");
  expect(menuButton.getAttribute("aria-expanded")).toBe("false");
  expect(menu.hasAttribute("inert")).toBe(true);
});
it("shows the current Turkish choice rather than a next-language abbreviation", () => {
  locale.language = "tr";
  const view = mount();
  expect((view.container.querySelector(".desktop-actions select") as HTMLSelectElement).selectedOptions[0].text).toBe("Türkçe");
});
it("closes the mobile menu with Escape and returns focus to its toggle", () => {
  const view = mount();
  const button = within(view.container).getByRole("button", { name: "nav.menu" });
  fireEvent.click(button);
  (view.container.querySelector("#mobile-nav-menu select") as HTMLSelectElement).focus();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(button.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(button);
});
