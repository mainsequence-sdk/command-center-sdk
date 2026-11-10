import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";

test("initial/live locale preserves child form, iframe, and cached authorization across origins", async ({ page }) => {
  const sdk = await readFile(new URL("../../dist/embed/static-site.js", import.meta.url), "utf8");
  const locale = await readFile(new URL("../../dist/localization/index.js", import.meta.url), "utf8");
  let childOrigin = "";
  let hostOrigin = "";
  let launches = 0;
  const child = createServer((request, response) => {
    response.setHeader("Content-Type", "text/javascript; charset=utf-8");
    if (request.url === "/sdk/static-site.js") return void response.end(sdk);
    if (request.url === "/localization/index.js") return void response.end(locale);
    launches++;
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(`<!doctype html><input aria-label="Unsaved draft"><output id="locale"></output><output id="requests">0</output><script type="module">
      import { createStaticSiteIframeClient } from '/sdk/static-site.js';
      const client = createStaticSiteIframeClient({ parentWindow: parent, hostOrigin: ${JSON.stringify(hostOrigin)}, channel: 'mainsequence.locale-test',
        fetcher: async () => new Response('ok'),
        async onContext(context) {
          document.documentElement.lang = context.locale;
          document.querySelector('#locale').textContent = context.locale;
          await client.fetchFastApi({ resourceReleaseUid: '11111111-1111-4111-8111-111111111111', path: '/api/data' });
          document.querySelector('#requests').textContent = String(Number(document.querySelector('#requests').textContent) + 1);
        }
      });
      addEventListener('message', event => client.handleMessage(event));
      client.announceReady();
    </script>`);
  });
  const host = createServer((request, response) => {
    response.setHeader("Content-Type", "text/javascript; charset=utf-8");
    if (request.url === "/sdk/static-site.js") return void response.end(sdk);
    if (request.url === "/localization/index.js") return void response.end(locale);
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(`<!doctype html><button id="change">English</button><iframe src="${childOrigin}/launch"></iframe><output id="authorizations">0</output><script type="module">
      import { createStaticSiteIframeHost } from '/sdk/static-site.js';
      const iframe = document.querySelector('iframe');
      const context = { themeId: 'graphite', themeMode: 'dark', userUid: 'person', locale: 'de' };
      const host = createStaticSiteIframeHost({ targetOrigin: ${JSON.stringify(childOrigin)}, targetWindow: iframe.contentWindow, context,
        async resolveFastApiCredential({ resourceReleaseUid }) {
          document.querySelector('#authorizations').textContent = String(Number(document.querySelector('#authorizations').textContent) + 1);
          return { resourceReleaseUid, rpcUrl: 'https://api.example.test', token: 'fixture-credential', expiresAt: '2099-01-01T00:00:00Z' };
        }
      });
      addEventListener('message', event => host.handleMessage(event));
      document.querySelector('#change').onclick = () => host.updateContext({ ...context, locale: 'en' });
    </script>`);
  });
  await new Promise<void>(resolve => child.listen(0, '127.0.0.1', resolve));
  childOrigin = `http://127.0.0.1:${(child.address() as AddressInfo).port}`;
  await new Promise<void>(resolve => host.listen(0, '127.0.0.1', resolve));
  hostOrigin = `http://127.0.0.1:${(host.address() as AddressInfo).port}`;
  try {
    await page.goto(hostOrigin);
    const frame = page.frameLocator('iframe');
    await expect(frame.locator('#locale')).toHaveText('de');
    await expect(frame.locator('#requests')).toHaveText('1');
    await frame.getByLabel('Unsaved draft').fill('Keep my unsaved work');
    const iframe = await page.locator('iframe').elementHandle();
    await page.getByRole('button', { name: 'English' }).click();
    await expect(frame.locator('#locale')).toHaveText('en');
    await expect(frame.locator('#requests')).toHaveText('2');
    await expect(frame.getByLabel('Unsaved draft')).toHaveValue('Keep my unsaved work');
    await expect(page.locator('#authorizations')).toHaveText('1');
    expect(await iframe?.evaluate(element => element.isConnected)).toBe(true);
    expect(launches).toBe(1);
  } finally {
    host.closeAllConnections(); child.closeAllConnections();
    await Promise.all([new Promise<void>(resolve => host.close(() => resolve())), new Promise<void>(resolve => child.close(() => resolve()))]);
  }
});
