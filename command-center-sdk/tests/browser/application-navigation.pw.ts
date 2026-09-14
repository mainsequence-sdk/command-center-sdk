import { expect, test } from "@playwright/test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ApplicationImmersiveBar,
  ApplicationNavigationShell,
  ApplicationNavigationTrigger,
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

test.describe("overlay navigation on a touch phone", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 375, height: 812 } });

  test("overlay presentation renders an off-canvas drawer that fits the viewport", async ({ page }) => {
    const { readFile } = await import("node:fs/promises");
    const [componentStyles, themeStyles] = await Promise.all([
      readFile(new URL("../../styles.css", import.meta.url), "utf8"),
      readFile(new URL("../../theme/styles.css", import.meta.url), "utf8"),
    ]);
    const application = defineNavigationApplication({
      id: "foundry",
      label: "Foundry",
      defaultDestinationId: "services",
      subApplications: [{
        id: "build",
        label: "Build",
        destinations: [{ id: "services", label: "Services", href: `${origin}/app/foundry/services` }],
      }],
    });
    const markup = renderToStaticMarkup(
      createElement(
        ApplicationNavigationShell,
        {
          applications: [application],
          collapsed: true,
          menuId: "primary-menu",
          menuOpen: true,
          onMenuOpenChange: () => undefined,
          onNavigate: () => undefined,
          onOpenApplicationChange: () => undefined,
          openApplicationId: "foundry",
          presentation: "overlay",
        },
        createElement("main", null, "Consumer surface"),
      ),
    );
    await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${themeStyles}${componentStyles}</style></head><body>${markup}</body></html>`);

    const drawer = page.locator("[data-cc-navigation-drawer]");
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveAttribute("role", "dialog");
    await expect(page.locator("[data-cc-navigation-scrim]")).toBeVisible();
    const geometry = await drawer.evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished));
      const rect = element.getBoundingClientRect();
      const item = element.querySelector<HTMLElement>("[data-cc-navigation-application]")!;
      const destination = element.querySelector<HTMLElement>("[data-cc-navigation-destination]")!;
      return {
        coarse: matchMedia("(pointer: coarse)").matches,
        destinationHeight: destination.getBoundingClientRect().height,
        height: rect.height,
        itemHeight: item.getBoundingClientRect().height,
        left: rect.left,
        right: rect.right,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
      };
    });
    expect(geometry.coarse).toBe(true);
    expect(geometry.viewportWidth).toBe(375);
    expect(geometry.left).toBe(0);
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth - 48);
    expect(Math.abs(geometry.height - geometry.viewportHeight)).toBeLessThanOrEqual(1);
    expect(geometry.itemHeight).toBeGreaterThanOrEqual(44);
    expect(geometry.destinationHeight).toBeGreaterThanOrEqual(44);
    await expect(page.getByRole("link", { name: "Foundry" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Services" })).toBeVisible();
    await expect(page.getByText("Consumer surface")).toBeAttached();
  });
});

test.describe("immersive bar on a touch phone", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 375, height: 812 } });

  test("spans the viewport with touch-sized controls above the embedded surface", async ({ page }) => {
    const { readFile } = await import("node:fs/promises");
    const [componentStyles, themeStyles] = await Promise.all([
      readFile(new URL("../../styles.css", import.meta.url), "utf8"),
      readFile(new URL("../../theme/styles.css", import.meta.url), "utf8"),
    ]);
    const markup = renderToStaticMarkup(
      createElement(
        "div",
        { style: { display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden" } },
        createElement(ApplicationImmersiveBar, {
          backHref: `${origin}/app/home`,
          backLabel: "Command Center",
          title: "A deliberately long embedded site name that must truncate on a phone",
          trailing: createElement(ApplicationNavigationTrigger, {
            controlsId: "menu",
            onOpenChange: () => undefined,
            open: false,
          }),
        }),
        createElement("iframe", { style: { border: 0, flex: "1 1 auto", minHeight: 0 }, title: "Site" }),
      ),
    );
    await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${themeStyles}${componentStyles}</style></head><body style="margin:0">${markup}</body></html>`);

    const bar = page.locator("[data-cc-immersive-bar]");
    await expect(bar).toBeVisible();
    await expect(page.getByRole("link", { name: "Command Center" })).toBeVisible();
    const geometry = await bar.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const back = element.querySelector<HTMLElement>("[data-cc-immersive-back]")!.getBoundingClientRect();
      const trigger = element.querySelector<HTMLElement>("[data-cc-navigation-trigger]")!.getBoundingClientRect();
      const iframe = document.querySelector("iframe")!.getBoundingClientRect();
      return {
        backHeight: back.height,
        height: rect.height,
        iframeBottom: iframe.bottom,
        iframeTop: iframe.top,
        scrollWidth: document.documentElement.scrollWidth,
        triggerHeight: trigger.height,
        triggerWidth: trigger.width,
        viewportHeight: window.innerHeight,
        width: rect.width,
      };
    });
    expect(geometry.width).toBe(375);
    expect(geometry.scrollWidth).toBe(375);
    expect(geometry.height).toBeGreaterThanOrEqual(44);
    expect(geometry.backHeight).toBeGreaterThanOrEqual(44);
    expect(geometry.triggerHeight).toBeGreaterThanOrEqual(44);
    expect(geometry.triggerWidth).toBeGreaterThanOrEqual(44);
    expect(Math.abs(geometry.iframeTop - geometry.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.iframeBottom - geometry.viewportHeight)).toBeLessThanOrEqual(1);
  });
});
