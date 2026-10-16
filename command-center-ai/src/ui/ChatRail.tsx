import { useId, useRef, type CSSProperties, type ReactNode } from "react";

import { Expand, Sparkles, X } from "lucide-react";
import { Button } from "@dev-mainsequence/command-center-sdk/controls";

import { useOptionalChatEngine } from "../engine/ChatEngineProvider.js";
import { AgentIcon } from "./AgentIcon.js";
import { cx } from "./class-names.js";
import { useChatRailResize } from "./useChatRailResize.js";

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
   * `docked` occupies a column of the application's layout, so the page narrows beside it.
   * `overlay` floats over the page at the right edge. Both resize from their left edge.
   */
  mode?: "docked" | "overlay";
  /** Show the draggable, keyboard-accessible left edge. Default true. */
  resizable?: boolean;
  /** Controlled width in pixels. Pair with onWidthChange and the host's docked grid column. */
  width?: number;
  /** Initial uncontrolled width in pixels. Default 540. */
  defaultWidth?: number;
  /** Minimum resize width in pixels. Default 360; a smaller viewport takes precedence. */
  minWidth?: number;
  /** Maximum resize width in pixels. Default 900; the viewport and right offset also limit it. */
  maxWidth?: number;
  /** Receives the requested width on drag, keyboard resize, or double-click reset. No persistence. */
  onWidthChange?: (width: number) => void;
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
 * Command Center's right rail: a resizable panel, initially 540px, with the theme's gradient and glow, a header with the
 * Agent's icon, the assistant's name, Expand, and Close, and a body that scrolls its content. Put
 * `ChatThread surface="overlay"` inside it, under the application's `ChatEngineProvider`.
 */
export function ChatRail({
  "aria-label": ariaLabel,
  agentUid,
  children,
  className,
  defaultWidth = 540,
  detail,
  icon,
  maxWidth = 900,
  minWidth = 360,
  mode = "docked",
  onClose,
  onExpand,
  onWidthChange,
  resizable = true,
  restoreDefaultSessionOnClose = true,
  rightOffset,
  subtitle,
  title,
  tone = "primary",
  width,
}: ChatRailProps) {
  const engine = useOptionalChatEngine();
  const railAgentUid = agentUid === undefined ? (engine?.activeAgentUid ?? null) : agentUid;
  const overlay = mode === "overlay";
  const railRef = useRef<HTMLElement>(null);
  const railId = useId();
  const resize = useChatRailResize(railRef, { defaultWidth, maxWidth, minWidth, mode, onWidthChange, resizable, rightOffset, width });
  const style: CSSProperties = {
    ...(overlay && rightOffset !== undefined ? { right: rightOffset } : {}),
    ...(resizable || width !== undefined ? { width: resize.railWidth, flexShrink: 0 } : {}),
    maxWidth: overlay && rightOffset !== undefined
      ? `max(0px, calc(100vw - 10px - ${typeof rightOffset === "number" ? `${rightOffset}px` : rightOffset}))`
      : "calc(100vw - 10px)",
  };

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
        resize.resizing && "ms-chat-rail--resizing",
        overlay && "ms-chat-rail--overlay",
        tone === "accent" && "ms-chat-rail--accent",
        className,
      )}
      data-chat-rail={mode}
      id={railId}
      ref={railRef}
      style={style}
    >
      {resizable ? (
        <div
          aria-controls={railId}
          aria-label="Resize chat rail"
          aria-orientation="vertical"
          aria-valuemax={resize.maximum}
          aria-valuemin={resize.minimum}
          aria-valuenow={resize.measuredWidth}
          aria-valuetext={`${resize.measuredWidth} pixels`}
          className="ms-chat-rail__resize-handle"
          role="separator"
          tabIndex={0}
          title="Drag to resize. Use arrow keys, or double-click to reset."
          {...resize.handleProps}
        />
      ) : null}
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
              motion="animate"
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
