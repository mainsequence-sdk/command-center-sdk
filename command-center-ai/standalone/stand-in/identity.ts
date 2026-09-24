import type { StandInRequest } from "./http";

/** Who and where the stand-in serves, and what it tells the chat about the Agent's runtime. */
export interface StandInIdentity {
  /** The platform API URL the connect form is prefilled with. Requests match by path, any origin. */
  platformUrl: string;
  /** The person, until the chat names another on a user-scoped read. */
  userUid: string;
  /** The Organization Environment, until the chat names another on a scoped read. */
  environmentUid: string;
  /** The Agent the connect form is prefilled with. The stand-in answers for any Agent uid. */
  agentUid: string;
  /** The name every Agent of the stand-in carries. */
  agentName: string;
  /** The `rpc_url` that runtime access returns. Nothing under it reaches the network. */
  runtimeUrl: string;
  /** The runtime token that runtime access returns and every runtime request must carry. */
  runtimeToken: string;
}

export const standInIdentity: Readonly<StandInIdentity> = Object.freeze({
  platformUrl: "https://platform.stand-in.test",
  userUid: "00000000-0000-4000-8000-000000000001",
  environmentUid: "00000000-0000-4000-8000-000000000002",
  agentUid: "00000000-0000-4000-8000-000000000003",
  agentName: "Stand-in Agent",
  runtimeUrl: "https://agent-runtime.stand-in.test",
  runtimeToken: "stand-in-runtime-token",
});

export type StandInUidKind =
  | "session"
  | "handle"
  | "custom-provider"
  | "custom-model"
  | "sign-in-attempt";

const UID_PREFIXES: Record<StandInUidKind, string> = {
  session: "1",
  handle: "2",
  "custom-provider": "3",
  "custom-model": "4",
  "sign-in-attempt": "5",
};

/** What every part of the stand-in shares: the time, new uids, the person, and the Environment. */
export interface StandInContext {
  identity: Readonly<StandInIdentity>;
  now: () => string;
  /** Uids count up per kind, so the same script gives the same uids. */
  nextUid: (kind: StandInUidKind) => string;
  personUid: () => string;
  environmentUid: () => string;
  /**
   * Takes the person and the Environment a scoped read names. The platform knows both from the
   * token and the Agent; the stand-in accepts any token, so it follows what the chat says.
   */
  adopt: (request: StandInRequest) => void;
}

export function createStandInContext(identity: Readonly<StandInIdentity>): StandInContext {
  const counters = new Map<StandInUidKind, number>();
  let personUid = identity.userUid;
  let environmentUid = identity.environmentUid;

  return {
    identity,
    now: () => new Date().toISOString(),
    nextUid: (kind) => {
      const count = (counters.get(kind) ?? 0) + 1;
      counters.set(kind, count);
      return `00000000-0000-4000-8000-${UID_PREFIXES[kind]}${String(count).padStart(11, "0")}`;
    },
    personUid: () => personUid,
    environmentUid: () => environmentUid,
    adopt: (request) => {
      personUid = request.query.get("created_by_user_uid")?.trim() || personUid;
      environmentUid = request.query.get("organization_environment_uid")?.trim() || environmentUid;
    },
  };
}
