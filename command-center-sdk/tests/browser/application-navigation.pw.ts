import { expect, test } from "@playwright/test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ApplicationNavigationShell,
  defineNavigationApplication,
} from "../../dist/navigation/index.js";

let server: Server;
let origin: string;

test.beforeAll(async () => {
  server = createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end("<!doctype html><title>Services</title><h1>Services target</h1>");
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address() as AddressInfo;
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

function navigationMarkup() {
  const href = `${origin}/app/foundry/services`;
  const application = defineNavigationApplication({
    id: "foundry",
    label: "Foundry",
    defaultDestinationId: "services",
    subApplications: [{
      id: "build",
      label: "Build",
      destinations: [{ id: "services", label: "Services", href }],
    }],
  });

  return {
    href,
    markup: renderToStaticMarkup(
      createElement(
        ApplicationNavigationShell,
        {
          applications: [application],
          collapsed: false,
          onNavigate: () => undefined,
          onOpenApplicationChange: () => undefined,
          openApplicationId: "foundry",
        },
        createElement("main", null, "Consumer surface"),
      ),
    ),
  };
}

test.describe("public application navigation links", () => {
  test("opens application and destination hrefs in new tabs", async ({ context, page }) => {
    const { href, markup } = navigationMarkup();
    await page.setContent(`<!doctype html><body>${markup}</body>`);

    const applicationLink = page.getByRole("link", { name: "Foundry" });
    const destinationLink = page.getByRole("link", { name: "Services" });
    await expect(applicationLink).toHaveAttribute("href", href);
    await expect(destinationLink).toHaveAttribute("href", href);

    const newTabModifier = process.platform === "darwin" ? "Meta" : "Control";
    for (const link of [applicationLink, destinationLink]) {
      const openedPagePromise = context.waitForEvent("page");
      await link.click({ modifiers: [newTabModifier] });
      const openedPage = await openedPagePromise;
      await openedPage.waitForLoadState();
      await expect(openedPage.getByRole("heading", { name: "Services target" })).toBeVisible();
      expect(openedPage.url()).toBe(href);
      await openedPage.close();
    }
  });
});
