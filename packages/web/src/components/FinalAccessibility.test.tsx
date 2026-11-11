import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import UserPage from "./UserPage";
import { AccountSecurityPage, RecoveryPage } from "./AccountPages";
import { ToastProvider } from "./Toast";
import { authApi, scoreApi, ApiError } from "@wordle/api";
import { statsFixture } from "../../tests/fixtures/stats";
vi.mock("react-i18next", () => ({useTranslation: () => ({t: (key: string) => key, i18n: {language: "en"}})}));
vi.mock("@wordle/api", async original => ({...(await original<typeof import("@wordle/api")>()), isAuthenticated: () => true,
 authApi: {getMe: vi.fn(), updateProfile: vi.fn(), uploadAvatar: vi.fn(), resetPassword: vi.fn()},
 scoreApi: {getMyStats: vi.fn()},
}));
const profile = {username:"ab",email:"fixture@example.test",role:"USER" as const,emailVerified:true};
beforeEach(() => {vi.resetAllMocks(); vi.mocked(authApi.getMe).mockResolvedValue(profile); vi.mocked(scoreApi.getMyStats).mockResolvedValue(statsFixture("en"));});
afterEach(() => {cleanup(); window.history.replaceState(null,"","/");});
function mount(element: React.ReactNode) {return render(<MemoryRouter><ToastProvider>{element}</ToastProvider></MemoryRouter>);}
it("exposes achievements as a button and restores focus after Escape from either profile dialog", async () => {
 mount(<UserPage/>);
 const achievements = await screen.findByRole("button", {name:/profile.achievements/});
 achievements.focus(); fireEvent.click(achievements);
 const modal = screen.getByRole("dialog", {name:"profile.achievements"});
 const close = screen.getByRole("button", {name:"a11y.close"});
 expect(document.activeElement).toBe(close);
 fireEvent.keyDown(close,{key:"Tab",shiftKey:true}); expect(modal.contains(document.activeElement)).toBe(true);
 fireEvent.keyDown(document,{key:"Escape"}); expect(screen.queryByRole("dialog")).toBeNull(); expect(document.activeElement).toBe(achievements);
 const edit = screen.getByRole("button",{name:"profile.editProfile"}); edit.focus(); fireEvent.click(edit);
 expect(screen.getByLabelText("auth.username *")).toHaveProperty("value","ab");
 for (const label of ["auth.firstName","auth.lastName","auth.email","auth.country"]) expect(screen.getByLabelText(label)).toBeTruthy();
 expect(screen.getByRole("button",{name:"profile.choosePhoto"})).toBeTruthy();
 fireEvent.keyDown(document,{key:"Escape"}); expect(screen.queryByRole("dialog")).toBeNull(); expect(document.activeElement).toBe(edit);
});
it("saves a valid two-character username and restores focus after the data reload", async () => {
 vi.mocked(authApi.updateProfile).mockResolvedValue(undefined);
 mount(<UserPage/>); fireEvent.click(await screen.findByRole("button",{name:"profile.editProfile"}));
 fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
 await waitFor(() => expect(authApi.updateProfile).toHaveBeenCalledWith(expect.objectContaining({username:"ab"})));
 await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
 await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button",{name:"profile.editProfile"})));
});
it("announces a failed avatar upload and keeps the edit form available for explicit retry", async () => {
 vi.mocked(authApi.updateProfile).mockResolvedValue(undefined); vi.mocked(authApi.uploadAvatar).mockRejectedValue(new ApiError(400,{error:"invalid_file_type"}));
 mount(<UserPage/>); fireEvent.click(await screen.findByRole("button",{name:"profile.editProfile"}));
 const file = new File(["fixture"],"avatar.png",{type:"image/png"});
 fireEvent.change(screen.getByLabelText("profile.choosePhoto"), {target:{files:[file]}});
 fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
 const error = await screen.findByRole("alert"); expect(error.textContent).toBe("api.upload_failed"); await waitFor(() => expect(document.activeElement).toBe(error));
 expect(screen.getByRole("dialog")).toBeTruthy();
});
it("retries a failed profile read without losing the session or password input", async () => {
 vi.mocked(authApi.getMe).mockRejectedValueOnce(new Error("offline"));
 mount(<AccountSecurityPage/>); await screen.findByRole("alert");
 fireEvent.change(screen.getByLabelText("account.newPassword"),{target:{value:"retained-fixture-password"}});
 fireEvent.click(screen.getByRole("button",{name:"a11y.retry"})); await screen.findByText("account.verified");
 expect(screen.getByLabelText("account.newPassword")).toHaveProperty("value","retained-fixture-password"); expect(authApi.getMe).toHaveBeenCalledTimes(2);
});
it("identifies the short new recovery password on the field that receives focus", () => {
 window.history.replaceState(null,"","/reset-password#token=fixture-token");
 mount(<RecoveryPage mode="reset"/>);
 const password = screen.getByLabelText("account.newPassword"); fireEvent.change(password,{target:{value:"short"}});
 fireEvent.submit(password.closest("form")!);
 expect(document.activeElement).toBe(password); expect(password.getAttribute("aria-invalid")).toBe("true");
 expect(password.getAttribute("aria-describedby")).toBe("recovery-error");
 expect(screen.getByLabelText("auth.confirmPassword").getAttribute("aria-invalid")).toBeNull();
 expect(authApi.resetPassword).not.toHaveBeenCalled();
});
