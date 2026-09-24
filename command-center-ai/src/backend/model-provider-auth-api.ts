import { resolvePlatformApiUrl, type ChatBackendConnection } from "./connection.js";
import {
  buildRuntimeHttpErrorMessage,
  formatRuntimeHttpStatus,
} from "./http-error.js";
import { requireCreatedByUserUid } from "./user-scope.js";

export type ProviderAuthKind = "api_key" | "oauth";

export type SignInAttemptStatus =
  | "pending"
  | "awaiting_browser"
  | "awaiting_manual_input"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type SignInAttemptNextAction =
  | { type: "none" }
  | {
      type: "open_url";
      url: string;
      userCode?: string;
      instructions?: string;
    };

export interface SignInAttempt {
  id: string;
  provider: string;
  status: SignInAttemptStatus;
  nextAction: SignInAttemptNextAction;
  authKind: ProviderAuthKind;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  error: string | null;
}

export interface ProviderSignInStartResult {
  ok: true;
  statusCode: 200 | 201;
  provider: string;
  attempt: SignInAttempt;
}

export class ModelProviderApiError extends Error {
  code: string | null;
  attempt: SignInAttempt | null;
  status: number | null;

  constructor(
    message: string,
    options?: {
      attempt?: SignInAttempt | null;
      code?: string | null;
      status?: number | null;
    },
  ) {
    super(message);
    this.name = "ModelProviderApiError";
    this.attempt = options?.attempt ?? null;
    this.code = options?.code ?? null;
    this.status = options?.status ?? null;
  }
}

const signInAttemptCollectionPath = "/api/v1/model-provider-sign-in-attempts/";
const credentialRevokePath = "/api/v1/model-provider-credentials/revoke/";

function buildSignInAttemptPath(attemptId: string) {
  return `${signInAttemptCollectionPath}${encodeURIComponent(attemptId)}/`;
}

function normalizeString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeNextAction(value: unknown): SignInAttemptNextAction {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { type: "none" };
  }

  const candidate = value as Record<string, unknown>;
  const type = normalizeString(candidate.type);

  if (type !== "open_url") {
    return { type: "none" };
  }

  const url = normalizeString(candidate.authorization_url);
  if (!url) {
    return { type: "none" };
  }

  return {
    type: "open_url",
    url,
    userCode: normalizeString(candidate.user_code) ?? undefined,
    instructions: normalizeString(candidate.instructions) ?? undefined,
  };
}

function normalizeSignInAttempt(value: unknown): SignInAttempt | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const id = normalizeString(candidate.uid ?? candidate.id);
  const provider = normalizeString(candidate.provider);
  const status = normalizeString(candidate.status) as SignInAttemptStatus | null;

  if (!id || !provider || !status) {
    return null;
  }

  const nextAction = normalizeNextAction(candidate.next_action);
  const errorCode = normalizeString(candidate.error_code);

  return {
    id,
    provider,
    status,
    nextAction,
    authKind: "oauth",
    createdAt: normalizeString(candidate.created_at) ?? "",
    updatedAt: normalizeString(candidate.updated_at) ?? "",
    completedAt: normalizeString(candidate.completed_at),
    error: errorCode,
  };
}

async function parseJsonSafe(response: Response) {
  return (await response.clone().json().catch(() => null)) as
    | Record<string, unknown>
    | null;
}

function extractErrorMessage(payload: Record<string, unknown> | null, fallback: string) {
  return (
    normalizeString(payload?.message) ??
    normalizeString(payload?.detail) ??
    normalizeString(payload?.error) ??
    fallback
  );
}

function extractErrorCode(payload: Record<string, unknown> | null) {
  return (
    normalizeString(payload?.code) ??
    normalizeString(payload?.error_code) ??
    normalizeString(payload?.error)
  );
}

function buildHeaders(token: string | null | undefined, tokenType: string) {
  const headers = new Headers({
    Accept: "application/json",
    "Content-Type": "application/json",
  });

  if (token) {
    headers.set("Authorization", `${tokenType} ${token}`);
  }

  return headers;
}

async function throwProviderApiError(
  response: Response,
  fallback: string,
  context: { method: string; operation: string; url: string },
): Promise<never> {
  const payload = await parseJsonSafe(response);
  const attempt = normalizeSignInAttempt(payload?.attempt) ?? normalizeSignInAttempt(payload);
  const message = await buildRuntimeHttpErrorMessage({
    fallbackMessage: fallback,
    method: context.method,
    operation: context.operation,
    response,
    url: context.url,
  });

  throw new ModelProviderApiError(message || extractErrorMessage(payload, fallback), {
    attempt,
    code: extractErrorCode(payload),
    status: response.status,
  });
}

