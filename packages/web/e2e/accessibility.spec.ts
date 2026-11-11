import {test, expect, type Page} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import en from "../../i18n/locales/en.json" with {type:"json"};
import tr from "../../i18n/locales/tr.json" with {type:"json"};

async function register(page: Page) {
  const name = "accessible_" + Date.now() + Math.floor(Math.random()*1000);
  await page.goto("/register");
  await page.locator("#reg-username").fill(name);
  await page.locator("#reg-email").fill(name + "@example.test");
  await page.locator("#reg-password").fill("accessible-fixture-password");
  await page.locator("#reg-confirm").fill("accessible-fixture-password");
  await page.locator("#reg-country").selectOption({index:1});
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/$/);
}
async function audit(page: Page) {
  // Wait only for our visible modal fades, not browser-owned caret animations.
  // Their finished promises can remain pending in Firefox on focused inputs.
  for (const modal of await page.locator(".modal-overlay:visible, .modal-card:visible, .admin-confirm-overlay:visible").all()) {
    await expect(modal).toHaveCSS("opacity", "1");
  }
  const result = await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze();
  expect(result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))).toEqual([]);
  // Axe marks gradient backgrounds as incomplete. Check the rendered text colours
  // over sampled sRGB stops too, including the stat label's partial opacity.
  const gradients = await page.evaluate(() => {
    const rgb = (value: string) => value.match(/[\d.]+/g)!.slice(0, 3).map(Number);
    const luminance = (colour: number[]) => colour.map(value => {
      const channel = value / 255;
      return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
    }).reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0);
    return Array.from(document.querySelectorAll<HTMLElement>(
      ".stat-label-g, .stat-value-g, .btn-primary, .app-header .brand, .nav-link, .mobile-link, .admin-nav-link"
    )).filter(element => element.getClientRects().length && !element.matches(":disabled")).flatMap(element => {
      const style = getComputedStyle(element);
      const background = element.closest(".stat-card-gradient, .app-header, .admin-sidebar") ?? element;
      const stops = getComputedStyle(background).backgroundImage.match(/rgba?\([^)]+\)/g)?.map(rgb);
      if (!stops?.length) return [];
      const foreground = rgb(style.color), opacity = Number(style.opacity) * Number(style.color.match(/[\d.]+/g)?.[3] ?? 1);
      const overlay = element === background ? [0, 0, 0] : rgb(style.backgroundColor);
      const overlayOpacity = element === background ? 0 : Number(style.backgroundColor.match(/[\d.]+/g)?.[3] ?? 1);
      let minimum = Infinity;
      for (let stop = 0; stop < stops.length - 1; stop++) for (let sample = 0; sample <= 100; sample++) {
        const bg = stops[stop].map((value, channel) => {
          const base = value + (stops[stop + 1][channel] - value) * sample / 100;
          return base * (1 - overlayOpacity) + overlay[channel] * overlayOpacity;
        });
        const fg = foreground.map((value, channel) => value * opacity + bg[channel] * (1 - opacity));
        const light = [luminance(bg), luminance(fg)].sort((a,b)=>a-b);
        minimum = Math.min(minimum, (light[1] + .05) / (light[0] + .05));
      }
      const large = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700);
      return minimum >= (large ? 3 : 4.5) ? [] : [{text:element.textContent,minimum}];
    });
  });
  expect(gradients).toEqual([]);
  const overflow = await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,items:Array.from(document.querySelectorAll("body *")).filter(el=>{const rect=el.getBoundingClientRect();return rect.right>innerWidth+1 && getComputedStyle(el).position!=="fixed";}).slice(0,8).map(el=>({tag:el.tagName,id:el.id,className:el.className}))}));
  expect(overflow.scroll,JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.width+1);
}
for (const language of ["en","tr"] as const) {
  for (const appearance of ["light","dark"] as const) {
    test(`complete account/profile/theme focus and contrast in ${language}/${appearance}`, async ({page,context}) => {
      test.setTimeout(90_000);
      const text = language === "en" ? en : tr;
      await context.addInitScript(({language,appearance})=>{localStorage.setItem("wordle_lang",language);localStorage.setItem("theme",appearance);},{language,appearance});
      for (const path of ["/login","/register","/forgot-password","/reset-password","/verify-email","/themes"]) {
        await page.goto(path); await expect(page.locator("main")).toBeVisible(); await audit(page);
      }
      await register(page);
      await page.goto("/account"); await expect(page.locator("#current-password")).toBeVisible();
      await audit(page);
      await page.locator("summary").click(); await audit(page);
      await page.goto("/profile");
      const edit = page.getByRole("button",{name:text.profile.editProfile,exact:true});
      await expect(edit).toBeVisible(); await audit(page);
      await edit.focus(); await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog",{name:text.profile.editProfile});
      await expect(dialog).toBeVisible(); await audit(page);
      for (const name of [text.auth.firstName,text.auth.lastName,text.auth.email,text.auth.country]) await expect(dialog.getByLabel(name,{exact:true})).toBeVisible();
      const first = dialog.getByRole("button",{name:text.a11y.close}); await expect(first).toBeFocused();
      await page.keyboard.press("Shift+Tab"); await expect(dialog.getByRole("button",{name:text.profile.save,exact:true})).toBeFocused();
      await page.keyboard.press("Tab"); await expect(first).toBeFocused();
      await page.keyboard.press("Escape"); await expect(edit).toBeFocused();
      const achievements = page.getByRole("button",{name:new RegExp(text.profile.achievements)});
      await achievements.focus(); await page.keyboard.press("Enter");
      await expect(page.getByRole("dialog",{name:text.profile.achievements})).toBeVisible(); await audit(page);
      await page.keyboard.press("Escape"); await expect(achievements).toBeFocused();
      await page.goto("/themes"); await page.locator('a.theme-card[href="/themes/marvel"]').focus(); await page.keyboard.press("Enter");
      await expect(page.locator("main")).toBeFocused();
      await expect(page.getByRole("heading",{level:1,name:"Marvel"})).toBeVisible(); await expect(page.getByRole("grid")).toBeVisible(); await audit(page);
      await page.goto("/themes/football"); await expect(page.getByRole("grid")).toBeVisible(); await audit(page);
    });
  }
}

