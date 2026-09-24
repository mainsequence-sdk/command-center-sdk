import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ChevronDown, ExternalLink, Loader2 } from "lucide-react";
import { Badge, Button } from "@dev-mainsequence/command-center-sdk/controls";

import type { ChatBackendConnection } from "../backend/connection.js";
import type { ModelCatalogItem, ModelProviderCatalogProvider } from "../backend/model-catalog-api.js";
import {
  cancelModelProviderSignIn,
  fetchModelProviderSignInAttempt,
  ModelProviderApiError,
  signOffModelProvider,
  startModelProviderSignIn,
  type SignInAttempt,
} from "../backend/model-provider-auth-api.js";
import { invalidateModelProviderCatalog, useModelProviderCatalog } from "../engine/run-config-options.js";
import type { ChatAuth, ChatNotify } from "../engine/types.js";
import { cx } from "../ui/class-names.js";
import { Dialog } from "../ui/Dialog.js";
import { CustomModelProviderSettings } from "./CustomModelProviderSettings.js";
import { getProviderAuthenticationLabel } from "./model-provider-auth-state.js";

function formatProviderLabel(provider: string) {
  return provider
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function isTerminalAttemptStatus(status: SignInAttempt["status"]) {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function getAttemptStateMessage(attempt: SignInAttempt) {
  switch (attempt.status) {
    case "pending":
      return "Starting sign-in...";
    case "awaiting_browser":
      return "Open the sign-in page and complete login in your browser.";
    case "awaiting_manual_input":
      return "The provider is waiting for authentication to continue.";
    case "running":
      return "The platform received the provider response and is finishing sign-in.";
    case "completed":
      return "Provider is signed in.";
    case "cancelled":
      return "Sign-in cancelled.";
    case "failed":
      return attempt.error ?? "Provider sign-in failed.";
    default:
      return "Waiting for the provider sign-in flow to continue.";
  }
}

function ModelCatalogRow({
  model,
}: {
  model: ModelCatalogItem;
}) {
  const statusLabel = !model.selectable
    ? "Unavailable"
    : model.auth.required && !model.auth.authenticated
      ? "Sign in required to run"
      : "Authenticated";
  const statusVariant = !model.selectable
    ? "neutral"
    : model.auth.required && !model.auth.authenticated
      ? "warning"
      : "success";

  return (
    <div className="ms-chat-providers__model-row">
      <div className="ms-chat-providers__text">
        <div className="ms-chat-providers__model-label">{model.label}</div>
        <div className="ms-chat-providers__model-id">{model.model}</div>
      </div>
      <div className="ms-chat-providers__model-badges">
        <Badge variant={statusVariant}>{statusLabel}</Badge>
      </div>
    </div>
  );
}

function ProviderAuthCard({
  authState,
  models,
  onSignIn,
  onSignOff,
  pendingProvider,
}: {
  authState: ModelProviderCatalogProvider;
  models: ModelCatalogItem[];
  onSignIn: () => void;
  onSignOff: () => void;
  pendingProvider: string | null;
}) {
  const pending = pendingProvider === authState.provider;
  const [modelsOpen, setModelsOpen] = useState(false);
  const authKind = authState.authMethods.includes("oauth") ? "oauth" : "api_key";
  const selectableModelCount = models.filter((model) => model.selectable).length;

  return (
    <section className="ms-chat-providers__card">
      <div className="ms-chat-providers__card-header">
        <div className="ms-chat-providers__text">
          <div className="ms-chat-providers__card-title">
            {formatProviderLabel(authState.provider)}
          </div>
          <div className="ms-chat-providers__badges">
            <Badge variant={authState.authenticated ? "success" : "warning"}>
              {getProviderAuthenticationLabel(authState)}
            </Badge>
            <Badge variant="neutral">{authKind}</Badge>
            <Badge variant="neutral">Known: {models.length}</Badge>
            <Badge variant="neutral">Selectable: {selectableModelCount}</Badge>
            {!authState.authenticated && !authState.signInAvailable ? (
              <Badge variant="neutral">Sign in not available</Badge>
            ) : null}
          </div>
        </div>

        {authState.authenticated ? (
          <Button size="small" variant="outline" disabled={pending} onClick={onSignOff}>
            {pending ? <Loader2 className="ms-chat-icon-md ms-chat-spin" /> : null}
            Sign off
          </Button>
        ) : authState.signInAvailable ? (
          <Button variant="primary" size="small" disabled={pending} onClick={onSignIn}>
            {pending ? <Loader2 className="ms-chat-icon-md ms-chat-spin" /> : null}
            Sign in
          </Button>
        ) : null}
      </div>

      <div className="ms-chat-providers__models">
        <button
          type="button"
          className="ms-chat-providers__models-toggle"
          onClick={() => {
            setModelsOpen((current) => !current);
          }}
        >
          <span>
            Models
            <span className="ms-chat-providers__count">({models.length})</span>
          </span>
          <ChevronDown className={cx("ms-chat-providers__chevron", modelsOpen && "ms-chat-providers__chevron--open")} />
        </button>

        {modelsOpen ? (
          <div className="ms-chat-providers__model-list">
            {models.length > 0 ? (
              models.map((model) => (
                <ModelCatalogRow key={`${model.provider}:${model.model}`} model={model} />
              ))
            ) : (
              <div className="ms-chat-providers__models-empty">
                No models available for this provider.
              </div>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ProviderSignInModal({
  attempt,
  errorMessage,
  isCancelling,
  onCancel,
  onClose,
  onRetry,
}: {
  attempt: SignInAttempt;
  errorMessage: string | null;
  isCancelling: boolean;
  onCancel: () => void;
  onClose: () => void;
  onRetry: () => void;
}) {
  const providerLabel = formatProviderLabel(attempt.provider);
  const isTerminal = isTerminalAttemptStatus(attempt.status);
  const nextAction = attempt.nextAction;
  const stateMessage = getAttemptStateMessage(attempt);

  return (
    <Dialog
      open
      onClose={onClose}
      title={`${providerLabel} sign-in`}
      description="This flow is driven by the provider sign-in attempt state returned by the backend."
      className="ms-chat-providers__signin"
    >
      <div className="ms-chat-providers__signin-body">
        <div className="ms-chat-providers__signin-badges">
          <Badge variant={attempt.status === "completed" ? "success" : attempt.status === "failed" ? "danger" : "warning"}>
            {attempt.status}
          </Badge>
          <Badge variant="neutral">{attempt.authKind}</Badge>
        </div>

        <div className="ms-chat-providers__note">
          {stateMessage}
        </div>

        {nextAction.type === "open_url" ? (
          <div className="ms-chat-providers__signin-step">
            <div className="ms-chat-providers__heading">Open sign-in page</div>
            {nextAction.instructions ? (
              <div className="ms-chat-providers__instructions">{nextAction.instructions}</div>
            ) : null}
            {nextAction.userCode ? (
              <div className="ms-chat-providers__code-box">
                <div className="ms-chat-providers__hint">Device code</div>
                <div className="ms-chat-providers__device-code">
                  {nextAction.userCode}
                </div>
              </div>
            ) : null}
            <div className="ms-chat-providers__url">
              {nextAction.url}
            </div>
            <Button
              variant="primary"
              type="button"
              onClick={() => {
                window.open(nextAction.url, "_blank", "noopener,noreferrer");
              }}
            >
              <ExternalLink className="ms-chat-icon-md" />
              Open sign-in page
            </Button>
          </div>
        ) : null}

        {!isTerminal && nextAction.type === "none" ? (
          <div className="ms-chat-providers__waiting">
            <Loader2 className="ms-chat-icon-md ms-chat-spin" />
            Waiting for the provider sign-in flow to continue.
          </div>
        ) : null}

        {errorMessage ? (
          <div className="ms-chat-providers__error">
            {errorMessage}
          </div>
        ) : null}

        <div className="ms-chat-providers__signin-actions">
          {!isTerminal ? (
            <Button type="button" variant="outline" disabled={isCancelling} onClick={onCancel}>
              {isCancelling ? <Loader2 className="ms-chat-icon-md ms-chat-spin" /> : null}
              Cancel
            </Button>
          ) : null}
          {attempt.status === "failed" ? (
            <Button variant="primary" type="button" onClick={onRetry}>
              Retry
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

export interface ModelProviderSettingsProps {
  /** The connection to the platform. */
  connection: ChatBackendConnection;
  /** The person's token and user uid; credentials and custom providers are theirs. */
  auth: ChatAuth;
  /** Shows the person a short notice, for example as a toast. */
  notify?: ChatNotify;
}

// A sign-in attempt is read again every 1.5 s until it ends.
const ATTEMPT_POLL_MS = 1_500;
// A failed read is tried once more after a second before it counts as an error.
const RETRY_DELAY_MS = 1_000;

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/**
 * The model provider settings: the Organization's custom providers, and sign-in and sign-off for
 * the built-in providers, with the models the platform's catalog publishes for each. It reads the
 * same catalog store as the chat's model pickers, so a change here refreshes them too.
 */
export function ModelProviderSettings({ auth, connection, notify }: ModelProviderSettingsProps) {
  const sessionToken = auth.token;
  const sessionTokenType = auth.tokenType ?? "Bearer";
  const sessionUserUid = auth.userUid;
  const hasSessionUserUid = Boolean(sessionUserUid);
  const [activeAttempt, setActiveAttempt] = useState<SignInAttempt | null>(null);
  const [attemptError, setAttemptError] = useState<string | null>(null);
  const [pendingProvider, setPendingProvider] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  const catalogQuery = useModelProviderCatalog({
    connection,
    enabled: hasSessionUserUid,
    token: sessionToken,
    tokenType: sessionTokenType,
    userUid: sessionUserUid,
  });
  const catalogIsError = Boolean(catalogQuery.error);
  const refetchCatalog = catalogQuery.refetch;

  // The chat's model pickers read the same catalog, so they read it again too.
  const refresh = useCallback(async () => {
    invalidateModelProviderCatalog();
    await refetchCatalog();
  }, [refetchCatalog]);

  const requestBase = useMemo(
    () => ({ connection, createdByUserUid: sessionUserUid, token: sessionToken, tokenType: sessionTokenType }),
    [connection, sessionToken, sessionTokenType, sessionUserUid],
  );

  // Follow the active attempt until it ends. A new attempt starts a new loop; reading the same
  // attempt again keeps the loop going.
  const activeAttemptRef = useRef(activeAttempt);
  activeAttemptRef.current = activeAttempt;
  const attemptKey = hasSessionUserUid && activeAttempt ? `${activeAttempt.provider}:${activeAttempt.id}` : null;

  useEffect(() => {
    const attempt = activeAttemptRef.current;

    if (!attemptKey || !attempt) {
      return undefined;
    }

    const controller = new AbortController();

    void (async () => {
      while (!controller.signal.aborted) {
        let next: SignInAttempt | null = null;
        let failure: unknown = null;

        for (let tryIndex = 0; tryIndex < 2 && !next; tryIndex += 1) {
          if (tryIndex > 0) {
            await wait(RETRY_DELAY_MS, controller.signal);
          }
          if (controller.signal.aborted) {
            return;
          }
          try {
            next = await fetchModelProviderSignInAttempt({
              ...requestBase,
              provider: attempt.provider,
              attemptId: attempt.id,
              signal: controller.signal,
            });
          } catch (error) {
            failure = error;
          }
        }

        if (controller.signal.aborted) {
          return;
        }

        if (next) {
          setActiveAttempt(next);
          if (isTerminalAttemptStatus(next.status)) {
            return;
          }
        } else if (failure instanceof ModelProviderApiError) {
          if (failure.code === "signin_attempt_not_found" || failure.code === "signin_attempt_not_active") {
            setActiveAttempt(null);
            setAttemptError(null);
            void refresh();
            return;
          }
          setAttemptError(failure.message);
        }

        await wait(ATTEMPT_POLL_MS, controller.signal);
      }
    })();

    return () => {
      controller.abort();
    };
  }, [attemptKey, refresh, requestBase]);

  const startSignIn = async (provider: string) => {
    setPendingProvider(provider);
    try {
      if (!sessionUserUid) {
        throw new Error("Signed-in user uid is required for provider sign-in.");
      }

      const result = await startModelProviderSignIn({
        ...requestBase,
        createdByUserUid: sessionUserUid,
        provider,
      });
      setAttemptError(null);
      setActiveAttempt(result.attempt);
    } catch (error) {
      if (error instanceof ModelProviderApiError && error.code === "provider_signin_in_progress" && error.attempt) {
        setAttemptError(null);
        setActiveAttempt(error.attempt);
        return;
      }

      setAttemptError(error instanceof Error ? error.message : "Unable to start provider sign-in.");
    } finally {
      setPendingProvider(null);
    }
  };

  const signOff = async (provider: string) => {
    setPendingProvider(provider);
    try {
      if (!sessionUserUid) {
        throw new Error("Signed-in user uid is required for provider sign-off.");
      }

      await signOffModelProvider({
        ...requestBase,
        createdByUserUid: sessionUserUid,
        provider,
      });
      await refresh();
    } catch {
      // A failed sign-off leaves the provider as it was; the card still shows it signed in.
    } finally {
      setPendingProvider(null);
    }
  };

  const cancelAttempt = async () => {
    const attempt = activeAttempt;

    if (!attempt) {
      return;
    }

    setIsCancelling(true);
    try {
      if (!sessionUserUid) {
        throw new Error("Signed-in user uid is required for provider sign-in.");
      }

      await cancelModelProviderSignIn({
        ...requestBase,
        createdByUserUid: sessionUserUid,
        provider: attempt.provider,
        attemptId: attempt.id,
      });
      setActiveAttempt(null);
      setAttemptError(null);
      await refresh();
    } catch (error) {
      setAttemptError(error instanceof Error ? error.message : "Unable to cancel provider sign-in.");
    } finally {
      setIsCancelling(false);
    }
  };

  useEffect(() => {
    if (!activeAttempt) {
      return;
    }

    if (activeAttempt.status === "completed") {
      setActiveAttempt(null);
      setAttemptError(null);
      void refresh();
      return;
    }

    if (activeAttempt.status === "cancelled") {
      setActiveAttempt(null);
      setAttemptError(null);
      void refresh();
      return;
    }

    if (activeAttempt.status === "failed") {
      setAttemptError(activeAttempt.error ?? "Provider sign-in failed.");
    }
  }, [activeAttempt, refresh]);

  const modelsByProvider = useMemo(() => {
    return new Map(
      (catalogQuery.data?.providers ?? []).map((provider) => [
        provider.provider,
        provider.models,
      ]),
    );
  }, [catalogQuery.data]);

  const providerOrder = useMemo(() => {
    return (catalogQuery.data?.providers ?? [])
      .filter((provider) => provider.known)
      .map((provider) => provider.provider)
      .sort((left, right) => left.localeCompare(right));
  }, [catalogQuery.data]);

  const providerMap = useMemo(
    () =>
      new Map(
        (catalogQuery.data?.providers ?? []).map((entry) => [entry.provider, entry]),
      ),
    [catalogQuery.data],
  );

  return (
    <div className="ms-chat-providers">
      <div className="ms-chat-providers__intro">
        <div className="ms-chat-providers__heading">Model providers</div>
        <div className="ms-chat-providers__lead">
          Manage Organization custom providers and authentication for built-in providers. Every
          available model is published through the platform's model catalog, which every Agent
          uses.
        </div>
      </div>

      <CustomModelProviderSettings auth={auth} connection={connection} notify={notify} />

      {catalogQuery.isLoading ? (
        <div className="ms-chat-providers__loading">
          <Loader2 className="ms-chat-icon-md ms-chat-spin" />
          Loading provider authentication and the model catalog
        </div>
      ) : null}

      {!hasSessionUserUid ? (
        <div className="ms-chat-providers__error">
          Signed-in user uid is required before model provider credentials can be loaded.
        </div>
      ) : null}

      {catalogIsError ? (
        <div className="ms-chat-providers__error">
          {catalogQuery.error instanceof Error
            ? catalogQuery.error.message
            : "Unable to load the platform's model catalog."}
        </div>
      ) : null}

      {attemptError && !activeAttempt ? (
        <div className="ms-chat-providers__error">
          {attemptError}
        </div>
      ) : null}

      {!catalogQuery.isLoading &&
      hasSessionUserUid &&
      !catalogIsError &&
      providerOrder.length === 0 ? (
        <div className="ms-chat-providers__note">
          No model providers or models are available.
        </div>
      ) : null}

      {!catalogQuery.isLoading &&
      hasSessionUserUid &&
      !catalogIsError ? (
        <div className="ms-chat-providers__builtin">
          <div>
            <div className="ms-chat-providers__heading">Built-in providers</div>
            <div className="ms-chat-providers__lead">
              Sign in or sign off provider-backed models from the immutable built-in catalog.
            </div>
          </div>
          {providerOrder.map((provider) => {
            const models = modelsByProvider.get(provider) ?? [];
            const authState = providerMap.get(provider);

            if (!authState) {
              return null;
            }

            return (
              <ProviderAuthCard
                key={provider}
                authState={authState}
                models={models}
                pendingProvider={pendingProvider}
                onSignIn={() => {
                  setAttemptError(null);
                  void startSignIn(provider);
                }}
                onSignOff={() => {
                  setAttemptError(null);
                  void signOff(provider);
                }}
              />
            );
          })}
        </div>
      ) : null}

      {activeAttempt ? (
        <ProviderSignInModal
          attempt={activeAttempt}
          errorMessage={attemptError}
          isCancelling={isCancelling}
          onCancel={() => {
            if (isTerminalAttemptStatus(activeAttempt.status)) {
              setActiveAttempt(null);
              setAttemptError(null);
              void refresh();
              return;
            }

            void cancelAttempt();
          }}
          onClose={() => {
            if (!isTerminalAttemptStatus(activeAttempt.status)) {
              void cancelAttempt();
              return;
            }

            setActiveAttempt(null);
            setAttemptError(null);
          }}
          onRetry={() => {
            setAttemptError(null);
            void startSignIn(activeAttempt.provider);
          }}
        />
      ) : null}
    </div>
  );
}
