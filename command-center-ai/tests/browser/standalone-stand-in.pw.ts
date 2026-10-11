import { expect, test, type Page } from "@playwright/test";

// The standalone application on the scripted stand-in (`standalone/README.md`): what a person does
// first with the chat, in a real browser. The stand-in prefills the connect form but the token and
// takes any token, and its Agent streams reasoning, a tool call, and text that echoes the message.

const message = "What is in the notes?";

function collectPageErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function connect(page: Page, url = "/?stand-in") {
  await page.goto(url);
  await expect(page.getByLabel("Platform API URL")).toHaveValue("https://platform.stand-in.test");
  await expect(page.getByLabel("Access token")).toHaveValue("");
  await page.getByLabel("Access token").fill("any-token");
  await page.getByRole("button", { name: "Connect" }).click();

  // Ready to write: the default session is open, the Agent answered its check, and the composer is
  // enabled with its usual words.
  const composer = page.getByPlaceholder("Write a message");
  await expect(composer).toBeEnabled({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Send message" })).toBeVisible();
  return composer;
}

test("connects, sends a message, and streams the reply in", async ({ page }) => {
  const pageErrors = collectPageErrors(page);
  const composer = await connect(page);

  await composer.fill(message);
  await page.getByRole("button", { name: "Send message" }).click();

  await expect(page.getByText(`You wrote: "${message}".`)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("The scripted stand-in answered as Swift 1 (Stand-in Cloud)")).toBeVisible();
  // The reasoning and the tool call are folded under one line that counts the tool.
  const work = page.locator("button[aria-expanded]", { hasText: "Reasoning" });
  await expect(work).toContainText("1 tool");
  await work.click();
  await expect(page.locator('[data-tool-name="stand_in_search"]')).toContainText("Done");

  // The run is over and the composer takes the next message.
  await expect(composer).toBeEnabled();
  expect(pageErrors).toEqual([]);
});

test("opens the model provider settings and returns to the chat", async ({ page }) => {
  const pageErrors = collectPageErrors(page);
  const composer = await connect(page);

  await page.getByRole("button", { name: "Model providers" }).click();
  await expect(page.getByText("Built-in providers", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Organization custom providers", { exact: true })).toBeVisible();
  await expect(page.getByText("Stand-in Models").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" }).first()).toBeVisible();

  await page.getByRole("button", { name: "Back to chat" }).click();
  await expect(composer).toBeEnabled({ timeout: 20_000 });
  expect(pageErrors).toEqual([]);
});

for (const mode of ["docked", "overlay"] as const) {
  test(`resizes the ${mode} rail and keeps its width across close and expand`, async ({ page }, testInfo) => {
    const pageErrors = collectPageErrors(page);
    await page.setViewportSize({ width: mode === "docked" ? 1440 : 1280, height: 900 });
    await connect(page);
    await page.getByRole("button", { name: "Minimize to rail" }).click();
    const rail = page.locator(`[data-chat-rail="${mode}"]`);
    const handle = page.getByRole("separator", { name: "Resize chat rail" });
    await expect(rail).toBeVisible();
    await expect(handle).toHaveAttribute("aria-valuenow", "540");
    const initial = (await rail.boundingBox())!;
    const app = page.locator(".standalone-chat__app");
    const appWidth = (await app.boundingBox())!.width;
    await page.mouse.move(initial.x + 5, initial.y + 200);
    await page.mouse.down();
    await page.mouse.move(initial.x - 135, initial.y + 200, { steps: 10 });
    await page.mouse.up();
    await expect(handle).toHaveAttribute("aria-valuenow", "680");
    const resized = (await rail.boundingBox())!;
    expect(resized.x + resized.width).toBe(initial.x + initial.width);
    expect((await app.boundingBox())!.width).toBe(appWidth - (mode === "docked" ? 140 : 0));
    await page.screenshot({ path: testInfo.outputPath("rail.png") });

    await handle.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(handle).toHaveAttribute("aria-valuenow", "700");
    await page.keyboard.press("Shift+ArrowRight");
    await expect(handle).toHaveAttribute("aria-valuenow", "600");
    await page.keyboard.press("Home");
    await expect(handle).toHaveAttribute("aria-valuenow", "360");
    await expect(page.getByRole("button", { name: "Close chat rail" })).toBeInViewport();
    await page.keyboard.press("End");
    await expect(handle).toHaveAttribute("aria-valuenow", "900");
    await handle.dblclick();
    await expect(handle).toHaveAttribute("aria-valuenow", "540");
    await page.keyboard.press("ArrowLeft");
    await expect(handle).toHaveAttribute("aria-valuenow", "560");

    await page.getByRole("button", { name: "Close chat rail" }).click();
    await page.getByRole("button", { name: "Ask the assistant" }).click();
    await expect(handle).toHaveAttribute("aria-valuenow", "560");
    await page.getByRole("button", { name: "Expand", exact: true }).click();
    await page.getByRole("button", { name: "Minimize to rail" }).click();
    await expect(handle).toHaveAttribute("aria-valuenow", "560");
    expect(pageErrors).toEqual([]);
  });
}

for (const theme of ["main-sequence", "quartz-light"]) {
  test(`keeps the resized rail inside a phone viewport in ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await connect(page, `/?stand-in&theme=${theme}`);
    await page.getByRole("button", { name: "Minimize to rail" }).click();
    const handle = page.getByRole("separator", { name: "Resize chat rail" });
    await handle.focus();
    await page.keyboard.press("End");
    await expect(handle).toHaveAttribute("aria-valuenow", "900");
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(handle).toHaveAttribute("aria-valuenow", "365");
    await expect(page.getByRole("button", { name: "Close chat rail" })).toBeInViewport();
    await expect(page.getByPlaceholder("Write a message")).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
    await page.screenshot({ path: testInfo.outputPath("phone.png") });
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(handle).toHaveAttribute("aria-valuenow", "900");
  });
}
