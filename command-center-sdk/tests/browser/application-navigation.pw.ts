import { expect, test } from "@playwright/test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ApplicationImmersiveBar,
  ApplicationNavigationDrawer,
  ApplicationNavigationPanel,
  ApplicationNavigationPanelShell,
  ApplicationNavigationShell,
  ApplicationNavigationTrigger,
  defineNavigationApplication,
} from "../../dist/navigation/index.js";
import { assertCommandCenterApplicationShell } from "../../dist/navigation/testing/index.js";
import { ApplicationStatusScreen } from "../../dist/feedback/index.js";
import { ApplicationPage } from "../../dist/layout/index.js";

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

test.describe("embedded application-shell conformance", () => {
  test("accepts the gated startup phase and canonical one-level ready phase", async ({ page }) => {
    const application = defineNavigationApplication({
      id: "connectors",
      label: "Connectors",
      defaultDestinationId: "overview",
      subApplications: [{
        id: "connectors",
        label: "Connectors",
        destinations: [
          { id: "overview", label: "Overview", href: "/overview" },
          { id: "activity", label: "Activity", href: "/activity" },
        ],
      }],
    });
    const startupMarkup = renderToStaticMarkup(
      createElement(ApplicationStatusScreen, {
        message: "Connecting delegated API transport.",
        title: "Preparing application",
        variant: "viewport",
      }),
    );
    await page.setContent(`<!doctype html><body>${startupMarkup}</body>`);
    const startupReport = await assertCommandCenterApplicationShell(page, {
      navigationDepth: 1,
      phase: "startup",
    });
    expect(startupReport.ok).toBe(true);

    const readyMarkup = renderToStaticMarkup(
      createElement(
        ApplicationNavigationPanelShell,
        {
          activeDestinationId: "overview",
          application,
          menuOpen: false,
          onMenuOpenChange: () => undefined,
          onNavigate: () => undefined,
          presentation: "docked",
        },
        createElement(ApplicationPage, null, "Ready application"),
      ),
    );
    await page.setContent(`<!doctype html><body>${readyMarkup}</body>`);
    const readyReport = await assertCommandCenterApplicationShell(page, {
      navigationDepth: 1,
      phase: "ready",
    });
    expect(readyReport.ok).toBe(true);
    await expect(page.locator('[data-theme-chrome="topbar"]')).toHaveCount(0);
    await expect(page.locator(".cc-application-navigation-panel__section-label")).toHaveCount(0);
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

  test("panel-only navigation uses the full drawer without a rail or top bar", async ({ page }) => {
    const { readFile } = await import("node:fs/promises");
    const [componentStyles, themeStyles] = await Promise.all([
      readFile(new URL("../../styles.css", import.meta.url), "utf8"),
      readFile(new URL("../../theme/styles.css", import.meta.url), "utf8"),
    ]);
    const application = defineNavigationApplication({
      id: "connectors",
      label: "Connectors",
      defaultDestinationId: "overview",
      subApplications: [{
        id: "connectors",
        label: "Connectors",
        destinations: [
          { id: "overview", label: "Overview", href: "/overview" },
          { id: "activity", label: "Activity", href: "/activity" },
        ],
      }],
    });
    const markup = renderToStaticMarkup(
      createElement(
        ApplicationNavigationPanelShell,
        {
          activeDestinationId: "overview",
          application,
          menuOpen: true,
          onMenuOpenChange: () => undefined,
          onNavigate: () => undefined,
          presentation: "overlay",
        },
        createElement(ApplicationPage, null, "Connector monitor"),
      ),
    );
    await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${themeStyles}${componentStyles}</style></head><body>${markup}</body></html>`);

    await assertCommandCenterApplicationShell(page, { navigationDepth: 1, phase: "ready" });
    await expect(page.locator("[data-cc-navigation-rail]")).toHaveCount(0);
    await expect(page.locator('[data-theme-chrome="topbar"]')).toHaveCount(0);
    const drawer = page.locator("[data-cc-navigation-drawer]");
    const geometry = await drawer.evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished));
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, viewportWidth: window.innerWidth };
    });
    expect(geometry.left).toBe(0);
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth - 48);
    await expect(page.getByRole("link", { name: "Overview" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Activity" })).toBeVisible();
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

test.describe("standalone navigation panel on a touch phone", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 375, height: 812 } });

  test("stays at the edge of the host's own wrapper instead of a rail-width offset", async ({ page }) => {
    const { readFile } = await import("node:fs/promises");
    const [componentStyles, themeStyles] = await Promise.all([
      readFile(new URL("../../styles.css", import.meta.url), "utf8"),
      readFile(new URL("../../theme/styles.css", import.meta.url), "utf8"),
    ]);
    const panel = renderToStaticMarkup(
      createElement(ApplicationNavigationPanel, {
        application: defineNavigationApplication({
          id: "foundry",
          label: "Foundry",
          subApplications: [{
            id: "build",
            label: "Build",
            destinations: [{ id: "services", label: "Services", href: `${origin}/app/foundry/services` }],
          }],
        }),
        onNavigate: () => undefined,
      }),
    );
    await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${themeStyles}${componentStyles}</style></head>
      <body style="margin:0">
        <aside style="position:fixed;inset-block:0;left:0;width:52px"></aside>
        <div style="position:fixed;top:0;bottom:0;left:52px;z-index:90">${panel}</div>
      </body></html>`);
    const rect = await page.locator("[data-app-navigation-panel]").evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return { left: bounds.left, right: bounds.right, viewportWidth: window.innerWidth };
    });
    expect(rect.left).toBe(52);
    expect(rect.right).toBeLessThanOrEqual(rect.viewportWidth);
    await expect(page.getByRole("link", { name: "Services" })).toBeVisible();
  });
});

