import {
  createStaticSiteIframeClient,
  createStaticSiteIframeHost,
  StaticSitePlatformRequestError,
  type SendStaticSitePlatformRequest,
  type StaticSitePlatformRequestErrorCode,
} from "../../src/embed/index.js";

// A host's sender: its own authenticated fetch, restricted to the paths it serves.
declare function authenticatedPlatformFetch(input: URL, init: RequestInit): Promise<Response>;
const servedPaths = ["/api/projects/"];

const sendPlatformRequest: SendStaticSitePlatformRequest = async (request, { signal, userUid }) => {
  const [pathname = ""] = request.path.split("?");
  if (!servedPaths.some((prefix) => pathname.startsWith(prefix))) {
    throw new StaticSitePlatformRequestError("not_allowed");
  }
  void userUid;
  return authenticatedPlatformFetch(new URL(request.path, "https://platform.example.com"), {
    method: request.method,
    headers: request.headers,
    body: request.body,
    signal,
  });
};

const childWindow = window.open("https://site.example.com")!;
const host = createStaticSiteIframeHost({
  targetOrigin: "https://site.example.com",
  targetWindow: childWindow,
  context: { themeId: "graphite", themeMode: "dark", userUid: "user-1" },
  sendPlatformRequest,
  platformRequestTimeoutMs: 60_000,
});
host.updatePlatformRequestSender(sendPlatformRequest);
host.updatePlatformRequestSender(undefined);

const client = createStaticSiteIframeClient({
  channel: "mainsequence.type-consumer",
  hostOrigin: "https://command-center.example.com",
  parentWindow: window.parent,
  platformRequestTimeoutMs: 65_000,
  onContext() {},
});
// A fetch-shaped function for code that takes one.
const platformFetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
  client.sendPlatformRequest(new Request(input, init));
const response: Response = await platformFetch("/api/projects/?limit=20", {
  headers: { accept: "application/json" },
});
void response;

try {
  await client.sendPlatformRequest(new Request("/api/projects/", { method: "POST", body: "{}" }));
} catch (error) {
  if (error instanceof StaticSitePlatformRequestError) {
    const code: StaticSitePlatformRequestErrorCode = error.code;
    void code;
  }
}
