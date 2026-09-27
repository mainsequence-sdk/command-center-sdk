import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
  Archive,
  ArchiveRestore,
  ArrowUpRight,
  Bot,
  ChevronDown,
  ChevronRight,
  Loader2,
  MessageSquare,
  Search,
  Sparkles,
} from "lucide-react";
import { Button, Input } from "@dev-mainsequence/command-center-sdk/controls";

import {
  fetchArchivedAgentSessions,
  searchAgentSessions,
} from "../backend/agent-sessions-api.js";
import {
  agentSessionMatchesNavigationQuery,
  getAgentSessionNavigationHandleLabel,
  getAgentSessionNavigationTitle,
  groupAgentSessions,
  UNNAMED_AGENT_LABEL,
  type AgentSessionExplorerAgent,
  type AgentSessionGroup,
} from "../engine/agent-session-groups.js";
import { toAgentSessionRecordFromApi, type AgentSessionSummary } from "../engine/agent-sessions.js";
import { useChatEngine } from "../engine/ChatEngineProvider.js";
import { AgentIcon } from "./AgentIcon.js";
import { cx } from "./class-names.js";
import { Dialog } from "./Dialog.js";

const SEARCH_MIN_LENGTH = 3;
const SEARCH_DEBOUNCE_MS = 250;

export interface AgentSessionExplorerProps {
  /** Opens a session in the conversation, for example by putting `?session=<id>` in the URL. */
  onOpenSession: (sessionId: string) => void;
  /** Shows a details button on each session that calls it with the session's id. */
  onOpenSessionDetails?: (sessionId: string) => void;
  /**
   * Every Agent the person can talk to, so an Agent without a recent session is listed too.
   * Without it the explorer lists the Agents of the sessions it has.
   */
  agents?: readonly AgentSessionExplorerAgent[];
  /** The application is still loading `agents`. */
  agentsLoading?: boolean;
  /** The application could not load `agents`. */
  agentsError?: string | null;
  /** A label at the right of the header, for example the Organization Environment's name. */
  environmentLabel?: string | null;
  /** Buttons after the search button, for example New session and Minimize. */
  headerActions?: ReactNode;
  className?: string;
}

type ArchivedGroupState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; sessions: Array<{ archivedAt: string | null; session: AgentSessionSummary }> };

function formatSessionTimestamp(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const now = new Date();
  const sameDay =
    now.getFullYear() === date.getFullYear() &&
    now.getMonth() === date.getMonth() &&
    now.getDate() === date.getDate();

  return sameDay
    ? new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date)
    : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

