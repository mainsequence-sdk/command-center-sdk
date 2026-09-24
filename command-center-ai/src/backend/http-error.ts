function normalizeErrorField(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

const runtimeErrorMetadataFields = new Set([
  "code",
  "request_id",
  "status",
  "status_code",
]);

function errorPath(parent: string, field: string) {
  if (field === "non_field_errors") return parent;
  return parent ? `${parent}.${field}` : field;
}

function collectRuntimeErrorMessages(
  value: unknown,
  path = "",
  messages: string[] = [],
): string[] {
  const message = normalizeErrorField(value);
  if (message) {
    messages.push(path ? `${path}: ${message}` : message);
    return messages;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      const entryPath =
        entry && typeof entry === "object" ? `${path}[${index}]` : path;
      collectRuntimeErrorMessages(entry, entryPath, messages);
    });
    return messages;
  }

  if (!value || typeof value !== "object") return messages;

  Object.entries(value as Record<string, unknown>).forEach(([field, entry]) => {
    if (runtimeErrorMetadataFields.has(field)) return;
    collectRuntimeErrorMessages(entry, errorPath(path, field), messages);
  });
  return messages;
}

function extractRuntimeErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  if (!Array.isArray(payload)) {
    const candidate = payload as Record<string, unknown>;
    const directMessage =
      normalizeErrorField(candidate.message) ??
      normalizeErrorField(candidate.detail) ??
      normalizeErrorField(candidate.error) ??
      normalizeErrorField(candidate.error_detail);
    if (directMessage) return directMessage;
  }

  const messages = collectRuntimeErrorMessages(payload);
  return messages.length > 0 ? Array.from(new Set(messages)).join("; ") : null;
}

export function formatRuntimeHttpStatus(response: Response) {
  return response.statusText
    ? `HTTP ${response.status} ${response.statusText}`
    : `HTTP ${response.status}`;
}

export async function readRuntimeBackendErrorMessage(
  response: Response,
  fallbackMessage: string,
) {
  const responseClone = response.clone();
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const payload = (await responseClone.json().catch(() => null)) as unknown;
    return extractRuntimeErrorMessage(payload) ?? fallbackMessage;
  }

  const rawText = await responseClone.text().catch(() => "");
  if (rawText.trim()) {
    try {
      const payload = JSON.parse(rawText) as unknown;
      return extractRuntimeErrorMessage(payload) ?? rawText.trim();
    } catch {
      return rawText.trim();
    }
  }

  return fallbackMessage;
}

export async function buildRuntimeHttpErrorMessage({
  fallbackMessage,
  method,
  operation,
  response,
  url,
}: {
  fallbackMessage: string;
  method: string;
  operation: string;
  response: Response;
  url: string;
}) {
  const backendMessage = await readRuntimeBackendErrorMessage(
    response,
    fallbackMessage,
  );

  return `${operation}. Status: ${formatRuntimeHttpStatus(response)}. Call: ${method.toUpperCase()} ${url}. Backend response: ${backendMessage}`;
}
