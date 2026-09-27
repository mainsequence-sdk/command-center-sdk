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

import { StandaloneApp } from "./StandaloneApp";

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
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("stand-in")) {
    const { installStandIn } = await import("./stand-in");
    installStandIn();
  }

  createRoot(root).render(
    <StrictMode>
      <StandaloneApp />
    </StrictMode>,
  );
}

void start(container);
