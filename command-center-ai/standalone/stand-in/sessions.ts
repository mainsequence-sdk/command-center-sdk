import {
  asRecord,
  detail,
  json,
  noContent,
  readString,
  type StandInRequest,
  type StandInRoute,
} from "./http";
import type { StandInContext } from "./identity";
import { STAND_IN_DEFAULT_MODEL, type StandInModelProviders } from "./model-providers";

// Agent sessions, their history and insights, runtime access, and the agent icon projection, as
// the package's clients read them (`src/backend/agent-sessions-api.ts`, `session-history.ts`,
// `session-insights.ts`, `agent-session-runtime-access.ts`, `command-center-agent-icons-api.ts`).

const ENVIRONMENT_NAME = "Stand-in";

// A mask icon: only its shape matters, the chat paints it with the text colour.
const AGENT_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z"/></svg>';

/** One message of a session's transcript, in the shape the history route returns. */
export interface StandInTranscriptMessage {
  id: string;
  role: "user" | "assistant";
  createdAt: string;
  content: Array<Record<string, unknown>>;
  provenance: Record<string, unknown>;
}

export interface StandInSession {
  uid: string;
  agentUid: string;
  environmentUid: string;
  name: string | null;
  handle: { uid: string; handleUniqueId: string } | null;
  createdByUserUid: string;
  startedAt: string;
  updatedAt: string;
  isArchived: boolean;
  archivedAt: string | null;
  llmProvider: string;
  llmModel: string;
  llmThinking: string;
  /** True while the Agent answers a turn of this session. */
  working: boolean;
  transcript: StandInTranscriptMessage[];
}

interface ModelChoice {
  provider: string;
  model: string;
  thinking: string;
}

type FieldErrors = Record<string, string[]>;

function estimateTokens(text: string) {
  return Math.ceil(text.length / 4);
}

function messageText(message: StandInTranscriptMessage) {
  return message.content
    .map((part) => (typeof part.text === "string" ? part.text : JSON.stringify(part.args ?? "")))
    .join(" ");
}

