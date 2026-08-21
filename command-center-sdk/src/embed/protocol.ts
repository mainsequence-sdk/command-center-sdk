import { assertJsonSerializable } from "../contracts/index.js";

export const IFRAME_BRIDGE_PROTOCOL_VERSION = "command-center-iframe@v1" as const;

export interface ScopedCapabilityToken {
  token: string;
  capability: string;
  audience: string;
  expiresAtMs: number;
}

interface BridgeMessageBase {
  protocol: typeof IFRAME_BRIDGE_PROTOCOL_VERSION;
  instanceId: string;
  sequence: number;
}

export type HostToEmbedMessage =
  | (BridgeMessageBase & { type: "host:init"; props: Record<string, unknown>; theme: Record<string, string>; locale: string; capabilityTokens?: ScopedCapabilityToken[] })
  | (BridgeMessageBase & { type: "host:inputs"; inputs: Record<string, unknown> })
  | (BridgeMessageBase & { type: "host:resize"; width: number; height: number })
  | (BridgeMessageBase & { type: "host:dispose" });

export type EmbedToHostMessage =
  | (BridgeMessageBase & { type: "embed:ready" })
  | (BridgeMessageBase & { type: "embed:outputs"; outputs: Record<string, unknown> })
  | (BridgeMessageBase & { type: "embed:user-state"; state: Record<string, unknown> })
  | (BridgeMessageBase & { type: "embed:request-size"; width?: number; height?: number })
  | (BridgeMessageBase & { type: "embed:error"; message: string; code?: string });

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseEmbedToHostMessage(value: unknown): EmbedToHostMessage | null {
  if (!isRecord(value) || value.protocol !== IFRAME_BRIDGE_PROTOCOL_VERSION) return null;
  if (typeof value.instanceId !== "string" || typeof value.sequence !== "number" || !Number.isSafeInteger(value.sequence) || value.sequence < 0) return null;
  switch (value.type) {
    case "embed:ready":
      return value as unknown as EmbedToHostMessage;
    case "embed:outputs":
      return isRecord(value.outputs) ? value as unknown as EmbedToHostMessage : null;
    case "embed:user-state":
      return isRecord(value.state) ? value as unknown as EmbedToHostMessage : null;
    case "embed:request-size":
      return (value.width === undefined || (typeof value.width === "number" && Number.isFinite(value.width) && value.width >= 0)) &&
        (value.height === undefined || (typeof value.height === "number" && Number.isFinite(value.height) && value.height >= 0))
        ? value as unknown as EmbedToHostMessage : null;
    case "embed:error":
      return typeof value.message === "string" &&
        (value.code === undefined || typeof value.code === "string")
        ? value as unknown as EmbedToHostMessage
        : null;
    default:
      return null;
  }
}

export function parseHostToEmbedMessage(value: unknown): HostToEmbedMessage | null {
  if (!isRecord(value) || value.protocol !== IFRAME_BRIDGE_PROTOCOL_VERSION) return null;
  if (typeof value.instanceId !== "string" || typeof value.sequence !== "number" || !Number.isSafeInteger(value.sequence) || value.sequence < 0) return null;
  switch (value.type) {
    case "host:init":
      return isRecord(value.props) &&
        isRecord(value.theme) &&
        Object.values(value.theme).every((entry) => typeof entry === "string") &&
        typeof value.locale === "string" &&
        (value.capabilityTokens === undefined || (
          Array.isArray(value.capabilityTokens) &&
          value.capabilityTokens.every((entry) =>
            isRecord(entry) &&
            typeof entry.token === "string" &&
            typeof entry.capability === "string" &&
            typeof entry.audience === "string" &&
            typeof entry.expiresAtMs === "number" &&
            Number.isFinite(entry.expiresAtMs) &&
            entry.expiresAtMs > Date.now()
          )
        ))
        ? value as unknown as HostToEmbedMessage
        : null;
    case "host:inputs":
      return isRecord(value.inputs) ? value as unknown as HostToEmbedMessage : null;
    case "host:resize":
      return typeof value.width === "number" && Number.isFinite(value.width) && value.width >= 0 &&
        typeof value.height === "number" && Number.isFinite(value.height) && value.height >= 0
        ? value as unknown as HostToEmbedMessage
        : null;
    case "host:dispose":
      return value as unknown as HostToEmbedMessage;
    default:
      return null;
  }
}

export function assertHostMessage(message: HostToEmbedMessage): void {
  assertJsonSerializable(message, "iframe host message");
  if (message.type === "host:init") {
    (message.capabilityTokens ?? []).forEach((token) => {
      if (!token.token || !token.capability || !token.audience || token.expiresAtMs <= Date.now()) {
        throw new Error("Iframe capability tokens must be scoped, audience-bound, and unexpired.");
      }
    });
  }
}
