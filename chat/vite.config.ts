import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { loadEnv, type ProxyOptions } from "vite";
import { defineConfig } from "vitest/config";

import { platformProxyPrefix } from "./standalone/platform-proxy";

// The package's own configuration: the standalone application's dev server and build, and the
// package's tests. Nothing here comes from the Command Center application.
const packageRoot = path.dirname(fileURLToPath(import.meta.url));

function readProxyTarget(value: string | undefined) {
  const trimmed = value?.trim() ?? "";

  if (!trimmed) {
    return null;
  }

  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, packageRoot, "");
  // The standalone application's origin is not on the platform's allow-list, so the browser
  // calls the platform through this dev server. See `standalone/connection.ts`.
  const platformTarget = readProxyTarget(env.VITE_CHAT_API_BASE_URL);
  const proxy: Record<string, ProxyOptions> = platformTarget
    ? {
        [platformProxyPrefix]: {
          target: platformTarget,
          changeOrigin: true,
          secure: false,
          rewrite: (requestPath) => requestPath.replace(new RegExp(`^${platformProxyPrefix}`), ""),
        },
      }
    : {};

  return {
    root: packageRoot,
    envDir: packageRoot,
    plugins: [react()],
    server: {
      port: 5183,
      proxy,
    },
    // The standalone application's bundle; `dist/` holds the library build.
    build: {
      outDir: "standalone/dist",
      emptyOutDir: true,
    },
    test: {
      include: ["src/**/*.test.{ts,tsx}", "standalone/**/*.test.{ts,tsx}"],
    },
  };
});
