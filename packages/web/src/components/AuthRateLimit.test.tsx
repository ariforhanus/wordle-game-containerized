import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { authApi, ApiError } from "@wordle/api";
import { LoginPage, RegisterPage } from "./AuthPages";
import { ToastProvider } from "./Toast";
import en from "../../../i18n/locales/en.json";
import tr from "../../../i18n/locales/tr.json";

vi.mock("@wordle/api", async (original) => ({
  ...(await original<typeof import("@wordle/api")>()),
  isAuthenticated: () => false,
  authApi: { login: vi.fn(), register: vi.fn(), getMe: vi.fn() },
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); localStorage.clear(); });

for (const language of ["en", "tr"] as const) {
  for (const mode of ["login", "register"] as const) {
    it.each([{ error: "rate_limited" }, "<html>Too Many Requests</html>"])(`explains a throttled ${mode} in ${language}, preserves input and never saves a token`, async (body) => {
      vi.mocked(authApi[mode]).mockRejectedValueOnce(new ApiError(429, body));
      const i18n = createInstance();
      await i18n.init({ lng: language, resources: { en: { translation: en }, tr: { translation: tr } } });
      const view = render(<I18nextProvider i18n={i18n}><MemoryRouter><ToastProvider>
        {mode === "login" ? <LoginPage /> : <RegisterPage />}
      </ToastProvider></MemoryRouter></I18nextProvider>);
      const prefix = mode === "login" ? "login" : "reg";
      const username = view.container.querySelector<HTMLInputElement>(`#${prefix}-username`)!;
      const password = view.container.querySelector<HTMLInputElement>(`#${prefix}-password`)!;
      fireEvent.change(username, { target: { value: "fixture-user" } });
      fireEvent.change(password, { target: { value: "fixture-password-123" } });
      if (mode === "register") {
        fireEvent.change(view.container.querySelector("#reg-email")!, { target: { value: "fixture@example.test" } });
        fireEvent.change(view.container.querySelector("#reg-confirm")!, { target: { value: "fixture-password-123" } });
        const country = view.container.querySelector<HTMLSelectElement>("#reg-country")!;
        fireEvent.change(country, { target: { value: country.options[1].value } });
      }
      fireEvent.submit(view.container.querySelector("form")!);
      const text = language === "en" ? en : tr;
      expect((await screen.findByRole("alert")).textContent).toBe(text.api.rate_limited);
      expect(username.value).toBe("fixture-user");
      expect(password.value).toBe("fixture-password-123");
      expect(authApi[mode]).toHaveBeenCalledTimes(1);
      expect(authApi.getMe).not.toHaveBeenCalled();
      expect(localStorage.getItem("jwtToken")).toBeNull();
      expect((view.container.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(false);
    });
  }
}
