import { createHash } from "node:crypto";
import { posix } from "node:path";

export const MCP_PROTOCOL_VERSION = "2025-11-25";
export const PLATFORM_ONTOLOGY_URI = "mainsequence://platform/ontology";
export const PLATFORM_SKILL_URI_PREFIX = "mainsequence://platform/skills/";
export const SUPPORTED_PLATFORM_MANIFEST_VERSIONS = new Set([2]);

const PLATFORM_ONTOLOGY_NAME = "Main Sequence platform ontology";
const PLATFORM_ONTOLOGY_PATH = "ontology/platform.json";
const MAX_RESOURCE_PAGES = 100;
const MAX_RESOURCE_COUNT = 1_000;
const MAX_SKILL_COUNT = 256;
const MAX_RESOURCE_BYTES = 1_048_576;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const SNAKE_NAME_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)*$/u;
const KEBAB_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export class McpPlatformSkillError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "McpPlatformSkillError";
  }
}

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new McpPlatformSkillError(`${label} must be an object.`);
  }
  return value;
}

function requireSingleLine(value, label) {
  if (typeof value !== "string" || !value.trim() || /[\r\n]/u.test(value)) {
    throw new McpPlatformSkillError(`${label} must be non-empty single-line text.`);
  }
  return value.trim();
}

function requireSha256(value, label) {
  const normalized = requireSingleLine(value, label).toLowerCase();
  if (!SHA256_PATTERN.test(normalized)) {
    throw new McpPlatformSkillError(`${label} must be a lowercase SHA-256.`);
  }
  return normalized;
}

function contentSha256(content) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function safeResourcePath(value, label) {
  const candidate = requireSingleLine(value, `${label} path`);
  if (
    candidate.includes("\\") ||
    candidate.startsWith("/") ||
    candidate !== posix.normalize(candidate) ||
    candidate.split("/").some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new McpPlatformSkillError(`${label} has an unsafe resource path.`);
  }
  return candidate;
}

function platformSkillSlug(uri, label) {
  if (!uri.startsWith(PLATFORM_SKILL_URI_PREFIX)) {
    throw new McpPlatformSkillError(
      `${label} URI must use ${PLATFORM_SKILL_URI_PREFIX}.`,
    );
  }
  const slug = uri.slice(PLATFORM_SKILL_URI_PREFIX.length);
  if (!KEBAB_NAME_PATTERN.test(slug)) {
    throw new McpPlatformSkillError(
      `${label} URI must end with a safe lowercase kebab-case skill name.`,
    );
  }
  return slug;
}

function validateSkillPath(path, label) {
  const parts = path.split("/");
  if (parts.length < 3 || parts[0] !== "skills") {
    throw new McpPlatformSkillError(
      `${label} path must be rooted under skills/ and contain a skill directory.`,
    );
  }
  if (!new Set(["SKILL.md", "SKILL.markdown"]).has(parts.at(-1))) {
    throw new McpPlatformSkillError(`${label} path must end with SKILL.md or SKILL.markdown.`);
  }
  if (parts.slice(1, -1).some((part) => !SNAKE_NAME_PATTERN.test(part))) {
    throw new McpPlatformSkillError(
      `${label} path directories must use safe lowercase snake case.`,
    );
  }
}

function validateSkillFrontmatter(content, expectedName, label) {
  const lines = content.split(/\r?\n/u);
  if (lines[0]?.trim() !== "---") {
    throw new McpPlatformSkillError(`${label} must start with YAML front matter.`);
  }
  const closingIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (closingIndex < 0) {
    throw new McpPlatformSkillError(`${label} front matter is not closed.`);
  }
  const frontmatter = lines.slice(1, closingIndex);
  const names = frontmatter
    .map((line) => line.match(/^name:\s*([a-z0-9]+(?:-[a-z0-9]+)*)\s*$/u)?.[1])
    .filter(Boolean);
  if (names.length !== 1 || names[0] !== expectedName) {
    throw new McpPlatformSkillError(
      `${label} front matter name must be ${JSON.stringify(expectedName)}.`,
    );
  }
  const descriptions = frontmatter
    .map((line) => line.match(/^description:\s*(\S(?:.*\S)?)\s*$/u)?.[1])
    .filter(Boolean);
  if (descriptions.length !== 1 || new Set(["|", ">"]).has(descriptions[0])) {
    throw new McpPlatformSkillError(
      `${label} front matter must declare one non-empty single-line description.`,
    );
  }
}

