// The standalone application's address for the platform API, on its own origin. The dev server
// forwards it (see `vite.config.ts`) and the connection's URL rewrite points requests at it (see
// `connection.ts`).
export const platformProxyPrefix = "/__platform__";
