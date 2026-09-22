import type { createStaticSiteIframeClient } from "@dev-mainsequence/command-center-sdk/embed";

type EmbedClient = Pick<ReturnType<typeof createStaticSiteIframeClient>, "fetchFastApi">;

type TransportOptions =
  | { mode: "local" }
  | { mode: "hosted"; client: EmbedClient; resourceReleaseUid: string };

export function createApiTransport(options: TransportOptions) {
  return {
    get(path: `/api/${string}`, signal?: AbortSignal): Promise<Response> {
      if (options.mode === "local") {
        return fetch(path, { method: "GET", signal });
      }
      return options.client.fetchFastApi(
        { resourceReleaseUid: options.resourceReleaseUid, path },
        { method: "GET", signal },
      );
    },
  };
}
