import type { ReactNode } from "react";
import { useCommandCenterViewport } from "@dev-mainsequence/command-center-sdk/layout";

import {
  useAgentIconAuth,
  useAgentIconImage,
  useAgentIconLookup,
} from "../engine/agent-icons-context.js";
import { cx } from "./class-names.js";

/**
 * An agent's custom icon wherever an agent is drawn (ADR 090). `mask` icons
 * take the surrounding text colour, so they follow the theme and the avatar
 * variant; `color` icons are images and are never tinted. While loading, when
 * the agent has no icon, or after a failure, `fallback` (the built-in icon)
 * is rendered, so nothing flickers and nothing is missing.
 *
 * It reads the icon projection and the credentials from the chat engine's icon
 * provider, so it draws the built-in icon outside the engine.
 *
 * An animated `color` icon shows its frame 0 still unless `motion="animate"`, which only the
 * large single places pass (the rail header, the connecting stage, the agent that is working),
 * and always shows the still when the person asks for reduced motion. `imageRendering:
 * "pixelated"` keeps pixel art sharp when it is scaled.
 */
export function AgentIcon({
  agentUid,
  className,
  fallback,
  motion = "still",
}: {
  agentUid?: string | null;
  className?: string;
  fallback: ReactNode;
  motion?: "still" | "animate";
}) {
  const lookup = useAgentIconLookup();
  const icon = lookup(agentUid);
  const auth = useAgentIconAuth();
  const { objectUrl, stillObjectUrl } = useAgentIconImage(icon?.url ?? null, auth);
  const { reducedMotion } = useCommandCenterViewport();
  if (!icon || !objectUrl) {
    return <>{fallback}</>;
  }
  if (icon.rendering === "mask") {
    return (
      <span
        aria-hidden="true"
        className={cx("ms-chat-agent-icon", className)}
        data-agent-icon="mask"
        style={{
          WebkitMaskImage: `url("${objectUrl}")`,
          WebkitMaskPosition: "center",
          WebkitMaskRepeat: "no-repeat",
          WebkitMaskSize: "contain",
          backgroundColor: "currentColor",
          maskImage: `url("${objectUrl}")`,
          maskPosition: "center",
          maskRepeat: "no-repeat",
          maskSize: "contain",
        }}
      />
    );
  }
  const animates = motion === "animate" && !reducedMotion;
  return (
    <img
      alt=""
      aria-hidden="true"
      className={cx("ms-chat-agent-icon ms-chat-agent-icon--image", className)}
      data-agent-icon="color"
      data-agent-icon-motion={stillObjectUrl ? (animates ? "animated" : "still") : undefined}
      draggable={false}
      src={stillObjectUrl && !animates ? stillObjectUrl : objectUrl}
      style={icon.imageRendering === "pixelated" ? { imageRendering: "pixelated" } : undefined}
    />
  );
}