export async function startModelProviderSignIn({
  connection,
  createdByUserUid,
  provider,
  token,
  tokenType = "Bearer",
}: {
  connection: ChatBackendConnection;
  createdByUserUid?: string | null;
  provider: string;
  token?: string | null;
  tokenType?: string;
}): Promise<ProviderSignInStartResult> {
  requireCreatedByUserUid(createdByUserUid, "Model provider sign-in");
  const url = resolvePlatformApiUrl(connection, signInAttemptCollectionPath);
  const response = await fetch(url, {
    method: "POST",
    headers: buildHeaders(token, tokenType),
    body: JSON.stringify({ provider }),
  });

  if (!response.ok) {
    await throwProviderApiError(
      response,
      `Failed to start sign-in for provider ${provider} (${response.status}).`,
      {
        method: "POST",
        operation: `Model provider sign-in request failed for ${provider}`,
        url,
      },
    );
  }

  const attempt = normalizeSignInAttempt((await response.json()) as unknown);
  if (!attempt) {
    throw new ModelProviderApiError(
      `The provider sign-in response for ${provider} was invalid.`,
      { status: response.status },
    );
  }

  return {
    ok: true,
    statusCode: response.status === 201 ? 201 : 200,
    provider: attempt.provider,
    attempt,
  };
}

export async function fetchModelProviderSignInAttempt({
  connection,
  createdByUserUid,
  provider,
  attemptId,
  signal,
  token,
  tokenType = "Bearer",
}: {
  connection: ChatBackendConnection;
  createdByUserUid?: string | null;
  provider: string;
  attemptId: string;
  signal?: AbortSignal;
  token?: string | null;
  tokenType?: string;
}) {
  requireCreatedByUserUid(createdByUserUid, "Model provider sign-in attempt");
  const url = resolvePlatformApiUrl(connection, buildSignInAttemptPath(attemptId));
  const response = await fetch(url, {
    method: "GET",
    headers: buildHeaders(token, tokenType),
    signal,
  });

  if (!response.ok) {
    await throwProviderApiError(
      response,
      `Failed to load sign-in attempt ${attemptId} for provider ${provider} (${response.status}).`,
      {
        method: "GET",
        operation: `Model provider sign-in attempt request failed for ${provider}`,
        url,
      },
    );
  }

  const attempt = normalizeSignInAttempt((await response.json()) as unknown);
  if (!attempt || attempt.provider !== provider) {
    throw new ModelProviderApiError(
      `The provider sign-in attempt response for ${provider} was invalid.`,
      { status: response.status },
    );
  }

  return attempt;
}

export async function cancelModelProviderSignIn({
  connection,
  createdByUserUid,
  provider,
  attemptId,
  token,
  tokenType = "Bearer",
}: {
  connection: ChatBackendConnection;
  createdByUserUid?: string | null;
  provider: string;
  attemptId: string;
  token?: string | null;
  tokenType?: string;
}) {
  requireCreatedByUserUid(createdByUserUid, "Model provider sign-in cancellation");
  const url = resolvePlatformApiUrl(connection, `${buildSignInAttemptPath(attemptId)}cancel/`);
  const response = await fetch(url, {
    method: "POST",
    headers: buildHeaders(token, tokenType),
    body: "{}",
  });

  if (!response.ok) {
    await throwProviderApiError(
      response,
      `Failed to cancel sign-in attempt ${attemptId} for provider ${provider} (${response.status}).`,
      {
        method: "POST",
        operation: `Model provider sign-in cancellation failed for ${provider}`,
        url,
      },
    );
  }

  const attempt = normalizeSignInAttempt((await response.json()) as unknown);
  if (!attempt || attempt.provider !== provider) {
    throw new ModelProviderApiError(
      `The provider sign-in cancellation response for ${provider} was invalid.`,
      { status: response.status },
    );
  }

  return attempt;
}

export async function signOffModelProvider({
  connection,
  createdByUserUid,
  provider,
  token,
  tokenType = "Bearer",
}: {
  connection: ChatBackendConnection;
  createdByUserUid?: string | null;
  provider: string;
  token?: string | null;
  tokenType?: string;
}) {
  requireCreatedByUserUid(createdByUserUid, "Model provider sign-off");
  const url = resolvePlatformApiUrl(connection, credentialRevokePath);
  const response = await fetch(url, {
    method: "POST",
    headers: buildHeaders(token, tokenType),
    body: JSON.stringify({ provider, reason: "user_signoff" }),
  });

  if (!response.ok) {
    const payload = await parseJsonSafe(response);
    throw new ModelProviderApiError(
      `Model provider sign-off failed. Status: ${formatRuntimeHttpStatus(response)}. Backend response: ${extractErrorMessage(payload, "Unable to revoke the provider credential.")}`,
      {
        code: extractErrorCode(payload),
        status: response.status,
      },
    );
  }
}
