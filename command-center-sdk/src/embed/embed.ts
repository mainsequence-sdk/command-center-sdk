import {
  IFRAME_BRIDGE_PROTOCOL_VERSION,
  parseHostToEmbedMessage,
  type EmbedToHostMessage,
  type HostToEmbedMessage,
} from "./protocol.js";
import { assertJsonSerializable } from "../contracts/index.js";

type EmbedPayload<T extends EmbedToHostMessage = EmbedToHostMessage> = T extends unknown
  ? Omit<T, "protocol" | "instanceId" | "sequence">
  : never;

export interface IframeBridgeEmbed {
  handleMessage(event: Pick<MessageEvent, "origin" | "source" | "data">): boolean;
  post(message: EmbedPayload): void;
  dispose(): void;
}

export function createIframeBridgeEmbed(options: {
  instanceId: string;
  hostOrigin: string;
  parentWindow: Pick<Window, "postMessage">;
  onMessage: (message: HostToEmbedMessage) => void;
  maxPayloadBytes?: number;
}): IframeBridgeEmbed {
  if (options.hostOrigin === "*" || !/^https:\/\//.test(options.hostOrigin)) {
    throw new Error("Iframe embed hostOrigin must be an exact HTTPS origin.");
  }
  const maxPayloadBytes = options.maxPayloadBytes ?? 256_000;
  let outgoingSequence = 0;
  let incomingSequence = -1;
  let disposed = false;
  const size = (value: unknown) => {
    try {
      return new TextEncoder().encode(JSON.stringify(value)).byteLength;
    } catch {
      return Number.POSITIVE_INFINITY;
    }
  };

  return {
    handleMessage(event) {
      if (
        disposed ||
        event.origin !== options.hostOrigin ||
        event.source !== options.parentWindow ||
        size(event.data) > maxPayloadBytes
      ) {
        return false;
      }
      const message = parseHostToEmbedMessage(event.data);
      if (
        !message ||
        message.instanceId !== options.instanceId ||
        message.sequence <= incomingSequence
      ) {
        return false;
      }
      incomingSequence = message.sequence;
      options.onMessage(message);
      if (message.type === "host:dispose") disposed = true;
      return true;
    },
    post(message) {
      if (disposed) throw new Error("Iframe embed bridge is disposed.");
      const payload = {
        ...message,
        protocol: IFRAME_BRIDGE_PROTOCOL_VERSION,
        instanceId: options.instanceId,
        sequence: outgoingSequence++,
      } as EmbedToHostMessage;
      assertJsonSerializable(payload, "iframe embed message");
      if (size(payload) > maxPayloadBytes) {
        throw new Error("Iframe embed payload exceeds the configured limit.");
      }
      options.parentWindow.postMessage(payload, options.hostOrigin);
    },
    dispose() {
      disposed = true;
    },
  };
}
