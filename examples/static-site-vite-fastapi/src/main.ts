import { createStaticSiteIframeClient } from "@dev-mainsequence/command-center-sdk/embed";

import {
  createHostedApiTransport,
  createLocalApiTransport,
  parseHostedApiReleases,
} from "./transport";

const result = document.querySelector<HTMLParagraphElement>("#result") ??
  (() => { throw new Error("Missing result element"); })();

async function run(): Promise<void> {
  const mode = import.meta.env.VITE_API_TRANSPORT ?? "local";
  let getIdentity: () => Promise<Response>;

  if (mode === "local") {
    const transport = createLocalApiTransport();
    getIdentity = () => transport.get("/api/me");
  } else if (mode === "hosted") {
    const hostOrigin = import.meta.env.VITE_HOST_ORIGIN;
    if (!hostOrigin || window.parent === window) {
      throw new Error("Hosted transport needs a trusted iframe host and public routing values");
    }
    const releases = parseHostedApiReleases(import.meta.env.VITE_FASTAPI_RELEASES);
    let contextReady!: () => void;
    const ready = new Promise<void>((resolve) => { contextReady = resolve; });
    const client = createStaticSiteIframeClient({
      channel: "mainsequence.local-api-example",
      hostOrigin,
      parentWindow: window.parent,
      onContext() { contextReady(); },
    });
    const onMessage = (event: MessageEvent<unknown>) => client.handleMessage(event);
    window.addEventListener("message", onMessage);
    client.announceReady();
    let timer = 0;
    try {
      await Promise.race([
        ready,
        new Promise<void>((_, reject) => {
          timer = window.setTimeout(() => reject(new Error("Trusted host handshake unavailable")), 10_000);
        }),
      ]);
    } catch (error) {
      window.removeEventListener("message", onMessage);
      client.dispose();
      throw error;
    } finally {
      window.clearTimeout(timer);
    }
    const transport = createHostedApiTransport({ client, releases });
    getIdentity = () => transport.get("identity", "/api/me");
  } else {
    throw new Error(`Unknown API transport: ${mode}`);
  }

  const response = await getIdentity();
  if (response.status === 503 && mode === "local") {
    result.textContent = "Local identity unavailable. Run mainsequence login and retry.";
  } else if (!response.ok) {
    result.textContent = `API request failed (${response.status}).`;
  } else {
    const user = (await response.json()) as { uid: string; username: string | null };
    result.textContent = `${mode === "local" ? "Signed-in developer" : "Signed-in user"}: ${user.username ?? user.uid}`;
  }
}

try {
  await run();
} catch (error) {
  result.textContent = error instanceof Error ? error.message : "API request failed.";
}
