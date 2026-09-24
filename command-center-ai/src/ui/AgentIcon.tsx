import type { ReactNode } from "react";

import {
  useAgentIconAuth,
  useAgentIconLookup,
  useAgentIconObjectUrl,
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
 */
export function AgentIcon({
  agentUid,
  className,
  fallback,
}: {
  agentUid?: string | null;
  className?: string;
  fallback: ReactNode;
}) {
  const lookup = useAgentIconLookup();
  const icon = lookup(agentUid);
  const auth = useAgentIconAuth();
  const objectUrl = useAgentIconObjectUrl(icon?.url ?? null, auth);
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
  return (
    <img
      alt=""
      aria-hidden="true"
      className={cx("ms-chat-agent-icon ms-chat-agent-icon--image", className)}
      data-agent-icon="color"
      draggable={false}
      src={objectUrl}
    />
  );
}
