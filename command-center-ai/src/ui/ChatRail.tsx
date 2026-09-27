import type { CSSProperties, ReactNode } from "react";

import { Expand, Sparkles, X } from "lucide-react";
import { Button } from "@dev-mainsequence/command-center-sdk/controls";

import { useOptionalChatEngine } from "../engine/ChatEngineProvider.js";
import { AgentIcon } from "./AgentIcon.js";
import { cx } from "./class-names.js";

export interface ChatRailProps {
  /** The rail's content, usually `<ChatThread surface="overlay" />`. */
  children: ReactNode;
  /** The assistant's name, in the header. */
  title: string;
  /** One line under the title. */
  subtitle?: ReactNode;
  /** A pill under the subtitle, for example the session the rail shows. */
  detail?: ReactNode;
  /**
   * `docked` fills a column of the application's layout, so the page narrows beside it.
   * `overlay` floats over the page at the right edge, `min(540px, 100vw - 10px)` wide.
   */
  mode?: "docked" | "overlay";
  /** The colour of the Agent tile, the rail's edge, and its glow. */
  tone?: "primary" | "accent";
  /** The Agent drawn in the header tile. Defaults to the engine's active Agent. */
  agentUid?: string | null;
  /** Drawn in the tile while the Agent has no icon. Defaults to a sparkle. */
  icon?: ReactNode;
  /** Shows the Expand button, which opens the expanded rail. */
  onExpand?: () => void;
  onClose: () => void;
  /**
   * When the person had opened another Agent's session in the rail, closing returns the engine
   * to the default session first. Default true.
   */
  restoreDefaultSessionOnClose?: boolean;
  /** The overlay rail's distance from the right edge, for a column the application keeps there. */
  rightOffset?: number | string;
  "aria-label"?: string;
  className?: string;
}

/**
 * Command Center's right rail: a 540px panel with the theme's gradient and glow, a header with the
 * Agent's icon, the assistant's name, Expand, and Close, and a body that scrolls its content. Put
 * `ChatThread surface="overlay"` inside it, under the application's `ChatEngineProvider`.
 */
export function ChatRail({
  "aria-label": ariaLabel,
  agentUid,
  children,
  className,
  detail,
  icon,
  mode = "docked",
  onClose,
  onExpand,
  restoreDefaultSessionOnClose = true,
  rightOffset,
  subtitle,
  title,
  tone = "primary",
}: ChatRailProps) {
  const engine = useOptionalChatEngine();
  const railAgentUid = agentUid === undefined ? (engine?.activeAgentUid ?? null) : agentUid;
  const overlay = mode === "overlay";
  const style: CSSProperties | undefined =
    overlay && rightOffset !== undefined && rightOffset !== 0 ? { right: rightOffset } : undefined;

  function close() {
    if (restoreDefaultSessionOnClose && engine?.hasDirectLaunchSelection()) {
      engine.restoreDefaultSessionSelection();
    }
    onClose();
  }

  return (
    <section
      aria-label={ariaLabel ?? title}
      className={cx(
        "ms-chat-rail",
        overlay && "ms-chat-rail--overlay",
        tone === "accent" && "ms-chat-rail--accent",
        className,
      )}
      data-chat-rail={mode}
      style={style}
    >
      <div aria-hidden="true" className="ms-chat-rail__decor">
        <div className="ms-chat-rail__sheen" />
        <div className="ms-chat-rail__edge" />
        <div className="ms-chat-rail__glow ms-chat-rail__glow--top" />
        <div className="ms-chat-rail__glow ms-chat-rail__glow--middle" />
        <div className="ms-chat-rail__glow ms-chat-rail__glow--bottom" />
      </div>

      <header className="ms-chat-rail__header">
        <div className="ms-chat-rail__identity">
          <span className="ms-chat-rail__tile">
            <AgentIcon
              agentUid={railAgentUid}
              className="ms-chat-rail__tile-icon"
              fallback={icon ?? <Sparkles className="ms-chat-icon-lg" />}
            />
          </span>
          <div className="ms-chat-rail__heading">
            <div className="ms-chat-rail__title">{title}</div>
            {subtitle ? <div className="ms-chat-rail__subtitle">{subtitle}</div> : null}
            {detail ? (
              <div className="ms-chat-rail__detail">
                <span>{detail}</span>
              </div>
            ) : null}
          </div>
        </div>
        <div className="ms-chat-rail__actions">
          {onExpand ? (
            <Button onClick={onExpand} size="small">
              <Expand className="ms-chat-icon-sm" />
              Expand
            </Button>
          ) : null}
          <Button aria-label="Close chat rail" iconOnly onClick={close}>
            <X className="ms-chat-icon-md" />
          </Button>
        </div>
      </header>

      <div className="ms-chat-rail__body">{children}</div>
    </section>
  );
}

export interface ChatLauncherProps {
  /** The button's words, for example "Ask Sentinel". */
  label: string;
  onClick: () => void;
  /** The Agent whose icon leads the label. Defaults to the engine's active Agent. */
  agentUid?: string | null;
  /** Drawn while the Agent has no icon. Defaults to a sparkle. */
  icon?: ReactNode;
  className?: string;
}

/**
 * The floating button at the bottom right that opens the rail. Show it while neither the rail nor
 * the expanded rail is on screen. An application with a top bar may put a toggle there instead.
 */
export function ChatLauncher({ agentUid, className, icon, label, onClick }: ChatLauncherProps) {
  const engine = useOptionalChatEngine();
  const launcherAgentUid = agentUid === undefined ? (engine?.activeAgentUid ?? null) : agentUid;

  return (
    <Button className={cx("ms-chat-launcher", className)} onClick={onClick} variant="primary">
      <AgentIcon
        agentUid={launcherAgentUid}
        className="ms-chat-launcher__icon"
        fallback={icon ?? <Sparkles className="ms-chat-icon-md" />}
      />
      {label}
    </Button>
  );
}
