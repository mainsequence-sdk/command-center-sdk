const DEFAULT_TIMEOUT_MS = 15_000;

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

  async function requestJson(method, path, body) {
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
    if (contentType.toLowerCase().startsWith("application/json")) {
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
    if (!contentType.toLowerCase().startsWith("application/json")) {
      throw new ProjectSyncApiError(`Backend ${method} ${path} did not return JSON.`);
    }
    return requireObject(payload, `Backend ${method} ${path} response`);
  }

  return {
    async resolveProjectBranch(projectUid, repositoryBranch) {
      const normalizedProjectUid = requireSingleLine(projectUid, "Project UID");
      const normalizedBranch = requireSingleLine(repositoryBranch, "Git branch");
      const project = await requestJson(
        "GET",
        `/api/v1/projects/${encodeURIComponent(normalizedProjectUid)}/`,
      );
      if (!Array.isArray(project.branches) || project.branches.length === 0) {
        throw new ProjectSyncApiError("This Project has no ProjectBranches.");
      }
      const matches = project.branches.filter(
        (branch) =>
          branch &&
          typeof branch === "object" &&
          !Array.isArray(branch) &&
          branch.repository_branch === normalizedBranch,
      );
      if (matches.length !== 1) {
        throw new ProjectSyncApiError(
          `Git branch ${JSON.stringify(normalizedBranch)} is not registered as a ProjectBranch for this Project.`,
        );
      }
      const listedUid = requireSingleLine(matches[0].uid, "Resolved ProjectBranch UID");
      const projectBranch = await requestJson(
        "GET",
        `/api/v1/project-branches/${encodeURIComponent(listedUid)}/`,
      );
      const projectBranchUid = requireSingleLine(projectBranch.uid, "ProjectBranch UID");
      if (projectBranchUid !== listedUid) {
        throw new ProjectSyncApiError("ProjectBranch detail returned another UID.");
      }
      if (
        projectBranch.repository_branch !== undefined &&
        projectBranch.repository_branch !== normalizedBranch
      ) {
        throw new ProjectSyncApiError("ProjectBranch detail returned another repository branch.");
      }
      return { gitBranch: normalizedBranch, projectBranchUid };
    },

    async renderDefaultRedeploymentTag(projectBranchUid, version) {
      const normalizedUid = requireSingleLine(projectBranchUid, "ProjectBranch UID");
      const normalizedVersion = requireSingleLine(version, "Project version");
      const payload = await requestJson(
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
