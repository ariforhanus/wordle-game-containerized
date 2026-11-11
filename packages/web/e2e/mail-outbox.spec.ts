import { test, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";
import en from "../../i18n/locales/en.json" with { type: "json" };
import tr from "../../i18n/locales/tr.json" with { type: "json" };

// An isolated harness starts with refused SMTP, then restarts the application
// with healthy loopback SMTP after the marker. No production control endpoint.
test("durable queued mail survives an application restart and SMTP recovery in EN/TR", async ({ page, context }) => {
  test.skip(process.env.E2E_MAIL_OUTBOX_RECOVERY !== "true", "Requires an isolated outbox/restart harness");
  test.setTimeout(120_000);
  const capture = process.env.E2E_SMTP_CAPTURE_URL;
  const marker = process.env.E2E_OUTBOX_READY_FILE;
  if (!capture || !marker) throw new Error("Missing isolated capture/restart fixture configuration");
  const cases: { language: "en" | "tr"; email: string; session: string }[] = [];
  for (const language of ["en", "tr"] as const) {
    const text = (language === "en" ? en : tr).account;
    await page.goto("/");
    await page.evaluate((value) => { localStorage.clear(); localStorage.setItem("wordle_lang", value); }, language);
    const username = `outbox_${language}_${Date.now()}`;
    const email = username + "@example.test";
    await page.goto("/register");
    await page.locator("#reg-username").fill(username);
    await page.locator("#reg-email").fill(email);
    await page.locator("#reg-password").fill("browser-password-123");
    await page.locator("#reg-confirm").fill("browser-password-123");
    await page.locator("#reg-country").selectOption({ index: 1 });
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/$/);
    const session = await page.evaluate(() => localStorage.getItem("jwtToken"));
    expect(session).toBeTruthy();
    cases.push({ language, email, session: session! });
    await page.goto("/account");
    const verification = page.getByRole("button", { name: text.sendVerification, exact: true });
    await expect(verification).toHaveAccessibleDescription(text.newLinkRule);
    await verification.click();
    await expect(page.getByRole("status")).toHaveText(text.emailSent);
    await page.goto("/forgot-password");
    await expect(page.locator("#recovery-email")).toHaveAccessibleDescription(text.newLinkRule);
    await page.locator("#recovery-email").fill(email);
    await page.getByRole("button", { name: text.continue, exact: true }).click();
    await expect(page.getByRole("status")).toHaveText(text.emailSent);
    await expect(page.getByRole("alert")).toHaveCount(0);
  }
  const before = await (await context.request.get(capture)).json();
  expect(before.filter((message: { to: string }) => cases.some((item) => item.email === message.to))).toHaveLength(0);
  // Contains no address, session, token or key; the harness restarts only its own process.
  writeFileSync(marker, "queued\n", { mode: 0o600, flag: "wx" });
  let messages: { to: string; body: string }[] = [];
  await expect.poll(async () => {
    messages = await (await context.request.get(capture)).json();
    return messages.filter((message) => cases.some((item) => item.email === message.to)).length;
  }, { timeout: 60_000 }).toBe(4);
  for (const item of cases) {
    const text = (item.language === "en" ? en : tr).account;
    const received = messages.filter((message) => message.to === item.email);
    const link = (kind: string) => {
      const body = received.find((message) => message.body.includes("/" + kind))!.body;
      expect(body).toMatch(/^Message-ID: <wordle-[0-9a-f-]+@localhost>$/m);
      const url = body.match(new RegExp("https?://[^\\s]+/" + kind + "#token=[A-Za-z0-9_-]+"))![0];
      expect(new URL(url).origin).toBe(new URL(process.env.E2E_BASE_URL!).origin);
      return url;
    };
    await page.evaluate((value) => localStorage.setItem("wordle_lang", value), item.language);
    await page.goto(link("verify-email"));
    await page.getByRole("button", { name: text.continue, exact: true }).click();
    await expect(page.getByRole("status")).toBeVisible();
    const reset = link("reset-password");
    await page.goto(reset);
    await page.locator("#new-password").fill("replacement-password-123");
    await page.locator("#confirm-password").fill("replacement-password-123");
    await page.getByRole("button", { name: text.continue, exact: true }).click();
    await expect(page.getByRole("status")).toBeVisible();
    expect((await context.request.get("/api/v1/auth/me", { headers: { Authorization: "Bearer " + item.session } })).status()).toBe(401);
    expect((await context.request.post("/api/v1/account/reset-password", { data: {
      token: new URL(reset).hash.slice("#token=".length), password: "replacement-password-123",
    } })).status()).toBe(400);
  }
});
