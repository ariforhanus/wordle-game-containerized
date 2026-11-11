import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RecoveryPage } from "./AccountPages";
import { authApi } from "@wordle/api";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@wordle/api", async (original) => ({
  ...(await original<typeof import("@wordle/api")>()),
  authApi: {
    resetPassword: vi.fn().mockResolvedValue(undefined),
    verifyEmail: vi.fn().mockResolvedValue(undefined),
    forgotPassword: vi.fn().mockResolvedValue(undefined),
  },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/");
});
describe("recovery links", () => {
  it("does not consume a verification link on page load and clears the fragment", async () => {
    window.history.replaceState(null, "", "/verify-email#token=test-link");
    render(
      <MemoryRouter>
        <RecoveryPage mode="verify" />
      </MemoryRouter>,
    );
    expect(window.location.hash).toBe("");
    expect(authApi.verifyEmail).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "account.continue" }));
    await screen.findByRole("status");
    expect(authApi.verifyEmail).toHaveBeenCalledWith("test-link");
  });
  it("does not display an account-existence claim after requesting a reset", async () => {
    render(
      <MemoryRouter>
        <RecoveryPage mode="forgot" />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText("auth.email"), {
      target: { value: "unknown@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "account.continue" }));
    expect(await screen.findByRole("status")).toHaveProperty(
      "textContent",
      "account.emailSent",
    );
  });
});
