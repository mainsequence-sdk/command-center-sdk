import {
  IFRAME_BRIDGE_PROTOCOL_VERSION,
  assertHostMessage,
  parseEmbedToHostMessage,
  type EmbedToHostMessage,
  type HostToEmbedMessage,
} from "./protocol.js";

export interface IframeBridgeHostOptions {
  instanceId: string;
  targetOrigin: string;
  targetWindow: Pick<Window, "postMessage">;
  maxPayloadBytes?: number;
  handshakeTimeoutMs?: number;
  onMessage: (message: EmbedToHostMessage) => void;
  onProtocolError?: (message: string) => void;
}

type StripBridgeEnvelope<T> = T extends unknown
  ? Omit<T, "protocol" | "instanceId" | "sequence">
  : never;
export type HostToEmbedPayload = StripBridgeEnvelope<HostToEmbedMessage>;

export interface IframeBridgeHost {
  post(message: HostToEmbedPayload): void;
  handleMessage(event: Pick<MessageEvent, "origin" | "source" | "data">): boolean;
  dispose(): void;
  readonly ready: boolean;
}

let nextHostSequenceBase = 0;

function allocateHostSequenceBase(): number {
  nextHostSequenceBase += 1_000_000;
  return nextHostSequenceBase;
}

export function createIframeBridgeHost(options: IframeBridgeHostOptions): IframeBridgeHost {
  if (options.targetOrigin === "*" || !/^https:\/\//.test(options.targetOrigin)) {
    throw new Error("Iframe bridge targetOrigin must be an exact HTTPS origin.");
  }
  const maxPayloadBytes = options.maxPayloadBytes ?? 256_000;
  let outgoingSequence = allocateHostSequenceBase();
  let incomingSequence = -1;
  let ready = false;
  let disposed = false;
  const timeout = setTimeout(() => {
    if (!ready && !disposed) options.onProtocolError?.("Iframe bridge handshake timed out.");
  }, options.handshakeTimeoutMs ?? 10_000);

  function payloadSize(value: unknown): number {
    try {
      return new TextEncoder().encode(JSON.stringify(value)).byteLength;
    } catch {
      return Number.POSITIVE_INFINITY;
    }
  }

  return {
    get ready() { return ready; },
    post(message) {
      if (disposed) throw new Error("Iframe bridge is disposed.");
      const payload = {
        ...message,
        protocol: IFRAME_BRIDGE_PROTOCOL_VERSION,
        instanceId: options.instanceId,
        sequence: outgoingSequence++,
      } as HostToEmbedMessage;
      assertHostMessage(payload);
      if (payloadSize(payload) > maxPayloadBytes) throw new Error("Iframe bridge payload exceeds the configured limit.");
      options.targetWindow.postMessage(payload, options.targetOrigin);
    },
    handleMessage(event) {
      if (disposed || event.origin !== options.targetOrigin || event.source !== options.targetWindow) return false;
      if (payloadSize(event.data) > maxPayloadBytes) {
        options.onProtocolError?.("Iframe bridge payload exceeds the configured limit.");
        return false;
      }
      const message = parseEmbedToHostMessage(event.data);
      if (!message || message.instanceId !== options.instanceId || message.sequence <= incomingSequence) {
        options.onProtocolError?.("Rejected malformed, replayed, or mismatched iframe message.");
        return false;
      }
      incomingSequence = message.sequence;
      if (message.type === "embed:ready") {
        ready = true;
        clearTimeout(timeout);
      }
      options.onMessage(message);
      return true;
    },
    dispose() {
      disposed = true;
      ready = false;
      clearTimeout(timeout);
    },
  };
}