export function parsePlatformSkillDeclarations(ontologyContent) {
  if (typeof ontologyContent !== "string") {
    throw new McpPlatformSkillError("The platform ontology resource must contain UTF-8 text.");
  }
  let ontology;
  try {
    ontology = JSON.parse(ontologyContent);
  } catch (error) {
    throw new McpPlatformSkillError("The platform ontology resource must contain valid JSON.", {
      cause: error,
    });
  }
  requireObject(ontology, "Platform ontology payload");
  if (!Array.isArray(ontology.skill_resources)) {
    throw new McpPlatformSkillError(
      "The platform ontology must contain a skill_resources array.",
    );
  }
  if (ontology.skill_resources.length > MAX_SKILL_COUNT) {
    throw new McpPlatformSkillError(
      `The platform ontology exceeds the ${MAX_SKILL_COUNT}-skill safety limit.`,
    );
  }

  const names = new Set();
  const uris = new Set();
  const declarations = ontology.skill_resources.map((rawDeclaration, index) => {
    const label = `Platform ontology skill_resources[${index}]`;
    const declaration = requireObject(rawDeclaration, label);
    const name = requireSingleLine(declaration.name, `${label} name`);
    if (!SNAKE_NAME_PATTERN.test(name)) {
      throw new McpPlatformSkillError(`${label} name must use safe lowercase snake case.`);
    }
    const uri = requireSingleLine(declaration.uri, `${label} URI`);
    const frontmatterName = platformSkillSlug(uri, label);
    if (name !== frontmatterName.replaceAll("-", "_")) {
      throw new McpPlatformSkillError(`${label} name does not match its platform skill URI.`);
    }
    if (names.has(name)) {
      throw new McpPlatformSkillError(
        `The platform ontology declares duplicate skill name ${JSON.stringify(name)}.`,
      );
    }
    if (uris.has(uri)) {
      throw new McpPlatformSkillError(
        `The platform ontology declares duplicate skill URI ${JSON.stringify(uri)}.`,
      );
    }
    names.add(name);
    uris.add(uri);
    return { name, uri, frontmatterName };
  });
  return declarations.sort((left, right) =>
    `${left.name}\0${left.uri}`.localeCompare(`${right.name}\0${right.uri}`),
  );
}

export function validatePlatformSkillMembership(declarations, listedSkillUris) {
  const declared = new Set(declarations.map((item) => item.uri));
  const listed = new Set(listedSkillUris);
  const missing = [...declared].filter((uri) => !listed.has(uri)).sort();
  const undeclared = [...listed].filter((uri) => !declared.has(uri)).sort();
  if (missing.length === 0 && undeclared.length === 0) return;
  const details = [];
  if (missing.length > 0) details.push(`missing declared skills: ${missing.join(", ")}`);
  if (undeclared.length > 0) details.push(`undeclared listed skills: ${undeclared.join(", ")}`);
  throw new McpPlatformSkillError(
    `The platform MCP skill resources do not match ontology.skill_resources (${details.join("; ")}).`,
  );
}

