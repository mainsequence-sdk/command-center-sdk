import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  fetchCommandCenterAgentIcons,
  type CommandCenterAgentIcon,
} from "../backend/command-center-agent-icons-api.js";
import type { ChatBackendConnection } from "../backend/connection.js";
import {
  clearAgentIconCache,
  ensureAgentIcon,
  getAgentIconCacheEntry,
  subscribeAgentIconCache,
} from "./agent-icon-cache.js";

export type AgentIconLookup = (agentUid: string | null | undefined) => CommandCenterAgentIcon | null;

/** What an icon request needs: the platform connection and the person's token. */
export interface AgentIconAuth {
  connection: ChatBackendConnection;
  token: string | null;
  tokenType?: string;
}

const noIcon: AgentIconLookup = () => null;

/** Without a provider every agent falls back to its built-in icon. */
export const AgentIconsContext = createContext<AgentIconLookup>(noIcon);
/** Without a provider no icon is requested. */
export const AgentIconAuthContext = createContext<AgentIconAuth | null>(null);

export function useAgentIconLookup() {
  return useContext(AgentIconsContext);
}

export function useAgentIconAuth() {
  return useContext(AgentIconAuthContext);
}

export const AGENT_ICONS_STALE_MS = 5 * 60_000;

type AgentIconProjection = ReadonlyMap<string, CommandCenterAgentIcon>;

// One projection per Organization Environment, shared by every provider on the page and trusted
// for AGENT_ICONS_STALE_MS, so remounting the chat does not refetch it.
const projectionCache = new Map<string, { icons: AgentIconProjection; fetchedAt: number }>();

function readFreshProjection(environmentUid: string | null) {
  if (!environmentUid) {
    return null;
  }
  const cached = projectionCache.get(environmentUid);
  return cached && Date.now() - cached.fetchedAt < AGENT_ICONS_STALE_MS ? cached.icons : null;
}

export function clearAgentIconProjections() {
  projectionCache.clear();
}

/**
 * One projection per Organization Environment (ADR 090). Mounted by the chat engine so every
 * surface that draws an agent shares the same lookup.
 */
export function AgentIconsProvider({
  children,
  connection,
  enabled,
  environmentUid,
  token,
  tokenType = "Bearer",
}: {
  children: ReactNode;
  connection: ChatBackendConnection;
  /**
   * Whether the person can reach the platform. Defaults to having a token or the application's
   * sender on the connection; the engine passes whether someone is signed in.
   */
  enabled?: boolean;
  environmentUid: string | null;
  token: string | null;
  tokenType?: string;
}) {
  const canRequest = enabled ?? (Boolean(token) || Boolean(connection.sendPlatformRequest));
  const [icons, setIcons] = useState<AgentIconProjection | null>(() =>
    canRequest ? readFreshProjection(environmentUid) : null,
  );

  useEffect(() => {
    if (!canRequest || !environmentUid) {
      setIcons(null);
      return;
    }

    const fresh = readFreshProjection(environmentUid);
    if (fresh) {
      setIcons(fresh);
      return;
    }

    const controller = new AbortController();
    const load = async (attempt: number): Promise<void> => {
      try {
        const projection = await fetchCommandCenterAgentIcons({
          connection,
          environmentUid,
          signal: controller.signal,
          token,
          tokenType,
        });
        projectionCache.set(environmentUid, { icons: projection, fetchedAt: Date.now() });
        if (!controller.signal.aborted) {
          setIcons(projection);
        }
      } catch {
        // One retry; after that every agent keeps its built-in icon.
        if (!controller.signal.aborted && attempt === 0) {
          await load(1);
        }
      }
    };
    void load(0);

    return () => {
      controller.abort();
    };
  }, [canRequest, connection, environmentUid, token, tokenType]);

  useEffect(() => {
    if (!canRequest) {
      clearAgentIconCache();
      clearAgentIconProjections();
    }
  }, [canRequest]);

  const lookup = useCallback<AgentIconLookup>(
    (agentUid) => {
      const key = agentUid?.trim();
      return key && icons ? icons.get(key) ?? null : null;
    },
    [icons],
  );
  const auth = useMemo<AgentIconAuth>(
    () => ({ connection, token, tokenType }),
    [connection, token, tokenType],
  );

  return (
    <AgentIconAuthContext.Provider value={auth}>
      <AgentIconsContext.Provider value={lookup}>{children}</AgentIconsContext.Provider>
    </AgentIconAuthContext.Provider>
  );
}

const noEntry = () => undefined;

/** The object URL for an icon, or null while it loads, without auth, or after it failed. */
export function useAgentIconObjectUrl(url: string | null | undefined, auth: AgentIconAuth | null) {
  const entry = useSyncExternalStore(
    subscribeAgentIconCache,
    () => getAgentIconCacheEntry(url),
    noEntry,
  );
  const connection = auth?.connection ?? null;
  const token = auth?.token ?? null;
  const tokenType = auth?.tokenType ?? "Bearer";
  useEffect(() => {
    if (url && connection) {
      ensureAgentIcon({ connection, url, token, tokenType });
    }
  }, [connection, token, tokenType, url]);
  return entry?.status === "ready" ? entry.objectUrl : null;
}