test("recovery routes discard prior completion and credentials on client-side navigation", async ({page})=>{
  await page.goto("/forgot-password");
  await page.locator("#recovery-email").fill("unknown_route_"+Date.now()+"@example.test");
  await page.locator('button').filter({hasText:/^Continue$/}).click();
  await expect(page.locator(".auth-card [role=status]")).toBeVisible();
  await page.evaluate(()=>{history.pushState(null,"","/reset-password#token=fixture-only"); dispatchEvent(new PopStateEvent("popstate"));});
  await expect(page.locator("#new-password")).toBeVisible();
  await expect(page.locator("#new-password")).toHaveValue("");
  await expect.poll(()=>new URL(page.url()).hash).toBe("");
  await page.locator("#new-password").fill("discarded-fixture-password");
  await page.evaluate(()=>{history.pushState(null,"","/verify-email#token=another-fixture"); dispatchEvent(new PopStateEvent("popstate"));});
  await expect(page.getByRole("heading",{name:"Verify email",exact:true})).toBeVisible();
  await expect(page.locator("#new-password")).toHaveCount(0);
  await expect(page.locator(".auth-card button")).toBeEnabled();
});


test("account and theme screens reflow with narrow/landscape viewports and enlarged text", async ({page}) => {
  test.setTimeout(90_000);
  await register(page);
  for (const viewport of [{width:320,height:568},{width:736,height:320}]) {
    await page.setViewportSize(viewport);
    for (const path of ["/login","/register","/forgot-password","/themes"]) {
      await page.goto(path); await page.evaluate(()=>document.documentElement.style.fontSize="200%");
      await audit(page);
      await page.locator("main").evaluate(element => {element.tabIndex=-1;element.focus();});
      await page.keyboard.press("Tab");
      expect(await page.locator("main").evaluate(main=>main.contains(document.activeElement))).toBe(true);
    }
    await page.goto("/profile"); await page.evaluate(()=>document.documentElement.style.fontSize="200%");
    await expect(page.getByRole("button",{name:"Edit Profile",exact:true})).toBeVisible(); await audit(page);
    await page.getByRole("button",{name:"Edit Profile",exact:true}).click(); await audit(page);
    await page.keyboard.press("Escape"); await expect(page.getByRole("button",{name:"Edit Profile",exact:true})).toBeFocused();
  }
});

test("admin account controls have names and confirmation owns keyboard focus", async ({page,context})=>{
  test.skip(!process.env.E2E_ADMIN_USERNAME || !process.env.E2E_ADMIN_PASSWORD,"Requires isolated bootstrap admin");
  const response = await context.request.post("/api/v1/auth/login",{data:{username:process.env.E2E_ADMIN_USERNAME,password:process.env.E2E_ADMIN_PASSWORD}});
  expect(response.status()).toBe(200); const session=await response.json();
  await context.addInitScript(({token,expiry})=>{localStorage.setItem("jwtToken",token);localStorage.setItem("tokenExpiry",String(Date.now()+expiry));},{token:session.token,expiry:session.expiresIn});
  for (const appearance of ["light","dark"]) {
    for (const path of ["/admin","/admin/users","/admin/words","/admin/audit"]) {
      await page.goto(path);await expect(page.getByRole("heading",{level:1})).toBeVisible();
      await page.evaluate(theme=>document.documentElement.setAttribute("data-theme",theme),appearance);
      await audit(page);
      if (path==="/admin/users") {
        await expect(page.getByRole("textbox",{name:"Search users..."})).toBeVisible();
        const trigger=page.getByRole("button",{name:"Delete",exact:true}).first();await expect(trigger).toBeVisible();await trigger.click();
        await expect(page.getByRole("dialog")).toBeVisible();await audit(page);
        await expect(page.getByRole("button",{name:"Cancel",exact:true})).toBeFocused();
        await page.keyboard.press("Escape");await expect(trigger).toBeFocused();
      }
    }
  }
});