function validateResourcePayload(rawRow, uri) {
  const label = `Platform resource ${JSON.stringify(uri)}`;
  const row = requireObject(rawRow, `${label} list row`);
  const metadata = requireObject(row._meta, `${label} list _meta`);
  if (metadata.owner_application !== "mcp_gateway") {
    throw new McpPlatformSkillError(`${label} is not owned by mcp_gateway.`);
  }
  const manifestVersion = metadata.manifest_version;
  if (!Number.isInteger(manifestVersion)) {
    throw new McpPlatformSkillError(`${label} has an invalid manifest version.`);
  }
  if (!SUPPORTED_PLATFORM_MANIFEST_VERSIONS.has(manifestVersion)) {
    throw new McpPlatformSkillError(
      `${label} uses unsupported platform manifest version ${manifestVersion}.`,
    );
  }
  const manifestSha256 = requireSha256(metadata.manifest_sha256, `${label} manifest hash`);
  const name = requireSingleLine(row.name, `${label} listed name`);
  const resourcePath = safeResourcePath(metadata.resource_path, label);
  const mimeType = requireSingleLine(row.mimeType, `${label} MIME type`);
  const size = row.size;
  if (!Number.isInteger(size) || size < 0 || size > MAX_RESOURCE_BYTES) {
    throw new McpPlatformSkillError(`${label} has an invalid content size.`);
  }
  const declaredSha256 = requireSha256(metadata.content_sha256, `${label} content hash`);
  const contentResponse = requireObject(row._content, `${label} read response`);
  if (contentResponse.uri !== uri) {
    throw new McpPlatformSkillError(`${label} read response returned a different URI.`);
  }
  if (contentResponse.mimeType !== mimeType) {
    throw new McpPlatformSkillError(`${label} read response MIME type mismatch.`);
  }
  if (typeof contentResponse.text !== "string") {
    throw new McpPlatformSkillError(`${label} content must be UTF-8 text.`);
  }
  const content = contentResponse.text;
  const actualSize = Buffer.byteLength(content, "utf8");
  const contentMetadata = requireObject(contentResponse._meta, `${label} read _meta`);
  const responseSha256 = requireSha256(contentMetadata.content_sha256, `${label} read hash`);
  if (contentSha256(content) !== declaredSha256 || responseSha256 !== declaredSha256) {
    throw new McpPlatformSkillError(`${label} content hash mismatch.`);
  }
  if (contentMetadata.owner_application !== "mcp_gateway") {
    throw new McpPlatformSkillError(`${label} read response is not owned by mcp_gateway.`);
  }
  if (
    contentMetadata.manifest_version !== manifestVersion ||
    contentMetadata.manifest_sha256 !== manifestSha256
  ) {
    throw new McpPlatformSkillError(`${label} read response manifest identity mismatch.`);
  }
  if (contentMetadata.resource_path !== resourcePath) {
    throw new McpPlatformSkillError(`${label} read response resource path mismatch.`);
  }
  if (contentMetadata.resource_name !== name) {
    throw new McpPlatformSkillError(`${label} read response resource name mismatch.`);
  }
  if (contentMetadata.content_size !== size || actualSize !== size) {
    throw new McpPlatformSkillError(`${label} content byte-size mismatch.`);
  }
  return {
    name,
    uri,
    resourcePath,
    content,
    contentSha256: declaredSha256,
    mimeType,
    size,
    manifestVersion,
    manifestSha256,
  };
}

