import type { WidgetContractId } from "./widget-contracts.js";
import type { TabularFrameFieldSchema, TabularFrameSourceV1 } from "./tabular-frame-source.js";
import type { WidgetRuntimeUpdateEnvelope } from "./runtime-update.js";

export const RUNTIME_DATA_REF_KIND = "runtime-data-ref" as const;
export const RUNTIME_DATA_REF_CONTEXT_KEY = "runtimeDataRef" as const;

export interface RuntimeDataRef {
  kind: typeof RUNTIME_DATA_REF_KIND;
  refId: string;
  workspaceRuntimeId: string;
  ownerId: string;
  outputId: string;
  contractId: WidgetContractId;
  version: number;
  rowCount?: number;
  schemaSignature?: string;
  updatedAtMs?: number;
}

export interface RuntimeTabularFrameRef extends RuntimeDataRef {
  contractId: "core.tabular_frame@v1";
  columns: string[];
  fields?: TabularFrameFieldSchema[];
  status?: TabularFrameSourceV1["status"];
  error?: string;
}

export interface RuntimeRetentionPolicy {
  maxRows?: number;
}

export interface RuntimeRowSelector {
  direction?: "earliest" | "latest";
  limit?: number;
  offset?: number;
}

export interface RuntimeMergeKeyMapping {
  seedField: string;
  liveField: string;
}

export interface RuntimeDataStore {
  readonly workspaceRuntimeId: string;
  putSnapshot(input: {
    ownerId: string;
    outputId: string;
    frame: TabularFrameSourceV1;
    refKey?: string;
  }): RuntimeTabularFrameRef;
  applyDelta(input: {
    ownerId: string;
    outputId: string;
    baseRef?: RuntimeTabularFrameRef;
    deltaFrame: TabularFrameSourceV1;
    mergeKeyFields: string[];
    retention?: RuntimeRetentionPolicy;
    refKey?: string;
  }): {
    outputRef: RuntimeTabularFrameRef;
    deltaRef: RuntimeTabularFrameRef;
    operations: NonNullable<WidgetRuntimeUpdateEnvelope["operations"]>;
  };
  combine(input: {
    ownerId: string;
    outputId: string;
    seedRef?: RuntimeTabularFrameRef | null;
    liveRef?: RuntimeTabularFrameRef | null;
    seedFrame?: TabularFrameSourceV1 | null;
    liveFrame?: TabularFrameSourceV1 | null;
    mergeKeyFields: string[];
    mergeKeyMappings?: RuntimeMergeKeyMapping[];
    retention?: RuntimeRetentionPolicy;
    refKey?: string;
    signature?: string;
  }): RuntimeTabularFrameRef | null;
  readFrame(ref: RuntimeTabularFrameRef): TabularFrameSourceV1 | null;
  readRows(ref: RuntimeTabularFrameRef, selector?: RuntimeRowSelector): Array<Record<string, unknown>>;
  releaseOwner(ownerId: string): void;
}