function describeError(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * The person's sessions grouped under their Agents, as Command Center's expanded rail shows them:
 * search across every conversation, the working and queued marks, archive and unarchive, and
 * each Agent's archived sessions on request. It reads the sessions from the engine; opening a
 * session is the application's, because the application owns its routes.
 */
export function AgentSessionExplorer({
  agents,
  agentsError = null,
  agentsLoading = false,
  className,
  environmentLabel = null,
  headerActions,
  onOpenSession,
  onOpenSessionDetails,
}: AgentSessionExplorerProps) {
  const {
    agentSessions,
    archiveAgentSession,
    auth,
    connection,
    currentSessionId,
    environmentUid,
    hasActiveChatStream,
    isActiveSessionLoading,
    isCreatingAgentSession,
    isLoadingLatestSessions,
    latestSessionsError,
    queuedMessageCountBySessionId,
    unarchiveAgentSession,
  } = useChatEngine();
  const userUid = auth.userUid ?? null;
  const token = auth.token ?? null;
  const tokenType = auth.tokenType ?? "Bearer";
  const organizationEnvironmentUid = environmentUid ?? "";
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [conversationResults, setConversationResults] = useState<AgentSessionSummary[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [shownArchivedGroups, setShownArchivedGroups] = useState<Record<string, boolean>>({});
  const [archivedByGroup, setArchivedByGroup] = useState<Record<string, ArchivedGroupState>>({});
  const [archiveBusyIds, setArchiveBusyIds] = useState<Record<string, boolean>>({});
  const archivedControllersRef = useRef<Record<string, AbortController>>({});
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const groups = useMemo(
    () => groupAgentSessions(agents ?? [], agentSessions),
    [agentSessions, agents],
  );
  const trimmedQuery = searchValue.trim();
  const sessionArchiveBusy = hasActiveChatStream || isActiveSessionLoading || isCreatingAgentSession;
  const canListArchived = Boolean(userUid && organizationEnvironmentUid);

  const loadArchived = useCallback(
    (group: AgentSessionGroup) => {
      const agentUid = group.agentUid;
      if (!agentUid || !userUid || !organizationEnvironmentUid) {
        return;
      }

      archivedControllersRef.current[group.key]?.abort();
      const controller = new AbortController();
      archivedControllersRef.current[group.key] = controller;
      setArchivedByGroup((current) => ({ ...current, [group.key]: { status: "loading" } }));

      void fetchArchivedAgentSessions({
        agentUid,
        connection,
        createdByUserUid: userUid,
        organizationEnvironmentUid,
        signal: controller.signal,
        token,
        tokenType,
      })
        .then((records) => {
          if (controller.signal.aborted) {
            return;
          }
          setArchivedByGroup((current) => ({
            ...current,
            [group.key]: {
              status: "ready",
              sessions: records.map((record) => ({
                archivedAt: record.archived_at ?? null,
                session: toAgentSessionRecordFromApi(record),
              })),
            },
          }));
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) {
            return;
          }
          setArchivedByGroup((current) => ({
            ...current,
            [group.key]: {
              status: "error",
              error: describeError(error, "Unable to load archived sessions."),
            },
          }));
        });
    },
    [connection, organizationEnvironmentUid, token, tokenType, userUid],
  );

  useEffect(() => {
    const controllers = archivedControllersRef.current;
    return () => {
      Object.values(controllers).forEach((controller) => controller.abort());
    };
  }, []);

  useEffect(() => {
    if (searchOpen) {
      searchInputRef.current?.focus();
    }
  }, [searchOpen]);

  // The group holding the open session is expanded, so the person sees where they are.
  useEffect(() => {
    const activeGroup = groups.find((group) =>
      group.sessions.some((session) => session.id === currentSessionId),
    );

    if (!activeGroup) {
      return;
    }

    setExpandedGroups((current) =>
      current[activeGroup.key] === true ? current : { ...current, [activeGroup.key]: true },
    );
  }, [currentSessionId, groups]);

  useEffect(() => {
    if (!searchOpen || trimmedQuery.length < SEARCH_MIN_LENGTH || !userUid) {
      setConversationResults([]);
      setSearchError(null);
      setIsSearching(false);
      return;
    }

    // Sessions already loaded match at once; the platform's search adds the rest.
    const localMatches = agentSessions.filter((session) =>
      agentSessionMatchesNavigationQuery(session, trimmedQuery),
    );
    setConversationResults(localMatches);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      setIsSearching(true);
      setSearchError(null);
      void searchAgentSessions({
        connection,
        createdByUserUid: userUid,
        organizationEnvironmentUid,
        query: trimmedQuery,
        signal: controller.signal,
        token,
        tokenType,
      })
        .then((payload) => {
          if (controller.signal.aborted) {
            return;
          }
          const resultsById = new Map<string, AgentSessionSummary>(
            payload.map((record) => {
              const session = toAgentSessionRecordFromApi(record);
              return [session.id, session] as const;
            }),
          );
          localMatches.forEach((session) => {
            resultsById.set(session.id, session);
          });
          setConversationResults(
            [...resultsById.values()].sort(
              (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
            ),
          );
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) {
            return;
          }
          setConversationResults(localMatches);
          setSearchError(
            localMatches.length > 0
              ? null
              : describeError(error, "Unable to search conversations right now."),
          );
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setIsSearching(false);
          }
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [
    agentSessions,
    connection,
    organizationEnvironmentUid,
    searchOpen,
    token,
    tokenType,
    trimmedQuery,
    userUid,
  ]);

  function closeSearch() {
    setSearchOpen(false);
    setSearchValue("");
    setConversationResults([]);
    setSearchError(null);
  }

  function reloadShownArchived() {
    groups.forEach((group) => {
      if (shownArchivedGroups[group.key]) {
        loadArchived(group);
      }
    });
  }

  async function changeArchive(sessionId: string, archive: boolean) {
    setArchiveBusyIds((current) => ({ ...current, [sessionId]: true }));

    try {
      const changed = archive
        ? await archiveAgentSession(sessionId)
        : await unarchiveAgentSession(sessionId);
      if (changed) {
        reloadShownArchived();
      }
    } finally {
      setArchiveBusyIds((current) => {
        const next = { ...current };
        delete next[sessionId];
        return next;
      });
    }
  }

  function toggleArchived(group: AgentSessionGroup, show: boolean) {
    setExpandedGroups((current) => ({ ...current, [group.key]: true }));
    setShownArchivedGroups((current) => ({ ...current, [group.key]: !show }));
    if (!show) {
      loadArchived(group);
    }
  }

  function renderDetailsButton(session: AgentSessionSummary, sessionTitle: string, archived: boolean) {
    if (!onOpenSessionDetails) {
      return null;
    }

    return (
      <button
        type="button"
        className="ms-chat-explorer__row-action ms-chat-explorer__row-action--details"
        title={archived ? "Archived session details" : "Session details"}
        aria-label={`Open details for ${archived ? "archived session" : "session"} ${sessionTitle}`}
        onClick={() => {
          onOpenSessionDetails(session.id);
        }}
      >
        <ArrowUpRight className="ms-chat-icon-sm" />
      </button>
    );
  }

  return (
    <>
      <section className={cx("ms-chat-explorer", className)} data-session-explorer>
        <div className="ms-chat-explorer__header">
          <Button
            variant="ghost"
            iconOnly
            className="ms-chat-explorer__header-button"
            aria-expanded={searchOpen}
            aria-label="Search conversations"
            title="Search conversations"
            onClick={() => {
              setSearchOpen(true);
            }}
          >
            <Search className="ms-chat-icon-md" />
          </Button>
          {headerActions}
          {environmentLabel ? (
            <span
              className="ms-chat-explorer__environment"
              title={`Organization Environment: ${environmentLabel}`}
            >
              {environmentLabel}
            </span>
          ) : null}
        </div>

        <div className="ms-chat-explorer__body">
          <div className="ms-chat-explorer__scroll">
            {agentsLoading ? (
              <div className="ms-chat-explorer__status">
                <Loader2 className="ms-chat-icon-md ms-chat-spin" />
                Loading available agents
              </div>
            ) : null}

            {agentsError ? (
              <div className="ms-chat-explorer__status ms-chat-explorer__status--danger">
                Agent catalog unavailable: {agentsError}
              </div>
            ) : null}

            {isLoadingLatestSessions && !agentsLoading ? (
              <div className="ms-chat-explorer__status">
                <Loader2 className="ms-chat-icon-md ms-chat-spin" />
                Loading recent sessions
              </div>
            ) : null}

            {latestSessionsError ? (
              <div className="ms-chat-explorer__status ms-chat-explorer__status--danger">
                Recent sessions unavailable: {latestSessionsError}
              </div>
            ) : null}

            {!agentsLoading && !agentsError && !isLoadingLatestSessions && groups.length === 0 ? (
              <div className="ms-chat-explorer__status">
                {agents ? "No agents are available." : "No sessions yet."}
              </div>
            ) : null}

            <div className="ms-chat-explorer__groups">
              {groups.map((group) => {
                const containsActiveSession = group.sessions.some(
                  (session) => session.id === currentSessionId,
                );
                const expanded = expandedGroups[group.key] ?? group.sessions.length > 0;
                const showArchived = shownArchivedGroups[group.key] ?? false;
                const archived = archivedByGroup[group.key];
                const canShowArchived = Boolean(group.agentUid && canListArchived);

                return (
                  <div key={group.key} className="ms-chat-explorer__group" data-agent-group={group.key}>
                    <button
                      type="button"
                      className={cx(
                        "ms-chat-explorer__group-toggle",
                        containsActiveSession && "ms-chat-explorer__group-toggle--active",
                      )}
                      aria-expanded={expanded}
                      title={environmentLabel ? `${group.name} · ${environmentLabel}` : group.name}
                      onClick={() => {
                        setExpandedGroups((current) => ({ ...current, [group.key]: !expanded }));
                      }}
                    >
                      {expanded ? (
                        <ChevronDown className="ms-chat-icon-sm ms-chat-no-shrink" />
                      ) : (
                        <ChevronRight className="ms-chat-icon-sm ms-chat-no-shrink" />
                      )}
                      <AgentIcon
                        agentUid={group.agentUid}
                        className="ms-chat-explorer__agent-icon"
                        fallback={<Bot className="ms-chat-icon-md ms-chat-no-shrink" />}
                      />
                      <span className="ms-chat-explorer__group-name">{group.name}</span>
                      <span className="ms-chat-explorer__group-count">{group.sessions.length}</span>
                    </button>

                    {expanded ? (
                      <div className="ms-chat-explorer__sessions">
                        {group.sessions.length === 0 ? (
                          <div className="ms-chat-explorer__note">No recent sessions</div>
                        ) : null}
                        {group.sessions.map((session) => {
                          const active = session.id === currentSessionId;
                          const sessionTitle = getAgentSessionNavigationTitle(session);
                          const handleLabel = getAgentSessionNavigationHandleLabel(session);
                          const queuedCount = queuedMessageCountBySessionId[session.id] ?? 0;

                          return (
                            <div
                              key={session.id}
                              className={cx(
                                "ms-chat-explorer__row",
                                active && "ms-chat-explorer__row--active",
                              )}
                              data-session-row={session.id}
                            >
                              <button
                                type="button"
                                className="ms-chat-explorer__row-main"
                                title={`Open ${sessionTitle}`}
                                aria-label={`Open session ${sessionTitle}`}
                                aria-current={active ? "true" : undefined}
                                onClick={() => {
                                  onOpenSession(session.id);
                                }}
                              >
                                <span className="ms-chat-explorer__row-line">
                                  {session.working ? (
                                    <Sparkles className="ms-chat-icon-xs ms-chat-explorer__working" />
                                  ) : null}
                                  {queuedCount > 0 ? (
                                    <span
                                      className="ms-chat-explorer__queued"
                                      title="Messages waiting to send"
                                      data-queued-count
                                    >
                                      {queuedCount} queued
                                    </span>
                                  ) : null}
                                  <span className="ms-chat-explorer__row-title">{sessionTitle}</span>
                                  <span className="ms-chat-explorer__row-time">
                                    {formatSessionTimestamp(session.updatedAt)}
                                  </span>
                                </span>
                                {handleLabel ? (
                                  <span className="ms-chat-explorer__row-handle">{handleLabel}</span>
                                ) : null}
                              </button>
                              {renderDetailsButton(session, sessionTitle, false)}
                              <button
                                type="button"
                                className="ms-chat-explorer__row-action"
                                disabled={sessionArchiveBusy || archiveBusyIds[session.id]}
                                title="Archive session"
                                aria-label={`Archive session ${sessionTitle}`}
                                onClick={() => {
                                  void changeArchive(session.id, true);
                                }}
                              >
                                {archiveBusyIds[session.id] ? (
                                  <Loader2 className="ms-chat-icon-sm ms-chat-spin" />
                                ) : (
                                  <Archive className="ms-chat-icon-sm" />
                                )}
                              </button>
                            </div>
                          );
                        })}

                        {showArchived && archived?.status === "loading" ? (
                          <div className="ms-chat-explorer__note">
                            <Loader2 className="ms-chat-icon-sm ms-chat-spin" />
                            Loading archived sessions
                          </div>
                        ) : null}

                        {showArchived && archived?.status === "error" ? (
                          <div className="ms-chat-explorer__note ms-chat-explorer__note--danger">
                            {archived.error}
                          </div>
                        ) : null}

                        {showArchived && archived?.status === "ready" && archived.sessions.length === 0 ? (
                          <div className="ms-chat-explorer__note">No archived sessions</div>
                        ) : null}

                        {showArchived && archived?.status === "ready"
                          ? archived.sessions.map(({ archivedAt, session }) => {
                              const sessionTitle = getAgentSessionNavigationTitle(session);
                              const handleLabel = getAgentSessionNavigationHandleLabel(session);

                              return (
                                <div
                                  key={`archived:${session.id}`}
                                  className="ms-chat-explorer__row ms-chat-explorer__row--archived"
                                  data-archived-session-row={session.id}
                                >
                                  <div className="ms-chat-explorer__row-main">
                                    <span className="ms-chat-explorer__row-line">
                                      <span className="ms-chat-explorer__row-title">{sessionTitle}</span>
                                      <span className="ms-chat-explorer__row-time">
                                        {formatSessionTimestamp(archivedAt ?? session.updatedAt)}
                                      </span>
                                    </span>
                                    {handleLabel ? (
                                      <span className="ms-chat-explorer__row-handle">{handleLabel}</span>
                                    ) : null}
                                  </div>
                                  {renderDetailsButton(session, sessionTitle, true)}
                                  <button
                                    type="button"
                                    className="ms-chat-explorer__row-action"
                                    disabled={sessionArchiveBusy || archiveBusyIds[session.id]}
                                    title="Unarchive session"
                                    aria-label={`Unarchive session ${sessionTitle}`}
                                    onClick={() => {
                                      void changeArchive(session.id, false);
                                    }}
                                  >
                                    {archiveBusyIds[session.id] ? (
                                      <Loader2 className="ms-chat-icon-sm ms-chat-spin" />
                                    ) : (
                                      <ArchiveRestore className="ms-chat-icon-sm" />
                                    )}
                                  </button>
                                </div>
                              );
                            })
                          : null}

                        {canShowArchived ? (
                          <button
                            type="button"
                            className="ms-chat-explorer__more"
                            aria-expanded={showArchived}
                            onClick={() => {
                              toggleArchived(group, showArchived);
                            }}
                          >
                            {showArchived ? "Show less" : "Show more"}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <Dialog
        open={searchOpen}
        onClose={closeSearch}
        closeOnBackdropClick
        className="ms-chat-explorer-search"
        title="Search conversations"
        description="Search your active sessions by title, handle, or agent."
      >
        <div className="ms-chat-explorer-search__field">
          <Search className="ms-chat-icon-md ms-chat-explorer-search__field-icon" />
          <Input
            ref={searchInputRef}
            value={searchValue}
            placeholder="Search conversations"
            aria-label="Search conversations"
            className="ms-chat-explorer-search__input"
            onChange={(event) => {
              setSearchValue(event.target.value);
            }}
          />
        </div>

        <div className="ms-chat-explorer-search__results">
          {trimmedQuery.length > 0 && trimmedQuery.length < SEARCH_MIN_LENGTH ? (
            <div className="ms-chat-explorer__status">Enter at least three characters.</div>
          ) : null}

          {isSearching ? (
            <div className="ms-chat-explorer__status">
              <Loader2 className="ms-chat-icon-md ms-chat-spin" />
              Searching conversations
            </div>
          ) : null}

          {!isSearching && searchError ? (
            <div className="ms-chat-explorer__status ms-chat-explorer__status--danger">{searchError}</div>
          ) : null}

          {!isSearching &&
          !searchError &&
          trimmedQuery.length >= SEARCH_MIN_LENGTH &&
          conversationResults.length === 0 ? (
            <div className="ms-chat-explorer__status">No conversations found.</div>
          ) : null}

          {!searchError
            ? conversationResults.map((session) => {
                const sessionTitle = getAgentSessionNavigationTitle(session);
                const handleLabel = getAgentSessionNavigationHandleLabel(session);

                return (
                  <button
                    key={session.id}
                    type="button"
                    className="ms-chat-explorer-search__result"
                    data-search-result={session.id}
                    onClick={() => {
                      onOpenSession(session.id);
                      closeSearch();
                    }}
                  >
                    <MessageSquare className="ms-chat-icon-md ms-chat-explorer-search__result-icon" />
                    <span className="ms-chat-explorer-search__result-text">
                      <span className="ms-chat-explorer-search__result-title">{sessionTitle}</span>
                      <span className="ms-chat-explorer-search__result-meta">
                        {handleLabel ? `${handleLabel} · ` : ""}
                        {session.agent?.name?.trim() || UNNAMED_AGENT_LABEL}
                        {" · "}
                        {formatSessionTimestamp(session.updatedAt)}
                      </span>
                    </span>
                    <ArrowUpRight className="ms-chat-icon-sm ms-chat-explorer-search__result-icon" />
                  </button>
                );
              })
            : null}
        </div>
      </Dialog>
    </>
  );
}
