import type { createStaticSiteIframeClient } from "@dev-mainsequence/command-center-sdk/embed";

type EmbedClient = Pick<ReturnType<typeof createStaticSiteIframeClient>, "fetchFastApi">;

const CANONICAL_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

export function parseHostedApiReleases(value: string | undefined): ReadonlyMap<string, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value ?? "");
  } catch {
    throw new Error("Hosted API releases must be a JSON object of API names to release UIDs");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Hosted API releases must be a JSON object of API names to release UIDs");
  }

  const entries = Object.entries(parsed);
  if (entries.length === 0) {
    throw new Error("Hosted API releases must contain at least one API");
  }
  const releases = new Map<string, string>();
  for (const [name, uid] of entries) {
    if (!name.trim() || typeof uid !== "string" || !CANONICAL_UUID_PATTERN.test(uid)) {
      throw new Error(`Invalid release UID for API ${JSON.stringify(name)}`);
    }
    releases.set(name, uid);
  }
  return releases;
}

export function createLocalApiTransport() {
  return {
    get(path: `/api/${string}`, signal?: AbortSignal): Promise<Response> {
      return fetch(path, { method: "GET", signal });
    },
  };
}

export function createHostedApiTransport(options: {
  client: EmbedClient;
  releases: ReadonlyMap<string, string>;
}) {
  return {
    get(apiName: string, path: string, signal?: AbortSignal): Promise<Response> {
      const resourceReleaseUid = options.releases.get(apiName);
      if (!resourceReleaseUid) {
        throw new Error(`No FastAPI release configured for API ${JSON.stringify(apiName)}`);
      }
      return options.client.fetchFastApi(
        { resourceReleaseUid, path },
        { method: "GET", signal },
      );
    },
  };
}
