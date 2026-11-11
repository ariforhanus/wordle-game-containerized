import {afterEach,expect,it,vi} from "vitest";
import {cleanup,render,screen} from "@testing-library/react";
import {MemoryRouter} from "react-router-dom";
import {LoginPage,RegisterPage} from "./AuthPages";
import {ToastProvider} from "./Toast";
vi.mock("react-i18next",()=>({useTranslation:()=>({t:(key:string)=>key,i18n:{language:"en"}})}));
vi.mock("../hooks/useAuth",()=>({useAuth:()=>({loading:true,login:vi.fn(),register:vi.fn()})}));
afterEach(cleanup);
it.each(["login","register"])("retains the %s submit name and busy state while a request is pending",mode=>{
 render(<MemoryRouter><ToastProvider>{mode==="login"?<LoginPage/>:<RegisterPage/>}</ToastProvider></MemoryRouter>);
 const button=screen.getByRole("button",{name:mode==="login"?"auth.loginBtn":"auth.registerBtn"});
 expect((button as HTMLButtonElement).disabled).toBe(true);
 expect(button.closest("form")?.getAttribute("aria-busy")).toBe("true");
});
