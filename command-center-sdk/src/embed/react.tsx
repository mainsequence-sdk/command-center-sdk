import { useEffect, useRef, useState } from "react";

import { createIframeBridgeHost, type IframeBridgeHost } from "./host.js";
import type { ScopedCapabilityToken } from "./protocol.js";

export {
  STATIC_SITE_IFRAME_DEFAULT_SANDBOX,
  StaticSiteIframe,
  type StaticSiteIframeProps,
} from "./static-site-react.js";

export interface SandboxedIframeWidgetProps {
  instanceId: string;
  src: string;
  allowedOrigin: string;
  props: Record<string, unknown>;
  inputs?: Record<string, unknown>;
  theme?: Record<string, string>;
  locale?: string;
  capabilityTokens?: ScopedCapabilityToken[];
  title?: string;
  className?: string;
  onOutputs?: (outputs: Record<string, unknown>) => void;
  onUserState?: (state: Record<string, unknown>) => void;
  onError?: (message: string) => void;
  onRequestedSize?: (size: { width?: number; height?: number }) => void;
}

export function SandboxedIframeWidget({
  instanceId,
  src,
  allowedOrigin,
  props,
  inputs = {},
  theme = {},
  locale = "en",
  capabilityTokens,
  title = "Embedded widget",
  className,
  onOutputs,
  onUserState,
  onError,
  onRequestedSize,
}: SandboxedIframeWidgetProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const bridgeRef = useRef<IframeBridgeHost | null>(null);
  const [generation, setGeneration] = useState(0);
  const latestRef = useRef({
    props,
    inputs,
    theme,
    locale,
    capabilityTokens,
    onOutputs,
    onUserState,
    onError,
    onRequestedSize,
  });
  latestRef.current = {
    props,
    inputs,
    theme,
    locale,
    capabilityTokens,
    onOutputs,
    onUserState,
    onError,
    onRequestedSize,
  };

  useEffect(() => {
    const iframe = iframeRef.current;
    const targetWindow = iframe?.contentWindow;
    if (!iframe || !targetWindow) return;
    const sourceOrigin = new URL(src, window.location.href).origin;
    if (sourceOrigin !== allowedOrigin) {
      latestRef.current.onError?.(
        `Embedded widget origin ${sourceOrigin} is not the approved origin ${allowedOrigin}.`,
      );
      return;
    }
    const bridge = createIframeBridgeHost({
      instanceId,
      targetOrigin: allowedOrigin,
      targetWindow,
      onProtocolError: (message) => latestRef.current.onError?.(message),
      onMessage: (message) => {
        if (message.type === "embed:outputs") latestRef.current.onOutputs?.(message.outputs);
        if (message.type === "embed:user-state") latestRef.current.onUserState?.(message.state);
        if (message.type === "embed:error") latestRef.current.onError?.(message.message);
        if (message.type === "embed:request-size") {
          latestRef.current.onRequestedSize?.({ width: message.width, height: message.height });
        }
      },
    });
    bridgeRef.current = bridge;
    const handleMessage = (event: MessageEvent) => {
      bridge.handleMessage(event);
    };
    window.addEventListener("message", handleMessage);
    const latest = latestRef.current;
    bridge.post({
      type: "host:init",
      props: latest.props,
      theme: latest.theme,
      locale: latest.locale,
      capabilityTokens: latest.capabilityTokens,
    });
    bridge.post({ type: "host:inputs", inputs: latest.inputs });
    return () => {
      // Do not send host:dispose here. React Strict Mode and prop changes replay effects while the
      // same embed document remains alive; an explicit dispose would permanently close its client.
      bridge.dispose();
      if (bridgeRef.current === bridge) bridgeRef.current = null;
      window.removeEventListener("message", handleMessage);
    };
  }, [allowedOrigin, generation, instanceId, src]);

  useEffect(() => {
    const bridge = bridgeRef.current;
    if (!bridge) return;
    bridge.post({ type: "host:init", props, theme, locale, capabilityTokens });
  }, [capabilityTokens, locale, props, theme]);

  useEffect(() => {
    bridgeRef.current?.post({ type: "host:inputs", inputs });
  }, [inputs]);

  return (
    <iframe
      ref={iframeRef}
      className={className}
      src={src}
      title={title}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      onLoad={() => setGeneration((value) => value + 1)}
    />
  );
}
