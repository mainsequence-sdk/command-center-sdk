import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import {
  applyThemePresetToRoot,
  commandCenterThemes,
  resolveCommandCenterThemeById,
} from "@dev-mainsequence/command-center-sdk/theme";

// The SDK's theme, its component styles, and its markdown styles, then the chat's stylesheet.
import "@dev-mainsequence/command-center-sdk/theme/styles.css";
import "@dev-mainsequence/command-center-sdk/styles.css";
import "@dev-mainsequence/command-center-sdk/theme/markdown.css";
import "../styles.css";
import "./standalone.css";

import { LocalStandaloneChat, StandaloneApp } from "./StandaloneApp";

const container = document.getElementById("root");

if (!container) {
  throw new Error("The standalone chat application needs a #root element.");
}

async function start(root: HTMLElement) {
  // The Main Sequence theme, or another preset named by `?theme=<id>`, as an application applies it.
  const search = new URLSearchParams(window.location.search);
  const theme =
    resolveCommandCenterThemeById(search.get("theme") ?? "main-sequence-space") ?? commandCenterThemes[0];
  if (theme) {
    applyThemePresetToRoot(document.documentElement, { theme });
  }

  // In development, `?stand-in` answers every platform and Agent runtime request from the scripted
  // stand-in the tests use, so the chat can be tried without a platform or a token.
  if (import.meta.env.DEV && search.has("stand-in")) {
    const { installStandIn } = await import("./stand-in");
    const standIn = installStandIn();
    // `?stand-in&local` also answers the local Agent's routes (ADR 099).
    if (search.has("local")) {
      const { createLocalRuntimeStandIn } = await import("./stand-in/local-runtime");
      window.fetch = createLocalRuntimeStandIn({
        chunkDelayMs: 40,
        passThrough: standIn.fetch,
      }).fetch;
    }
  }

  createRoot(root).render(
    <StrictMode>
      {search.has("local") ? <LocalStandaloneChat /> : <StandaloneApp />}
    </StrictMode>,
  );
}

void start(container);
