import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { AccountSecurityPage } from "./AccountPages";
import { authApi, ApiError } from "@wordle/api";
import en from "../../../i18n/locales/en.json";
import tr from "../../../i18n/locales/tr.json";

vi.mock("@wordle/api", async (original) => ({
  ...(await original<typeof import("@wordle/api")>()),
  isAuthenticated: () => true,
  authApi: {
    getMe: vi.fn().mockResolvedValue({ username: "fixture", emailVerified: true }),
    deleteAccount: vi.fn(),
  },
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

async function mount(language: "en" | "tr") {
  const i18n = createInstance();
  await i18n.init({ lng: language, resources: { en: { translation: en }, tr: { translation: tr } } });
  render(<I18nextProvider i18n={i18n}><MemoryRouter><AccountSecurityPage /></MemoryRouter></I18nextProvider>);
  const text = language === "en" ? en : tr;
  await screen.findByText(text.account.verified);
  fireEvent.click(screen.getByText(text.account.deleteTitle, { selector: "summary" }));
  return text;
}

it.each(["en", "tr"] as const)("describes active deletion, security retention and backup limits before consent in %s", async (language) => {
  const text = await mount(language);
  const consent = screen.getByRole("checkbox");
  const described = consent.getAttribute("aria-describedby")!.split(" ").map(id => document.getElementById(id)!.textContent).join(" ");
  expect(described).toContain(text.account.deleteWarning);
  expect(described).toContain(text.account.deleteSecurityRetention);
  expect(described).toContain(text.account.deleteBackupRetention);
  const button = screen.getByRole("button", { name: text.account.deleteTitle }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  const password = document.getElementById("delete-password")!;
  fireEvent.change(password, { target: { value: "local-fixture-password" } });
  fireEvent.submit(password.closest("form")!);
  expect(authApi.deleteAccount).not.toHaveBeenCalled();
  fireEvent.click(consent);
  expect(button.disabled).toBe(false);
  expect(authApi.deleteAccount).not.toHaveBeenCalled();
});

it("prevents duplicate deletion and allows explicit retry after a rejected password", async () => {
  const text = await mount("en");
  let reject!: (reason: unknown) => void;
  vi.mocked(authApi.deleteAccount).mockReturnValueOnce(new Promise((_, fail) => { reject = fail; }));
  const password = document.getElementById("delete-password")!;
  fireEvent.change(password, { target: { value: "wrong-fixture-password" } });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.submit(password.closest("form")!);
  const button = screen.getByRole("button", { name: text.account.deleteTitle }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  fireEvent.submit(password.closest("form")!);
  expect(authApi.deleteAccount).toHaveBeenCalledTimes(1);
  reject(new ApiError(400, "incorrect_password"));
  expect((await screen.findByRole("alert")).textContent).toBe(text.account.failed);
  await waitFor(() => expect(button.disabled).toBe(false));
  expect((password as HTMLInputElement).value).toBe("wrong-fixture-password");
});