export function createSessions(context: StandInContext, providers: StandInModelProviders) {
  // The stand-in's Agent answers under any uid the chat names.
  const agents = new Set<string>([context.identity.agentUid]);
  const sessions = new Map<string, StandInSession>();

  function create({
    agentUid,
    handleUniqueId = null,
    model = STAND_IN_DEFAULT_MODEL,
    name = null,
  }: {
    agentUid: string;
    handleUniqueId?: string | null;
    model?: ModelChoice;
    name?: string | null;
  }) {
    const startedAt = context.now();
    const session: StandInSession = {
      uid: context.nextUid("session"),
      agentUid,
      environmentUid: context.environmentUid(),
      name,
      handle: handleUniqueId ? { uid: context.nextUid("handle"), handleUniqueId } : null,
      createdByUserUid: context.personUid(),
      startedAt,
      updatedAt: startedAt,
      isArchived: false,
      archivedAt: null,
      llmProvider: model.provider,
      llmModel: model.model,
      llmThinking: model.thinking,
      working: false,
      transcript: [],
    };

    sessions.set(session.uid, session);
    return session;
  }

  /** The canonical session record the detail route returns and the chat sends back (ADR 060). */
  function toRecord(session: StandInSession) {
    return {
      uid: session.uid,
      agent_uid: session.agentUid,
      agent_name: context.identity.agentName,
      organization_environment_uid: session.environmentUid,
      organization_environment_name: ENVIRONMENT_NAME,
      name: session.name,
      summary: "",
      harness: "tau",
      harness_protocol: "tau-session-v1",
      harness_version: "stand-in",
      status: "running",
      started_at: session.startedAt,
      ended_at: null,
      llm_provider: session.llmProvider,
      llm_model: session.llmModel,
      llm_thinking: session.llmThinking,
      active_provider: session.llmProvider,
      active_model: session.llmModel,
      active_thinking: session.llmThinking,
      engine_name: "stand-in",
      runtime_state: session.working ? "working" : "idle",
      working: session.working,
      catalog_digest: providers.catalogDigest(),
      created_by_user_uid: session.createdByUserUid,
      is_archived: session.isArchived,
      archived_at: session.archivedAt,
      bound_handle: session.handle
        ? {
            uid: session.handle.uid,
            handle_unique_id: session.handle.handleUniqueId,
            owner_user_uid: session.createdByUserUid,
            is_locked: false,
          }
        : null,
    };
  }

  function history(session: StandInSession) {
    return {
      version: 1,
      session: {
        sessionId: session.uid,
        threadId: session.uid,
        agentName: context.identity.agentName,
        agentUid: session.agentUid,
        agentSessionUid: session.uid,
        status: session.working ? "running" : "completed",
        startedAt: session.startedAt,
        updatedAt: session.updatedAt,
        error: null,
      },
      messages: session.transcript,
      inProgressMessage: null,
    };
  }

  function insights(session: StandInSession) {
    const base = {
      agent_session_uid: session.uid,
      harness: "tau",
      harness_protocol: "tau-session-v1",
      harness_version: "stand-in",
      computed_at: context.now(),
      reason: "stand-in",
      updated_at: session.updatedAt,
    };

    if (session.transcript.length === 0) {
      return { ...base, has_insights: false, insights: {} };
    }

    const model = providers.describeModel(session.llmProvider, session.llmModel);
    const userMessages = session.transcript.filter((message) => message.role === "user");
    const assistantMessages = session.transcript.filter((message) => message.role === "assistant");
    const toolCalls = assistantMessages.flatMap((message) =>
      message.content.filter((part) => part.type === "tool-call"),
    ).length;
    const inputTokens = userMessages.reduce((sum, message) => sum + estimateTokens(messageText(message)), 0);
    const outputTokens = assistantMessages.reduce(
      (sum, message) => sum + estimateTokens(messageText(message)),
      0,
    );
    const totalTokens = inputTokens + outputTokens;
    const contextWindow = model?.contextWindow ?? null;

    return {
      ...base,
      has_insights: true,
      entry_count: session.transcript.length,
      last_sequence: session.transcript.length,
      active_branch_entry_count: session.transcript.length,
      entry_type_counts: { message: session.transcript.length },
      title: session.name,
      insights: {
        version: 1,
        model: {
          provider: session.llmProvider,
          model: session.llmModel,
          reasoningEffort: session.llmThinking || null,
          contextWindow,
          maxOutputTokens: model?.maxTokens ?? null,
        },
        session: {
          agentSessionId: session.uid,
          sessionId: session.uid,
          threadId: session.uid,
          status: session.working ? "running" : "completed",
          startedAt: session.startedAt,
          updatedAt: session.updatedAt,
          lastError: null,
        },
        usage: {
          totalMessages: session.transcript.length,
          userMessages: userMessages.length,
          assistantMessages: assistantMessages.length,
          assistantTurns: assistantMessages.length,
          toolCalls,
          toolResults: toolCalls,
          estimatedCostUsd: 0,
          tokens: { input: inputTokens, output: outputTokens, cacheRead: 0, cacheWrite: 0, total: totalTokens },
        },
        context: {
          source: "stand-in",
          status: "estimated",
          tokens: totalTokens,
          contextWindow,
          percentOfContextWindow: contextWindow ? Math.round((totalTokens / contextWindow) * 1000) / 10 : null,
          latestCompaction: null,
        },
      },
    };
  }

  function runtimeAccess(session: StandInSession) {
    return {
      session_uid: session.uid,
      mode: "token",
      rpc_url: context.identity.runtimeUrl,
      token: context.identity.runtimeToken,
      is_ready: true,
      runtime_interaction: {
        state: "ready",
        can_submit: true,
        notice: null,
        operation: null,
        retry_after_ms: null,
      },
      runtime_presence: {
        phase: "serving",
        replicas: { desired: 1, actual: 1 },
        detail: "The Agent is running.",
        observed_at: context.now(),
        wake: null,
      },
    };
  }

  /** Records a turn: what the person wrote and, unless the turn failed, what the Agent answered. */
  function appendTurn(session: StandInSession, input: string, answer: Array<Record<string, unknown>> | null) {
    // The platform stamps every message with the session's Agent; the chat reads it for icons.
    const provenance = { origin: "user", targetAgentUid: session.agentUid };

    session.transcript.push({
      id: `message-${session.transcript.length + 1}`,
      role: "user",
      createdAt: context.now(),
      content: [{ type: "text", text: input }],
      provenance,
    });

    if (answer && answer.length > 0) {
      session.transcript.push({
        id: `message-${session.transcript.length + 1}`,
        role: "assistant",
        createdAt: context.now(),
        content: answer,
        provenance,
      });
    }

    session.updatedAt = context.now();
  }

  function readModelChoice(
    payload: Record<string, unknown>,
    required: boolean,
  ): { kind: "none" } | { kind: "invalid"; errors: FieldErrors } | { kind: "choice"; choice: ModelChoice } {
    const provider = readString(payload.llm_provider);
    const model = readString(payload.llm_model);

    if (!required && !provider && !model) {
      return { kind: "none" };
    }
    if (!provider || !model) {
      return {
        kind: "invalid",
        errors: {
          ...(provider ? {} : { llm_provider: ["This field is required."] }),
          ...(model ? {} : { llm_model: ["This field is required."] }),
        },
      };
    }
    if (!providers.describeModel(provider, model)) {
      return { kind: "invalid", errors: { llm_model: ["This model is not in the platform's model catalog."] } };
    }

    return {
      kind: "choice",
      choice: { provider, model, thinking: typeof payload.llm_thinking === "string" ? payload.llm_thinking : "" },
    };
  }

  function withSession(
    handle: (session: StandInSession, request: StandInRequest) => Response,
  ): StandInRoute["handle"] {
    return (request, params) => {
      const session = sessions.get(params.session ?? "");
      return session ? handle(session, request) : detail(404, "Not found.");
    };
  }

  function sortSessions(list: StandInSession[], ordering: string) {
    const key = (session: StandInSession) =>
      ordering === "-archived_at" ? session.archivedAt ?? "" : session.startedAt;
    // Uids count up, so they break ties between sessions started in the same millisecond.
    return list.sort((left, right) => key(right).localeCompare(key(left)) || right.uid.localeCompare(left.uid));
  }

  const routes: StandInRoute[] = [
    {
      method: "GET",
      path: "/api/v1/agent-sessions/",
      handle: (request) => {
        const environmentUid = readString(request.query.get("organization_environment_uid"));
        if (!environmentUid) {
          return json(400, { organization_environment_uid: ["This field is required."] });
        }
        context.adopt(request);

        const archived = request.query.get("is_archived");
        const agentUid = readString(request.query.get("agent_uid")) ?? readString(request.query.get("agent_id"));
        const search = request.query.get("q")?.trim().toLowerCase() ?? "";
        const limit = Math.max(1, Math.min(100, Number(request.query.get("limit")) || 20));
        const matches = sortSessions(
          [...sessions.values()].filter(
            (session) =>
              session.environmentUid === environmentUid &&
              (archived === null || session.isArchived === (archived === "true")) &&
              (!agentUid || session.agentUid === agentUid) &&
              (!search ||
                `${session.name ?? ""} ${session.transcript.map(messageText).join(" ")}`
                  .toLowerCase()
                  .includes(search)),
          ),
          request.query.get("ordering") ?? "-started_at",
        );

        return json(200, {
          count: matches.length,
          next: null,
          previous: null,
          results: matches.slice(0, limit).map(toRecord),
        });
      },
    },
    {
      method: "GET",
      path: "/api/v1/agent-sessions/:session/",
      handle: withSession((session) => json(200, toRecord(session))),
    },
    {
      method: "PATCH",
      path: "/api/v1/agent-sessions/:session/",
      handle: withSession((session, request) => {
        if (session.working) {
          return detail(409, "Model selection cannot change while a turn is working or persisting.", {
            error_code: "agent_session_selection_runtime_active",
          });
        }

        const result = readModelChoice(asRecord(request.body), true);
        if (result.kind !== "choice") {
          return json(400, result.kind === "invalid" ? result.errors : {});
        }

        session.llmProvider = result.choice.provider;
        session.llmModel = result.choice.model;
        session.llmThinking = result.choice.thinking;
        session.updatedAt = context.now();
        return json(200, toRecord(session));
      }),
    },
    {
      method: "DELETE",
      path: "/api/v1/agent-sessions/:session/",
      handle: withSession((session) => {
        sessions.delete(session.uid);
        return noContent();
      }),
    },
    {
      method: "POST",
      path: "/api/v1/agent-sessions/:session/archive/",
      handle: withSession((session) => {
        session.isArchived = true;
        session.archivedAt = context.now();
        return json(200, toRecord(session));
      }),
    },
    {
      method: "POST",
      path: "/api/v1/agent-sessions/:session/unarchive/",
      handle: withSession((session) => {
        session.isArchived = false;
        session.archivedAt = null;
        return json(200, toRecord(session));
      }),
    },
    {
      method: "POST",
      path: "/api/v1/agent-sessions/:session/resolve-runtime-access/",
      handle: withSession((session) => json(200, runtimeAccess(session))),
    },
    {
      method: "GET",
      path: "/api/v1/agent-sessions/:session/history/",
      // A session nobody has written to yet has no history; the chat reads the 404 as empty.
      handle: withSession((session) =>
        session.transcript.length > 0
          ? json(200, history(session))
          : detail(404, "This session has no history yet."),
      ),
    },
    {
      method: "GET",
      path: "/api/v1/agent-sessions/:session/insights/",
      handle: withSession((session) => json(200, insights(session))),
    },
    {
      method: "POST",
      path: "/api/v1/agents/:agent/start-new-session/",
      handle: (_request, params) => {
        const agentUid = params.agent ?? "";
        agents.add(agentUid);
        return json(201, toRecord(create({ agentUid })));
      },
    },
    {
      method: "POST",
      path: "/api/v1/agents/:agent/sessions/get-or-create-session/",
      handle: (request, params) => {
        const agentUid = params.agent ?? "";
        const body = asRecord(request.body);
        const sessionUid = readString(body.session_uid);
        const handleUniqueId = readString(body.handle_unique_id);

        if (Boolean(sessionUid) === Boolean(handleUniqueId)) {
          return json(400, { non_field_errors: ["Send exactly one of session_uid or handle_unique_id."] });
        }
        agents.add(agentUid);

        if (sessionUid) {
          const session = sessions.get(sessionUid);
          return session && session.agentUid === agentUid
            ? json(200, toRecord(session))
            : detail(404, "Not found.");
        }

        // The same person, Agent, and handle always get the same session.
        const existing = [...sessions.values()].find(
          (session) =>
            session.agentUid === agentUid &&
            session.environmentUid === context.environmentUid() &&
            session.handle?.handleUniqueId === handleUniqueId,
        );
        if (existing) {
          return json(200, toRecord(existing));
        }

        const result = readModelChoice(body, false);
        if (result.kind === "invalid") {
          return json(400, result.errors);
        }

        const session = create({
          agentUid,
          handleUniqueId,
          model: result.kind === "choice" ? result.choice : STAND_IN_DEFAULT_MODEL,
          name: readString(body.name),
        });
        return json(201, toRecord(session));
      },
    },
    {
      method: "GET",
      path: "/api/v1/command-center/agents/",
      handle: (request) => {
        if (!readString(request.query.get("organization_environment_uid"))) {
          return json(400, { organization_environment_uid: ["This field is required."] });
        }
        context.adopt(request);

        return json(
          200,
          [...agents].map((agentUid) => ({
            agentUid,
            // The delivery URL hangs from the address the chat used, like the platform's own.
            commandCenterIcon: {
              rendering: "mask",
              url: `${request.base}/api/v1/command-center/agents/${encodeURIComponent(agentUid)}/icon/`,
            },
          })),
        );
      },
    },
    {
      method: "GET",
      path: "/api/v1/command-center/agents/:agent/icon/",
      handle: (_request, params) =>
        agents.has(params.agent ?? "")
          ? new Response(AGENT_ICON_SVG, {
              status: 200,
              headers: {
                "Cache-Control": "private, no-cache",
                "Content-Type": "image/svg+xml",
                ETag: '"stand-in-agent-icon"',
              },
            })
          : detail(404, "Not found."),
    },
  ];

  return {
    appendTurn,
    get: (uid: string) => sessions.get(uid) ?? null,
    list: () => [...sessions.values()],
    routes,
  };
}

export type StandInSessions = ReturnType<typeof createSessions>;
