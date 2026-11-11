import { test, expect, type Page } from "@playwright/test";

// Deliberate response ordering requires interception before service-worker fetch.
test.use({ serviceWorkers: "block" });

async function language(page: Page, value: string) {
  const desktop = page.locator(".desktop-actions .language-select");
  if (await desktop.isVisible()) await desktop.selectOption(value);
  else {
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await page.locator(".mobile-menu .language-select").selectOption(value);
    await page.keyboard.press("Escape");
  }
}
async function guess(page: Page, word: string) {
  await page.getByRole("grid").focus();
  await page.keyboard.type(word);
  await page.keyboard.press("Enter");
}

for (const fixture of [
  { lang: "en", answers: " apple \nAPPLE\nrebut\n12345", word: "REBUT", guess: "cigar" },
  { lang: "tr", answers: " kalem \nKALEM\nincir\n12345", word: "İNCİR", guess: "elmas" },
]) {
  test(`unavailable API uses only curated ${fixture.lang} answers and still accepts guess-only words`, async ({ page, context }) => {
    await context.addInitScript(({ lang }) => {
      localStorage.setItem("wordle_lang", lang);
      Math.random = () => 0.5;
    }, { lang: fixture.lang });
    await page.route("**/api/v1/word/random?lang=*", route => route.abort("failed"));
    await page.route(`**/words_${fixture.lang}_possible.txt`, route => route.fulfill({ contentType: "text/plain", body: fixture.guess }));
    await page.route(`**/words_${fixture.lang}.txt`, route => route.fulfill({ contentType: "text/plain", body: fixture.answers }));
    await page.goto("/game"); await expect(page.getByRole("grid")).toBeVisible();
    await guess(page, fixture.guess);
    await expect(page.locator(".board-row").first().locator(".cell-correct,.cell-present,.cell-absent").first()).toBeVisible();
    for (const letter of fixture.word) await page.locator(".keyboard").getByRole("button", { name: letter, exact: true }).click();
    await page.locator(".keyboard").getByRole("button", { name: "ENTER", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText(fixture.word);
  });
}

test("late English practice reply cannot replace a newer Turkish answer or hint", async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let received!: () => void;
  const requested = new Promise<void>(resolve => { received = resolve; });
  await page.route("**/words_*_possible.txt", route => route.fulfill({
    contentType: "text/plain", body: route.request().url().includes("words_tr") ? "incir\nkalem" : "APPLE\nCIGAR",
  }));
  await page.route("**/api/v1/word/random?lang=*", async route => {
    const tr = new URL(route.request().url()).searchParams.get("lang") === "tr";
    if (!tr) { received(); await held; }
    await route.fulfill({ json: { word: tr ? "incir" : "APPLE", definition: tr ? "current Turkish hint" : "obsolete English hint" } });
  });
  try {
    await page.goto("/game"); await requested;
    await language(page, "tr"); await expect(page.getByRole("grid")).toBeVisible();
    const oldResponse = page.waitForResponse(response => response.url().includes("/word/random?lang=en"));
    release(); await oldResponse;
    await guess(page, "incir");
    const result = page.getByRole("dialog");
    await expect(result).toContainText("İNCİR");
    await expect(result).toContainText("current Turkish hint");
    await expect(result).not.toContainText("obsolete English hint");
  } finally { release(); }
});

test("same-answer Play Again starts a clean playable round", async ({ page }) => {
  await page.route("**/api/v1/word/random?lang=*", route => route.fulfill({ json: { word: "APPLE", definition: "same hint" } }));
  await page.route("**/words_en_possible.txt", route => route.fulfill({ contentType: "text/plain", body: "APPLE\nCIGAR" }));
  await page.goto("/game"); await expect(page.getByRole("grid")).toBeVisible();
  await guess(page, "apple");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Play Again", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".board-row").first()).toHaveText("");
  await guess(page, "apple");
  await expect(page.getByRole("dialog")).toContainText("APPLE");
});

test("hard mode rejects a missing revealed duplicate without consuming the pending guess", async ({ page, context }) => {
  await context.addInitScript(() => localStorage.setItem("wordle_hard_mode", "1"));
  await page.route("**/api/v1/word/random?lang=*", route => route.fulfill({ json: { word: "LEVEL", definition: "fixture" } }));
  await page.route("**/words_en_possible.txt", route => route.fulfill({ contentType: "text/plain", body: "LEVEL\nEERIE\nLEMON\nLEVER" }));
  await page.goto("/game"); await expect(page.getByRole("grid")).toBeVisible();
  await guess(page, "eerie");
  await guess(page, "lemon");
  await expect(page.getByText("Guess must contain at least 2 copies of E", { exact: true })).toBeVisible();
  await expect(page.locator(".board-row").nth(1)).toHaveText("LEMON");
  for (let i = 0; i < 5; i++) await page.keyboard.press("Backspace");
  await guess(page, "lever");
  await expect(page.locator(".board-row").nth(1)).toHaveText("LEVER");
  await guess(page, "level");
  await expect(page.getByRole("dialog")).toContainText("LEVEL");
});
