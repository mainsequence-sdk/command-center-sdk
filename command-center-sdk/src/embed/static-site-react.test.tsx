import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  STATIC_SITE_IFRAME_DEFAULT_SANDBOX,
  StaticSiteIframe,
} from "./static-site-react";

describe("StaticSiteIframe", () => {
  it("renders the reviewed default sandbox and referrer policy", () => {
    const markup = renderToStaticMarkup(
      <StaticSiteIframe
        src="https://site.example.com/.mainsequence/launch#token=one-use-token"
        themeId="main-sequence-space"
        themeMode="dark"
        userUid="user-1"
      />,
    );

    expect(markup).toContain(`sandbox="${STATIC_SITE_IFRAME_DEFAULT_SANDBOX}"`);
    expect(markup).toContain('referrerPolicy="no-referrer"');
    expect(markup).toContain('title="Static site"');
  });

  it("allows a host to narrow or expand iframe capabilities explicitly", () => {
    const markup = renderToStaticMarkup(
      <StaticSiteIframe
        src="https://site.example.com/app"
        themeId="quartz-light"
        themeMode="light"
        userUid={null}
        sandbox="allow-scripts"
        referrerPolicy="origin"
      />,
    );

    expect(markup).toContain('sandbox="allow-scripts"');
    expect(markup).toContain('referrerPolicy="origin"');
  });

  it("keeps the application resolver out of rendered iframe attributes", () => {
    const resolver = async () => ({
      resourceReleaseUid: "11111111-1111-4111-8111-111111111111",
      rpcUrl: "https://fastapi.example.com/",
      token: "delegated-token",
      expiresAt: "2099-08-18T12:05:00Z",
    });
    const markup = renderToStaticMarkup(
      <StaticSiteIframe
        src="https://site.example.com/app"
        themeId="quartz-light"
        themeMode="light"
        userUid="user-1"
        resolveFastApiCredential={resolver}
      />,
    );
    expect(markup).not.toContain("resolveFastApiCredential");
    expect(markup).not.toContain("delegated-token");
  });
});
