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

async function connect(page: Page) {
  await page.goto("/?stand-in");
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