function hostFrameMarkup() {
  // SDK ADR 010: from `md` up a host keeps only its top bar around an embedded site and opens its
  // own navigation in the drawer.
  return renderToStaticMarkup(
    createElement(
      "div",
      { style: { display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden" } },
      createElement(
        "header",
        { "data-theme-chrome": "topbar", style: { alignItems: "center", display: "flex", flex: "0 0 56px" } },
        createElement(ApplicationNavigationTrigger, {
          controlsId: "host-menu",
          onOpenChange: () => undefined,
          open: true,
        }),
      ),
      createElement("iframe", { style: { border: 0, flex: "1 1 auto", minHeight: 0 }, title: "Site" }),
      createElement(
        ApplicationNavigationDrawer,
        { id: "host-menu", label: "Host navigation", onOpenChange: () => undefined, open: true },
        createElement(
          "nav",
          { "aria-label": "Host applications", style: { display: "grid", gap: "0.5rem", padding: "1rem" } },
          createElement("a", { href: `${origin}/app/foundry` }, "Foundry"),
          createElement("a", { href: `${origin}/app/marketplace` }, "Marketplace"),
        ),
      ),
    ),
  );
}

async function hostFramePage(page: import("@playwright/test").Page) {
  const { readFile } = await import("node:fs/promises");
  const [componentStyles, themeStyles] = await Promise.all([
    readFile(new URL("../../styles.css", import.meta.url), "utf8"),
    readFile(new URL("../../theme/styles.css", import.meta.url), "utf8"),
  ]);
  await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${themeStyles}${componentStyles}</style></head><body style="margin:0">${hostFrameMarkup()}</body></html>`);
}

function hostDrawerGeometry(page: import("@playwright/test").Page) {
  return page.evaluate(async () => {
    const drawer = document.querySelector<HTMLElement>("[data-cc-navigation-drawer]")!;
    const scrim = document.querySelector<HTMLElement>("[data-cc-navigation-scrim]")!;
    await Promise.all(drawer.getAnimations().map((animation) => animation.finished));
    const iframe = document.querySelector("iframe")!.getBoundingClientRect();
    const drawerRect = drawer.getBoundingClientRect();
    const scrimRect = scrim.getBoundingClientRect();
    const over = (x: number, y: number) => document.elementFromPoint(x, y);
    return {
      drawer: { height: drawerRect.height, left: drawerRect.left, top: drawerRect.top, width: drawerRect.width },
      iframe: { left: iframe.left, top: iframe.top, width: iframe.width },
      scrim: { height: scrimRect.height, left: scrimRect.left, top: scrimRect.top, width: scrimRect.width },
      // What a pointer press reaches: the drawer at its own area, the scrim everywhere else,
      // and never the embedded site or the host top bar while the drawer is open.
      overDrawer: drawer.contains(over(drawerRect.left + 8, drawerRect.height / 2)),
      overSite: over(window.innerWidth - 8, window.innerHeight / 2) === scrim,
      overTopBar: over(window.innerWidth - 8, 8) === scrim,
      scrollWidth: document.documentElement.scrollWidth,
      viewport: { height: window.innerHeight, width: window.innerWidth },
    };
  });
}

test.describe("host navigation drawer around an embedded site on a wide screen", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("opens over the full-width site from the host top bar", async ({ page }) => {
    await hostFramePage(page);

    await expect(page.getByRole("dialog", { name: "Host navigation" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Foundry" })).toBeVisible();
    const geometry = await hostDrawerGeometry(page);

    // The site spans the viewport: the host keeps no sidebar column beside it.
    expect(geometry.iframe.left).toBe(0);
    expect(geometry.iframe.width).toBe(1280);
    expect(geometry.iframe.top).toBe(56);
    expect(geometry.drawer).toEqual({ height: 800, left: 0, top: 0, width: 320 });
    expect(geometry.scrim).toEqual({ height: 800, left: 0, top: 0, width: 1280 });
    expect(geometry.overDrawer).toBe(true);
    expect(geometry.overSite).toBe(true);
    expect(geometry.overTopBar).toBe(true);
    expect(geometry.scrollWidth).toBe(1280);
  });

  test("takes the width the host publishes", async ({ page }) => {
    await hostFramePage(page);
    await page.addStyleTag({ content: ":root { --application-navigation-drawer-width: 24rem; }" });

    expect((await hostDrawerGeometry(page)).drawer.width).toBe(384);
  });
});

test.describe("host navigation drawer on a touch phone", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 375, height: 812 } });

  test("leaves a strip of scrim to dismiss from", async ({ page }) => {
    await hostFramePage(page);

    const geometry = await hostDrawerGeometry(page);
    expect(geometry.drawer.left).toBe(0);
    expect(geometry.drawer.width).toBeLessThanOrEqual(geometry.viewport.width - 48);
    expect(geometry.drawer.height).toBe(geometry.viewport.height);
    expect(geometry.overSite).toBe(true);
    expect(geometry.scrollWidth).toBe(375);
  });
});
