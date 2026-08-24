const DEFAULT_TIMEOUT_MS = 15_000;
const CANONICAL_COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/u;

export class ProjectSyncApiError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "ProjectSyncApiError";
  }
}

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProjectSyncApiError(`${label} must be an object.`);
  }
  return value;
}

function requireSingleLine(value, label) {
  if (typeof value !== "string" || !value.trim() || /[\r\n]/u.test(value)) {
    throw new ProjectSyncApiError(`${label} must be non-empty single-line text.`);
  }
  return value.trim();
}

function requireCanonicalCommitSha(value, label) {
  const commitSha = requireSingleLine(value, label).toLowerCase();
  if (!CANONICAL_COMMIT_SHA_PATTERN.test(commitSha)) {
    throw new ProjectSyncApiError(`${label} must be a canonical full Git commit SHA.`);
  }
  return commitSha;
}

function normalizeBackendUrl(value) {
  const candidate = requireSingleLine(value, "Main Sequence backend URL");
  let url;
  try {
    url = new URL(candidate);
  } catch (error) {
    throw new ProjectSyncApiError(
      "MAINSEQUENCE_ENDPOINT must be an absolute HTTP(S) URL.",
      { cause: error },
    );
  }
  if (!new Set(["http:", "https:"]).has(url.protocol) || url.username || url.password) {
    throw new ProjectSyncApiError(
      "MAINSEQUENCE_ENDPOINT must be an absolute HTTP(S) URL without embedded credentials.",
    );
  }
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/u, "");
}

export function resolveProjectSyncConfiguration({
  backendUrl,
  accessToken,
  env = process.env,
} = {}) {
  const endpoint = (backendUrl || env.MAINSEQUENCE_ENDPOINT || "").trim();
  const token = (accessToken || env.MAINSEQUENCE_ACCESS_TOKEN || "").trim();
  const missing = [];
  if (!endpoint) missing.push("MAINSEQUENCE_ENDPOINT");
  if (!token) missing.push("MAINSEQUENCE_ACCESS_TOKEN");
  return {
    available: missing.length === 0,
    backendUrl: endpoint ? normalizeBackendUrl(endpoint) : null,
    accessToken: token || null,
    missing,
  };
}

function responseDetail(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const detail = payload.detail || payload.message;
  return typeof detail === "string" && detail.trim() ? detail.trim() : null;
}

