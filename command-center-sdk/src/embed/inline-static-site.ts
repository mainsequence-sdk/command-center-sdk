import {
  createStaticSiteIframeClient,
  resolveStaticSiteIframeOrigin,
  type StaticSiteIframeClientOptions,
} from "./static-site.js";

export interface InlineStaticSiteLaunch {
  launchId: string;
  launchUrl: string;
}

/** The application owns these operations and sends them through its trusted host. */
export interface InlineStaticSiteLaunchAdapter {
  launch(releaseUid: string, signal?: AbortSignal): Promise<InlineStaticSiteLaunch>;
  attach(launchId: string, frameIndex: number, signal?: AbortSignal): Promise<void>;
  close(launchId: string): Promise<void>;
}

/** Binds an empty, mounted iframe before allowing it to navigate to its private launch. */
export async function launchInlineStaticSiteIframe({
  iframe,
  releaseUid,
  adapter,
  signal,
}: {
  iframe: HTMLIFrameElement;
  releaseUid: string;
  adapter: InlineStaticSiteLaunchAdapter;
  signal?: AbortSignal;
}): Promise<() => Promise<void>> {
  if (!iframe.isConnected || iframe.hasAttribute("src") || iframe.hasAttribute("srcdoc")) {
    throw new Error("An inline Static Site requires an empty, mounted iframe.");
  }

  signal?.throwIfAborted();
  const { launchId, launchUrl } = await adapter.launch(releaseUid, signal);
  try {
    resolveStaticSiteIframeOrigin(launchUrl);
    signal?.throwIfAborted();
    const parent = iframe.ownerDocument.defaultView;
    const child = iframe.contentWindow;
    const frameIndex = parent && child
      ? Array.from(parent.frames).indexOf(child)
      : -1;
    if (frameIndex < 0 || iframe.hasAttribute("src") || iframe.hasAttribute("srcdoc")) {
      throw new Error("The inline Static Site iframe was detached or already navigated.");
    }

    await adapter.attach(launchId, frameIndex, signal);
    signal?.throwIfAborted();
    if (!iframe.isConnected || iframe.contentWindow !== child ||
      iframe.hasAttribute("src") || iframe.hasAttribute("srcdoc")) {
      throw new Error("The inline Static Site iframe was detached or already navigated.");
    }
    iframe.src = launchUrl;
  } catch (error) {
    await adapter.close(launchId).catch(() => undefined);
    throw error;
  }

  let closed = false;
  return async () => {
    if (closed) return;
    closed = true;
    iframe.removeAttribute("src");
    await adapter.close(launchId);
  };
}

/** Connect a child exactly one level below the directly embedded parent site. */
export function createInlineStaticSiteIframeClient(
  childWindow: Window,
  options: Omit<StaticSiteIframeClientOptions, "parentWindow">,
) {
  const host = childWindow.top;
  const parent = childWindow.parent;
  if (!host || parent === childWindow || parent === host || parent.parent !== host) {
    throw new Error("An inline Static Site must be one iframe below a directly hosted site.");
  }
  return createStaticSiteIframeClient({ ...options, parentWindow: host });
}
