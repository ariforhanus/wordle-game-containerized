import {afterEach,expect,it,vi} from "vitest";
import {act,cleanup,renderHook} from "@testing-library/react";
import {getTokenUsername,isAuthenticated} from "@wordle/api";
import {useTheme} from "../hooks/useTheme";
afterEach(()=>{cleanup();vi.restoreAllMocks();localStorage.clear();});
it("reads the username claim rather than the immutable numeric subject, including UTF-8",()=>{
 const payload=btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify({sub:"42",username:"Çağrı"})))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
 localStorage.setItem("jwtToken","fixture."+payload+".fixture");
 expect(getTokenUsername()).toBe("Çağrı");
 localStorage.setItem("jwtToken","fixture."+btoa(JSON.stringify({sub:"42"}))+".fixture");
 expect(getTokenUsername()).toBeNull();
});
it("fails closed on unreadable session storage while keeping the theme operable",()=>{
 vi.spyOn(Storage.prototype,"getItem").mockImplementation(()=>{throw new DOMException("blocked","SecurityError");});
 vi.spyOn(Storage.prototype,"setItem").mockImplementation(()=>{throw new DOMException("blocked","SecurityError");});
 expect(isAuthenticated()).toBe(false);
 const {result}=renderHook(()=>useTheme());expect(result.current.theme).toBe("light");
 act(()=>result.current.toggleTheme());expect(result.current.theme).toBe("dark");
});