export function parsePlatformSkillCatalog(rows, { sourceUrl }) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new McpPlatformSkillError("The platform returned no MCP skill resources.");
  }
  const normalizedSourceUrl = requireSingleLine(sourceUrl, "Platform source URL");
  const rowsByUri = new Map();
  for (const [index, rawRow] of rows.entries()) {
    const row = requireObject(rawRow, `Platform resource row ${index}`);
    const uri = requireSingleLine(row.uri, `Platform resource row ${index} URI`);
    if (rowsByUri.has(uri)) {
      throw new McpPlatformSkillError(
        `The platform MCP resource catalog returned duplicate URI ${JSON.stringify(uri)}.`,
      );
    }
    if (uri !== PLATFORM_ONTOLOGY_URI && !uri.startsWith(PLATFORM_SKILL_URI_PREFIX)) {
      throw new McpPlatformSkillError(`Unsupported platform skill resource URI ${JSON.stringify(uri)}.`);
    }
    rowsByUri.set(uri, row);
  }
  if (!rowsByUri.has(PLATFORM_ONTOLOGY_URI)) {
    throw new McpPlatformSkillError(
      `The platform MCP resource catalog is missing ${PLATFORM_ONTOLOGY_URI}.`,
    );
  }

  const validatedByUri = new Map(
    [...rowsByUri].map(([uri, row]) => [uri, validateResourcePayload(row, uri)]),
  );
  const ontologyPayload = validatedByUri.get(PLATFORM_ONTOLOGY_URI);
  if (ontologyPayload.name !== PLATFORM_ONTOLOGY_NAME) {
    throw new McpPlatformSkillError("The platform ontology resource has an unexpected name.");
  }
  if (ontologyPayload.resourcePath !== PLATFORM_ONTOLOGY_PATH) {
    throw new McpPlatformSkillError(
      "The platform ontology resource has an unexpected resource path.",
    );
  }
  if (ontologyPayload.mimeType !== "application/json") {
    throw new McpPlatformSkillError("The platform ontology resource must use application/json.");
  }

  const declarations = parsePlatformSkillDeclarations(ontologyPayload.content);
  validatePlatformSkillMembership(
    declarations,
    [...validatedByUri.keys()].filter((uri) => uri !== PLATFORM_ONTOLOGY_URI),
  );
  for (const [uri, resource] of validatedByUri) {
    if (
      resource.manifestVersion !== ontologyPayload.manifestVersion ||
      resource.manifestSha256 !== ontologyPayload.manifestSha256
    ) {
      throw new McpPlatformSkillError(
        `Platform resource ${JSON.stringify(uri)} does not describe the ontology manifest revision.`,
      );
    }
  }

  const destinationPaths = new Set();
  const managedRoots = new Set();
  const skills = declarations.map((declaration) => {
    const resource = validatedByUri.get(declaration.uri);
    const label = `Platform resource ${JSON.stringify(declaration.uri)}`;
    if (resource.name !== declaration.name) {
      throw new McpPlatformSkillError(
        `${label} listed name does not match ontology.skill_resources.`,
      );
    }
    if (resource.mimeType !== "text/markdown") {
      throw new McpPlatformSkillError(`${label} must use text/markdown.`);
    }
    validateSkillPath(resource.resourcePath, label);
    validateSkillFrontmatter(resource.content, declaration.frontmatterName, label);
    const relativePath = resource.resourcePath.split("/").slice(1).join("/");
    const managedRoot = posix.dirname(relativePath);
    if (destinationPaths.has(relativePath) || managedRoots.has(managedRoot)) {
      throw new McpPlatformSkillError(
        `${label} resolves to duplicate managed destination ${managedRoot}.`,
      );
    }
    destinationPaths.add(relativePath);
    managedRoots.add(managedRoot);
    return { ...resource, relativePath, managedRoot };
  });
  const orderedManagedRoots = [...managedRoots].sort();
  for (let index = 0; index < orderedManagedRoots.length; index += 1) {
    for (let nestedIndex = index + 1; nestedIndex < orderedManagedRoots.length; nestedIndex += 1) {
      if (orderedManagedRoots[nestedIndex].startsWith(`${orderedManagedRoots[index]}/`)) {
        throw new McpPlatformSkillError(
          `Platform skill destinations may not be nested (${orderedManagedRoots[index]} contains ${orderedManagedRoots[nestedIndex]}).`,
        );
      }
    }
  }

  const ontology = { ...ontologyPayload, name: "ontology" };
  return {
    sourceUrl: normalizedSourceUrl,
    manifestVersion: ontologyPayload.manifestVersion,
    manifestSha256: ontologyPayload.manifestSha256,
    ontology,
    ontologyUri: ontology.uri,
    ontologySha256: ontology.contentSha256,
    resources: [ontology, ...skills],
    skills,
  };
}

function normalizeMcpUrl(value) {
  const candidate = requireSingleLine(value, "MCP URL");
  let url;
  try {
    url = new URL(candidate);
  } catch (error) {
    throw new McpPlatformSkillError("MCP URL must be an absolute HTTP(S) URL.", { cause: error });
  }
  if (!new Set(["http:", "https:"]).has(url.protocol) || url.username || url.password) {
    throw new McpPlatformSkillError(
      "MCP URL must be an absolute HTTP(S) URL without embedded credentials.",
    );
  }
  url.hash = "";
  return url.toString();
}

