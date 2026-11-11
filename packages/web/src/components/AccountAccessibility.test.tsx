import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AccountSecurityPage, RecoveryPage } from "./AccountPages";
import { authApi } from "@wordle/api";
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@wordle/api", async (original) => ({ ...(await original<typeof import("@wordle/api")>()),
  isAuthenticated: () => true,
  authApi: { getMe: vi.fn().mockResolvedValue({ username: "fixture", email: "fixture@example.test", role: "USER", emailVerified: true }), changePassword: vi.fn(), resetPassword: vi.fn() },
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); window.history.replaceState(null, "", "/"); });
it("focuses and describes the mismatched security confirmation without submitting credentials", async () => {
  render(<MemoryRouter><AccountSecurityPage /></MemoryRouter>);
  await screen.findByText("account.verified");
  fireEvent.change(screen.getByLabelText("account.currentPassword", { selector: "#current-password" }), { target: { value: "old-fixture-password" } });
  fireEvent.change(screen.getByLabelText("account.newPassword"), { target: { value: "new-fixture-password" } });
  const confirm = screen.getByLabelText("auth.confirmPassword");
  fireEvent.change(confirm, { target: { value: "different-password" } });
  fireEvent.click(screen.getByRole("button", { name: "account.changePassword" }));
  expect(document.activeElement).toBe(confirm);
  expect(confirm.getAttribute("aria-invalid")).toBe("true");
  expect(document.getElementById(confirm.getAttribute("aria-describedby")!)?.textContent).toBe("account.passwordMismatch");
  expect(authApi.changePassword).not.toHaveBeenCalled();
  fireEvent.change(confirm, { target: { value: "new-fixture-password" } });
  expect(confirm.getAttribute("aria-invalid")).toBeNull();
});
it("associates recovery mismatch errors with the focused confirmation and keeps tokens off the URL", () => {
  window.history.replaceState(null, "", "/reset-password#token=local-fixture");
  render(<MemoryRouter><RecoveryPage mode="reset" /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText("account.newPassword"), { target: { value: "new-fixture-password" } });
  const confirm = screen.getByLabelText("auth.confirmPassword");
  fireEvent.change(confirm, { target: { value: "different-password" } });
  fireEvent.click(screen.getByRole("button", { name: "account.continue" }));
  expect(window.location.hash).toBe("");
  expect(document.activeElement).toBe(confirm);
  expect(confirm.getAttribute("aria-invalid")).toBe("true");
  expect(authApi.resetPassword).not.toHaveBeenCalled();
});
