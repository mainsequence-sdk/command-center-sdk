// The inputs a chat application gives the engine. The engine reads no environment, no router and
// no application store; everything it needs from the application arrives through these.

/** The signed-in person: the platform token sent with every request and the person's user uid. */
/**
 * Who is signed in, and, for an application without a platform request sender on the connection,
 * the token its clients send. With a sender the package never reads `token`: the application owns
 * authentication.
 */
export interface ChatAuth {
  token?: string | null;
  tokenType?: string;
  userUid: string | null;
}

export type ChatNoticeVariant = "info" | "success" | "error";

/** A short message the application shows the person, for example as a toast. */
export interface ChatNotice {
  title: string;
  description?: string;
  variant?: ChatNoticeVariant;
}

export type ChatNotify = (notice: ChatNotice) => void;

/**
 * Where the default session stands.
 * - `idle`: the surface on screen does not show the default session.
 * - `loading`: the application's source for the Agent is not ready yet.
 * - `missing`: no Agent is configured.
 * - `opening`: the session behind the handle is being fetched or created.
 * - `ready`: it is selected.
 * - `error`: it could not be opened, or the source failed.
 */
export type DefaultSessionStatus = "idle" | "loading" | "missing" | "opening" | "ready" | "error";

/**
 * The session a chat opens for one Agent behind a stable handle. The platform returns the same
 * session for the same person, Agent and handle, so every visit continues the same conversation.
 */
export interface ChatDefaultSession {
  /** The Agent whose session opens; null when none is configured. */
  agentUid: string | null;
  handleUniqueId: string;
  /** The session's name when it is created. */
  name: string;
  /** Whether the application's source for the Agent (for example its settings) is ready. */
  status?: "loading" | "ready" | "error";
  /** Shown when the session cannot be opened. */
  unavailableMessage?: string;
}

/** An Agent to open once the chat is visible: its latest session, or a new one. */
export interface ChatLaunchTarget {
  agentId: string | number;
  label?: string | null;
  /** Changes when the same Agent is launched again. */
  launchKey: number;
}
