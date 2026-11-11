import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RegisterPage } from "./AuthPages";
import { ToastProvider } from "./Toast";

const mocks = vi.hoisted(() => ({ register: vi.fn(), upload: vi.fn() }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }) }));
vi.mock("../hooks/useAuth", () => ({ useAuth: () => ({ loading: false, register: mocks.register }) }));
vi.mock("@wordle/api", () => ({ authApi: { uploadAvatar: mocks.upload } }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it("keeps registration busy during avatar upload and announces a partial failure without creating another account", async () => {
  mocks.register.mockResolvedValue({ success: true });
  let rejectUpload!: (error: Error) => void;
  mocks.upload.mockReturnValue(new Promise((_resolve, reject) => { rejectUpload = reject; }));
  render(<MemoryRouter initialEntries={["/register"]}><ToastProvider><Routes>
    <Route path="/register" element={<RegisterPage />} />
    <Route path="/" element={<h1>Home</h1>} />
  </Routes></ToastProvider></MemoryRouter>);
  for (const [id, value] of [["reg-username", "fixture"], ["reg-email", "fixture@example.test"],
    ["reg-password", "fixture-password"], ["reg-confirm", "fixture-password"]]) {
    fireEvent.change(document.getElementById(id)!, { target: { value } });
  }
  const country = document.getElementById("reg-country") as HTMLSelectElement;
  fireEvent.change(country, { target: { value: country.options[1].value } });
  fireEvent.change(document.getElementById("reg-avatar")!, {
    target: { files: [new File(["fixture"], "avatar.png", { type: "image/png" })] },
  });
  const submit = screen.getByRole("button", { name: "auth.registerBtn" });
  fireEvent.click(submit);
  await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1));
  expect(submit).toHaveProperty("disabled", true);
  expect(submit.closest("form")?.getAttribute("aria-busy")).toBe("true");
  fireEvent.submit(submit.closest("form")!);
  expect(mocks.register).toHaveBeenCalledTimes(1);
  await act(async () => rejectUpload(new Error("upload rejected")));
  await screen.findByRole("heading", { name: "Home" });
  expect(screen.getByText("api.upload_failed").closest("[aria-live]")?.getAttribute("aria-live")).toBe("polite");
  expect(screen.getByText("auth.registerSuccess")).toBeTruthy();
});
