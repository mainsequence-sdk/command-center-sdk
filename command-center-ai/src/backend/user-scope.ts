function normalizeUserUid(value: string | null | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function requireCreatedByUserUid(
  value: string | null | undefined,
  context: string,
) {
  const normalizedUserUid = normalizeUserUid(value);

  if (!normalizedUserUid) {
    throw new Error(`${context} requires created_by_user_uid.`);
  }

  if (/^\d+$/.test(normalizedUserUid)) {
    throw new Error(
      `${context} requires the public user uid, not the legacy numeric user id.`,
    );
  }

  return normalizedUserUid;
}

export function appendCreatedByUserUidSearchParam(
  requestPath: string,
  createdByUserUid: string | null | undefined,
) {
  const normalizedUserUid = normalizeUserUid(createdByUserUid);

  if (!normalizedUserUid) {
    return requestPath;
  }

  const requestUrl = new URL(requestPath, "http://assistant.local");
  requestUrl.searchParams.delete("created_by_user");
  requestUrl.searchParams.set("created_by_user_uid", normalizedUserUid);

  return `${requestUrl.pathname}${requestUrl.search}${requestUrl.hash}`;
}