export function createProjectSyncApi({
  backendUrl,
  accessToken,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const normalizedBackendUrl = normalizeBackendUrl(backendUrl);
  const token = requireSingleLine(accessToken, "Main Sequence access token");
  if (typeof fetchImpl !== "function") {
    throw new ProjectSyncApiError("A Fetch-compatible backend transport is required.");
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new ProjectSyncApiError("Backend timeout must be a positive integer.");
  }

  async function request(method, path, body, { expectJson = true } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(`${normalizedBackendUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      });
    } catch (error) {
      const detail = error?.name === "AbortError" ? `timed out after ${timeoutMs}ms` : "failed";
      throw new ProjectSyncApiError(`Backend ${method} ${path} ${detail}.`, { cause: error });
    } finally {
      clearTimeout(timer);
    }

    let payload = null;
    const contentType = response.headers?.get?.("content-type") || "";
    const hasJson = contentType.toLowerCase().startsWith("application/json");
    if (hasJson && (expectJson || !response.ok)) {
      try {
        payload = await response.json();
      } catch (error) {
        throw new ProjectSyncApiError(`Backend ${method} ${path} returned invalid JSON.`, {
          cause: error,
        });
      }
    }
    if (response.status === 401) {
      throw new ProjectSyncApiError(
        "Backend authentication failed (401). Refresh MAINSEQUENCE_ACCESS_TOKEN.",
      );
    }
    if (!response.ok) {
      const suffix = responseDetail(payload);
      throw new ProjectSyncApiError(
        `Backend ${method} ${path} failed (${response.status})${suffix ? `: ${suffix}` : "."}`,
      );
    }
    if (expectJson && !hasJson) {
      throw new ProjectSyncApiError(`Backend ${method} ${path} did not return JSON.`);
    }
    return expectJson ? requireObject(payload, `Backend ${method} ${path} response`) : payload;
  }

  return {
    async resolveGitContext({ repositoryIdentity, repositoryBranch, commitSha } = {}) {
      const normalizedRepositoryIdentity = requireSingleLine(
        repositoryIdentity,
        "Git repository identity",
      );
      const normalizedBranch = requireSingleLine(repositoryBranch, "Git branch");
      const normalizedCommitSha = requireCanonicalCommitSha(commitSha, "Git HEAD commit");
      const payload = await request(
        "POST",
        "/api/v1/project-branches/resolve-git-context/",
        {
          repository_identity: normalizedRepositoryIdentity,
          repository_branch: normalizedBranch,
          commit_sha: normalizedCommitSha,
        },
      );
      const canonicalRepositoryIdentity = requireSingleLine(
        payload.canonical_repository_identity,
        "Resolved canonical repository identity",
      );
      if (canonicalRepositoryIdentity !== normalizedRepositoryIdentity) {
        throw new ProjectSyncApiError(
          "Git-context resolution returned another canonical repository identity.",
        );
      }
      const resolvedBranch = requireSingleLine(payload.repository_branch, "Resolved Git branch");
      if (resolvedBranch !== normalizedBranch) {
        throw new ProjectSyncApiError("Git-context resolution returned another Git branch.");
      }
      const repositoryRef = requireSingleLine(payload.repository_ref, "Resolved Git ref");
      if (repositoryRef !== `refs/heads/${normalizedBranch}`) {
        throw new ProjectSyncApiError("Git-context resolution returned another attached Git ref.");
      }
      const resolvedCommitSha = requireCanonicalCommitSha(
        payload.commit_sha,
        "Resolved Git commit",
      );
      if (resolvedCommitSha !== normalizedCommitSha) {
        throw new ProjectSyncApiError(
          "Git-context resolution returned another Git commit.",
        );
      }
      const projectBranch = requireObject(payload.project_branch, "Resolved ProjectBranch");
      const projectBranchUid = requireSingleLine(projectBranch.uid, "ProjectBranch UID");
      const projectUid = requireSingleLine(projectBranch.project_uid, "Project UID");
      if (
        requireSingleLine(projectBranch.repository_branch, "ProjectBranch Git branch") !==
        normalizedBranch
      ) {
        throw new ProjectSyncApiError("Resolved ProjectBranch belongs to another Git branch.");
      }
      return {
        canonicalRepositoryIdentity,
        gitBranch: resolvedBranch,
        repositoryRef,
        commitSha: resolvedCommitSha,
        projectUid,
        projectBranchUid,
      };
    },

    async addProjectDeployKey(projectUid, { keyTitle, publicKey } = {}) {
      const normalizedProjectUid = requireSingleLine(projectUid, "Project UID");
      const normalizedKeyTitle = requireSingleLine(keyTitle, "Deploy key title");
      const normalizedPublicKey = requireSingleLine(publicKey, "Deploy public key");
      await request(
        "POST",
        `/api/v1/projects/${encodeURIComponent(normalizedProjectUid)}/add-deploy-key/`,
        { key_title: normalizedKeyTitle, public_key: normalizedPublicKey },
        { expectJson: false },
      );
    },

    async renderDefaultRedeploymentTag(projectBranchUid, version) {
      const normalizedUid = requireSingleLine(projectBranchUid, "ProjectBranch UID");
      const normalizedVersion = requireSingleLine(version, "Project version");
      const payload = await request(
        "POST",
        `/api/v1/project-branches/${encodeURIComponent(normalizedUid)}/default-redeployment-tag/`,
        { version: normalizedVersion },
      );
      if (requireSingleLine(payload.version, "Rendered tag version") !== normalizedVersion) {
        throw new ProjectSyncApiError("Default redeployment tag response returned another version.");
      }
      return requireSingleLine(payload.tag_name, "Default redeployment tag name");
    },
  };
}