export function resolveMcpConfiguration({ mcpUrl, accessToken, env = process.env } = {}) {
  const explicitUrl =
    mcpUrl || env.COMMAND_CENTER_SDK_MCP_URL || env.MAINSEQUENCE_MCP_URL || "";
  const endpoint = env.MAINSEQUENCE_ENDPOINT?.trim();
  const resolvedUrl = explicitUrl.trim()
    ? normalizeMcpUrl(explicitUrl)
    : endpoint
      ? normalizeMcpUrl(
          endpoint.replace(/\/+$/u, "").endsWith("/mcp")
            ? endpoint
            : `${endpoint.replace(/\/+$/u, "")}/mcp`,
        )
      : null;
  const resolvedAccessToken = (accessToken || env.MAINSEQUENCE_ACCESS_TOKEN || "").trim();
  const missing = [];
  if (!resolvedUrl) missing.push("MCP URL (COMMAND_CENTER_SDK_MCP_URL or MAINSEQUENCE_ENDPOINT)");
  if (!resolvedAccessToken) missing.push("MAINSEQUENCE_ACCESS_TOKEN");
  return {
    available: missing.length === 0,
    mcpUrl: resolvedUrl,
    accessToken: resolvedAccessToken || null,
    missing,
  };
}

async function jsonRpcRequest({
  mcpUrl,
  accessToken,
  fetchImpl,
  timeoutMs,
  method,
  params,
  requestId,
  protocolVersion,
}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (protocolVersion) headers["MCP-Protocol-Version"] = protocolVersion;
  let response;
  try {
    response = await fetchImpl(mcpUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params }),
      signal: controller.signal,
    });
  } catch (error) {
    const detail = error?.name === "AbortError" ? `timed out after ${timeoutMs}ms` : "failed";
    throw new McpPlatformSkillError(`MCP ${method} request ${detail}.`, { cause: error });
  } finally {
    clearTimeout(timer);
  }
  if (response.status === 401) {
    throw new McpPlatformSkillError("MCP authentication failed (401). Refresh the access token.");
  }
  if (!response.ok) {
    throw new McpPlatformSkillError(`MCP ${method} request failed (${response.status}).`);
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new McpPlatformSkillError(`MCP ${method} response was not JSON.`);
  }
  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw new McpPlatformSkillError(`MCP ${method} response was not valid JSON.`, {
      cause: error,
    });
  }
  requireObject(payload, `MCP ${method} response`);
  if (payload.jsonrpc !== "2.0" || payload.id !== requestId) {
    throw new McpPlatformSkillError(`MCP ${method} response identity is invalid.`);
  }
  if (payload.error !== undefined && payload.error !== null) {
    const rpcError = requireObject(payload.error, `MCP ${method} error`);
    throw new McpPlatformSkillError(
      `MCP ${method} failed with error ${rpcError.code}: ${rpcError.message || "Unknown MCP error."}`,
    );
  }
  return requireObject(payload.result, `MCP ${method} result`);
}

