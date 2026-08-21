import { useEffect, useMemo, useRef } from "react";

import {
  createStaticSiteIframeHost,
  resolveStaticSiteIframeOrigin,
  type StaticSiteIframeContextInput,
  type StaticSiteIframeHost,
  type StaticSiteIframeReadyMessage,
  type StaticSiteIframeThemeMode,
  type ResolveStaticSiteFastApiCredential,
} from "./static-site.js";

export const STATIC_SITE_IFRAME_DEFAULT_SANDBOX =
  "allow-forms allow-same-origin allow-scripts" as const;

export interface StaticSiteIframeProps {
  src: string;
  themeId: string;
  themeMode: StaticSiteIframeThemeMode;
  userUid: string | null;
  resolveFastApiCredential?: ResolveStaticSiteFastApiCredential;
  allowedOrigin?: string;
  title?: string;
  className?: string;
  sandbox?: string;
  referrerPolicy?: React.HTMLAttributeReferrerPolicy;
  handshakeTimeoutMs?: number;
  credentialRequestTimeoutMs?: number;
  maxPayloadBytes?: number;
  onReady?: (message: StaticSiteIframeReadyMessage) => void;
  onProtocolError?: (message: string) => void;
}

export function StaticSiteIframe({
  src,
  themeId,
  themeMode,
  userUid,
  resolveFastApiCredential,
  allowedOrigin,
  title = "Static site",
  className,
  sandbox = STATIC_SITE_IFRAME_DEFAULT_SANDBOX,
  referrerPolicy = "no-referrer",
  handshakeTimeoutMs,
  credentialRequestTimeoutMs,
  maxPayloadBytes,
  onReady,
  onProtocolError,
}: StaticSiteIframeProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const hostRef = useRef<StaticSiteIframeHost | null>(null);
  const contextRef = useRef<StaticSiteIframeContextInput>({ themeId, themeMode, userUid });
  const callbacksRef = useRef({ onReady, onProtocolError });
  contextRef.current = { themeId, themeMode, userUid };
  callbacksRef.current = { onReady, onProtocolError };

  const targetOrigin = useMemo(
    () => resolveStaticSiteIframeOrigin(allowedOrigin ?? src),
    [allowedOrigin, src],
  );

  useEffect(() => {
    const iframe = iframeRef.current;
    const targetWindow = iframe?.contentWindow;
    if (!iframe || !targetWindow) return;

    const sourceOrigin = resolveStaticSiteIframeOrigin(src);
    if (sourceOrigin !== targetOrigin) {
      callbacksRef.current.onProtocolError?.(
        `Static-site iframe origin ${sourceOrigin} is not the approved origin ${targetOrigin}.`,
      );
      return;
    }

    const host = createStaticSiteIframeHost({
      targetOrigin,
      targetWindow,
      context: contextRef.current,
      resolveFastApiCredential,
      handshakeTimeoutMs,
      credentialRequestTimeoutMs,
      maxPayloadBytes,
      onReady: (message) => callbacksRef.current.onReady?.(message),
      onProtocolError: (message) => callbacksRef.current.onProtocolError?.(message),
    });
    hostRef.current = host;
    const handleMessage = (event: MessageEvent<unknown>) => {
      host.handleMessage(event);
    };
    window.addEventListener("message", handleMessage);

    return () => {
      host.dispose();
      if (hostRef.current === host) hostRef.current = null;
      window.removeEventListener("message", handleMessage);
    };
  }, [
    credentialRequestTimeoutMs,
    handshakeTimeoutMs,
    maxPayloadBytes,
    resolveFastApiCredential,
    src,
    targetOrigin,
  ]);

  useEffect(() => {
    hostRef.current?.updateContext({ themeId, themeMode, userUid });
  }, [themeId, themeMode, userUid]);

  return (
    <iframe
      ref={iframeRef}
      className={className}
      src={src}
      title={title}
      sandbox={sandbox}
      referrerPolicy={referrerPolicy}
    />
  );
}
