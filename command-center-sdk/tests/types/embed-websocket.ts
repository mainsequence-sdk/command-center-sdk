import {
  createStaticSiteIframeClient,
  createStaticSiteIframeHost,
  STATIC_SITE_FAST_API_WEBSOCKET_ACK_PROTOCOL,
  StaticSiteFastApiWebSocketError,
  type ResolveStaticSiteFastApiWebSocketTicket,
} from "../../src/embed/index.js";

const resolveFastApiWebSocketTicket: ResolveStaticSiteFastApiWebSocketTicket = async (
  { resourceReleaseUid, path },
) => ({
  resourceReleaseUid,
  origin: "https://site.example.com",
  path,
  websocketUrl: `wss://fastapi.example.com${path}`,
  subprotocol: `mainsequence.ws-ticket.${"a".repeat(32)}`,
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
});

const childWindow = window.open("https://site.example.com")!;
const host = createStaticSiteIframeHost({
  targetOrigin: "https://site.example.com",
  targetWindow: childWindow,
  context: { themeId: "graphite", themeMode: "dark", userUid: null },
  resolveFastApiWebSocketTicket,
});
host.updateFastApiWebSocketTicketResolver(resolveFastApiWebSocketTicket);

const client = createStaticSiteIframeClient({
  channel: "mainsequence.type-consumer",
  hostOrigin: "https://command-center.example.com",
  parentWindow: window.parent,
  onContext() {},
});
const socket = await client.createFastApiWebSocket({
  resourceReleaseUid: "11111111-1111-4111-8111-111111111111",
  path: "/ws/orders",
  protocols: ["orders.v2"],
});
if (socket.protocol === STATIC_SITE_FAST_API_WEBSOCKET_ACK_PROTOCOL) {
  socket.close();
}

const error = new StaticSiteFastApiWebSocketError("temporarily_unavailable");
const errorCode: string = error.code;
void errorCode;