export async function fetchPlatformSkillCatalog({
  mcpUrl,
  accessToken,
  clientVersion,
  fetchImpl = globalThis.fetch,
  timeoutMs = 15_000,
} = {}) {
  const normalizedUrl = normalizeMcpUrl(mcpUrl);
  const token = requireSingleLine(accessToken, "MCP access token");
  if (typeof fetchImpl !== "function") {
    throw new McpPlatformSkillError("A Fetch-compatible MCP transport is required.");
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new McpPlatformSkillError("MCP timeout must be a positive integer.");
  }

  const initialize = await jsonRpcRequest({
    mcpUrl: normalizedUrl,
    accessToken: token,
    fetchImpl,
    timeoutMs,
    method: "initialize",
    params: {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: {
        name: "command-center-sdk",
        version: requireSingleLine(clientVersion, "SDK client version"),
      },
    },
    requestId: 1,
  });
  if (initialize.protocolVersion !== MCP_PROTOCOL_VERSION) {
    throw new McpPlatformSkillError(
      `MCP initialize negotiated unsupported protocol version ${JSON.stringify(initialize.protocolVersion)}.`,
    );
  }
  const serverCapabilities = requireObject(initialize.capabilities, "MCP server capabilities");
  requireObject(serverCapabilities.resources, "MCP server resource capability");

  const resources = [];
  const seenCursors = new Set();
  let cursor = null;
  let requestId = 2;
  for (let page = 0; page < MAX_RESOURCE_PAGES; page += 1) {
    const result = await jsonRpcRequest({
      mcpUrl: normalizedUrl,
      accessToken: token,
      fetchImpl,
      timeoutMs,
      method: "resources/list",
      params: cursor ? { cursor } : {},
      requestId,
      protocolVersion: MCP_PROTOCOL_VERSION,
    });
    requestId += 1;
    if (!Array.isArray(result.resources)) {
      throw new McpPlatformSkillError("MCP resources/list did not return a resource array.");
    }
    resources.push(...result.resources);
    if (resources.length > MAX_RESOURCE_COUNT) {
      throw new McpPlatformSkillError(
        `MCP resources/list exceeds the ${MAX_RESOURCE_COUNT}-resource safety limit.`,
      );
    }
    if (result.nextCursor === undefined || result.nextCursor === null) break;
    const nextCursor = requireSingleLine(result.nextCursor, "MCP resources/list nextCursor");
    if (seenCursors.has(nextCursor)) {
      throw new McpPlatformSkillError("MCP resources/list repeated a pagination cursor.");
    }
    seenCursors.add(nextCursor);
    cursor = nextCursor;
    if (page === MAX_RESOURCE_PAGES - 1) {
      throw new McpPlatformSkillError(
        `MCP resources/list exceeded the ${MAX_RESOURCE_PAGES}-page safety limit.`,
      );
    }
  }

  const resourcesByUri = new Map();
  for (const rawResource of resources) {
    const resource = requireObject(rawResource, "MCP listed resource");
    const uri = requireSingleLine(resource.uri, "MCP listed resource URI");
    if (resourcesByUri.has(uri)) {
      throw new McpPlatformSkillError(`MCP resources/list returned duplicate URI ${JSON.stringify(uri)}.`);
    }
    resourcesByUri.set(uri, resource);
  }
  const ontologyListRow = resourcesByUri.get(PLATFORM_ONTOLOGY_URI);
  if (!ontologyListRow) {
    throw new McpPlatformSkillError(
      `MCP resources/list did not return ${PLATFORM_ONTOLOGY_URI}.`,
    );
  }

  async function readResource(uri, rawResource, id) {
    const result = await jsonRpcRequest({
      mcpUrl: normalizedUrl,
      accessToken: token,
      fetchImpl,
      timeoutMs,
      method: "resources/read",
      params: { uri },
      requestId: id,
      protocolVersion: MCP_PROTOCOL_VERSION,
    });
    if (!Array.isArray(result.contents) || result.contents.length !== 1) {
      throw new McpPlatformSkillError(
        `MCP resources/read for ${JSON.stringify(uri)} must return exactly one content item.`,
      );
    }
    return { ...rawResource, _content: requireObject(result.contents[0], "MCP resource content") };
  }

  const ontologyRow = await readResource(
    PLATFORM_ONTOLOGY_URI,
    ontologyListRow,
    requestId,
  );
  requestId += 1;
  const declarations = parsePlatformSkillDeclarations(ontologyRow._content.text);
  const listedSkillUris = [...resourcesByUri.keys()].filter((uri) =>
    uri.startsWith(PLATFORM_SKILL_URI_PREFIX),
  );
  validatePlatformSkillMembership(declarations, listedSkillUris);
  const skillRows = await Promise.all(
    declarations.map((declaration, index) =>
      readResource(declaration.uri, resourcesByUri.get(declaration.uri), requestId + index),
    ),
  );
  return parsePlatformSkillCatalog([ontologyRow, ...skillRows], {
    sourceUrl: normalizedUrl,
  });
}
