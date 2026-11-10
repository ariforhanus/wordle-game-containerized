import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { authApi, ApiError } from "@wordle/api";
import { AccountSecurityPage, RecoveryPage } from "./AccountPages";
import en from "../../../i18n/locales/en.json";
import tr from "../../../i18n/locales/tr.json";

vi.mock("@wordle/api", async (original) => ({
  ...(await original<typeof import("@wordle/api")>()),
  isAuthenticated: () => true,
  authApi: { getMe: vi.fn(), forgotPassword: vi.fn(), requestVerification: vi.fn(), resetPassword: vi.fn(), verifyEmail: vi.fn() },
}));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(authApi.getMe).mockResolvedValue({ username: "fixture", emailVerified: false } as Awaited<ReturnType<typeof authApi.getMe>>);
});
afterEach(cleanup);

async function mount(language: "en" | "tr", account = false) {
  const i18n = createInstance();
  await i18n.init({ lng: language, resources: { en: { translation: en }, tr: { translation: tr } } });
  render(<I18nextProvider i18n={i18n}><MemoryRouter>
    {account ? <AccountSecurityPage /> : <RecoveryPage mode="forgot" />}
  </MemoryRouter></I18nextProvider>);
  return language === "en" ? en : tr;
}

for (const language of ["en", "tr"] as const) {
  it(`shows neutral request acceptance instead of confirming an account or delivery in ${language}`, async () => {
    vi.mocked(authApi.forgotPassword).mockResolvedValue(undefined);
    const text = await mount(language);
    fireEvent.change(screen.getByLabelText(text.auth.email), { target: { value: "fixture@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: text.account.continue }));
    expect((await screen.findByRole("status")).textContent).toBe(text.account.emailSent);
    expect(authApi.forgotPassword).toHaveBeenCalledTimes(1);
    expect(authApi.resetPassword).not.toHaveBeenCalled();
    expect(authApi.verifyEmail).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it(`preserves the reset address during unavailability and retries only after a click in ${language}`, async () => {
    vi.mocked(authApi.forgotPassword).mockRejectedValueOnce(new ApiError(503, null)).mockResolvedValueOnce(undefined);
    const text = await mount(language);
    const email = screen.getByLabelText(text.auth.email) as HTMLInputElement;
    fireEvent.change(email, { target: { value: "fixture@example.test" } });
    const button = screen.getByRole("button", { name: text.account.continue });
    fireEvent.click(button);
    expect((await screen.findByRole("alert")).textContent).toBe(text.account.mailUnavailable);
    expect(email.value).toBe("fixture@example.test");
    expect(authApi.forgotPassword).toHaveBeenCalledTimes(1);
    fireEvent.click(button);
    await screen.findByRole("status");
    expect(authApi.forgotPassword).toHaveBeenCalledTimes(2);
  });

  it(`keeps verification retry available after SMTP failure without signing out in ${language}`, async () => {
    vi.mocked(authApi.requestVerification).mockRejectedValueOnce(new ApiError(503, null)).mockResolvedValueOnce(undefined);
    const text = await mount(language, true);
    await screen.findByText(text.account.unverified);
    const button = screen.getByRole("button", { name: text.account.sendVerification });
    fireEvent.click(button);
    expect((await screen.findByRole("alert")).textContent).toBe(text.account.mailUnavailable);
    expect(authApi.requestVerification).toHaveBeenCalledTimes(1);
    fireEvent.click(button);
    expect((await screen.findByRole("status")).textContent).toBe(text.account.emailSent);
    expect(authApi.requestVerification).toHaveBeenCalledTimes(2);
  });
}
