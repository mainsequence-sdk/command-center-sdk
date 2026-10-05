import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import type { ChatBackendConnection } from "../backend/connection.js";
import {
  fetchModelProviderCatalog,
  projectModelProviderCatalogToRunConfigOptions,
  type AvailableChatRunConfigOptions,
  type ModelProviderCatalog,
} from "../backend/model-catalog-api.js";

// The platform's model catalog, read once per person and shared by everything on the page that
// shows it: every model picker (as provider, model, and thinking options) and the model provider
// settings. An entry is trusted for five minutes and dropped whenever the catalog changes (a
// provider signed in or out, a custom provider edited), so everything reads it again.
export const RUN_CONFIG_OPTIONS_STALE_MS = 300_000;
const RETRY_DELAYS_MS = [1_000, 2_000];

interface CatalogEntry {
  data: ModelProviderCatalog | null;
  error: Error | null;
  fetchedAt: number;
  loading: boolean;
}

const entries = new Map<string, CatalogEntry>();
const inFlight = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version += 1;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getVersion() {
  return version;
}

/** Drops every cached catalog, so every mounted picker and settings screen reads it again. */
export function invalidateModelProviderCatalog() {
  entries.clear();
  inFlight.clear();
  emit();
}

function isFresh(entry: CatalogEntry | undefined) {
  return Boolean(entry?.data) && Date.now() - (entry?.fetchedAt ?? 0) < RUN_CONFIG_OPTIONS_STALE_MS;
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function load({
  connection,
  force,
  token,
  tokenType,
  userUid,
  organizationEnvironmentUid,
}: {
  connection: ChatBackendConnection;
  force: boolean;
  token: string | null;
  tokenType: string;
  userUid: string;
  organizationEnvironmentUid?: string | null;
}) {
  const key = JSON.stringify([connection.apiBaseUrl, userUid, organizationEnvironmentUid ?? null]);
  const current = entries.get(key);
  if (!force && isFresh(current)) {
    return;
  }
  if (inFlight.has(key)) {
    return;
  }
  entries.set(key, {
    data: current?.data ?? null,
    error: null,
    fetchedAt: current?.fetchedAt ?? 0,
    loading: true,
  });
  emit();

  let request!: Promise<void>;
  request = (async () => {
    let lastError: unknown = null;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
      if (attempt > 0) {
        await wait(RETRY_DELAYS_MS[attempt - 1]);
      }
      try {
        const data = await fetchModelProviderCatalog({
          connection,
          createdByUserUid: userUid,
          organizationEnvironmentUid,
          token,
          tokenType,
        });
        if (inFlight.get(key) === request) {
          entries.set(key, { data, error: null, fetchedAt: Date.now(), loading: false });
        }
        return;
      } catch (error) {
        lastError = error;
      }
    }
    if (inFlight.get(key) === request) {
      const previous = entries.get(key);
      entries.set(key, {
        data: previous?.data ?? null,
        error: lastError instanceof Error ? lastError : new Error("Available models request failed."),
        fetchedAt: previous?.fetchedAt ?? 0,
        loading: false,
      });
    }
  })().finally(() => {
    if (inFlight.get(key) === request) {
      inFlight.delete(key);
    }
    emit();
  });
  inFlight.set(key, request);
}

/** The platform's model catalog for the person, from the shared store. */
export function useModelProviderCatalog({
  connection,
  enabled,
  token,
  tokenType = "Bearer",
  userUid,
  organizationEnvironmentUid,
}: {
  connection: ChatBackendConnection;
  enabled: boolean;
  token: string | null;
  tokenType?: string;
  userUid: string | null;
  organizationEnvironmentUid?: string | null;
}) {
  const catalogVersion = useSyncExternalStore(subscribe, getVersion, getVersion);
  const [refetchNonce, setRefetchNonce] = useState(0);
  const canRequest = Boolean(token) || Boolean(connection.sendPlatformRequest);
  const key = enabled && canRequest && userUid ? JSON.stringify([connection.apiBaseUrl, userUid, organizationEnvironmentUid ?? null]) : null;

  useEffect(() => {
    if (!key) {
      return;
    }
    load({ connection, force: false, token, tokenType, userUid: userUid!, organizationEnvironmentUid });
  }, [catalogVersion, connection, key, token, tokenType, userUid, organizationEnvironmentUid]);

  useEffect(() => {
    if (!key || refetchNonce === 0) {
      return;
    }
    load({ connection, force: true, token, tokenType, userUid: userUid!, organizationEnvironmentUid });
  }, [connection, key, refetchNonce, token, tokenType, userUid, organizationEnvironmentUid]);

  const refetch = useCallback(() => {
    setRefetchNonce((nonce) => nonce + 1);
  }, []);

  const entry = key ? entries.get(key) : undefined;
  return {
    data: entry?.data ?? undefined,
    error: entry?.error ?? null,
    isLoading: Boolean(key) && !entry?.data && (entry?.loading ?? true),
    refetch,
  };
}

/** The provider, model, and thinking options every model picker offers, from the same catalog. */
export function useRunConfigOptions(options: Parameters<typeof useModelProviderCatalog>[0]) {
  const catalog = useModelProviderCatalog(options);
  const data = useMemo<AvailableChatRunConfigOptions | undefined>(
    () => (catalog.data ? projectModelProviderCatalogToRunConfigOptions(catalog.data) : undefined),
    [catalog.data],
  );
  return { ...catalog, data };
}
