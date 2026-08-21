import type { RuntimeDataRef } from "./runtime-data.js";

export const WIDGET_RUNTIME_UPDATE_CONTRACT_VERSION = "widget-runtime-update@v1" as const;
export const WIDGET_RUNTIME_UPDATE_CONTEXT_KEY = "runtimeUpdate" as const;

export type WidgetRuntimeUpdateMode = "snapshot" | "delta";
export type WidgetRuntimePublicationSemantics = "incremental";
export type WidgetRuntimePublicationRole = "seed" | "update";

export interface WidgetRuntimeUpdateRange {
  from?: string;
  to?: string;
}

export interface WidgetRuntimeUpdateOperations {
  appended?: number;
  patched?: number;
  replaced?: number;
  removed?: number;
  pruned?: number;
  returned?: number;
  retained?: number;
}

export interface WidgetRuntimeUpdateEnvelope<
  TRetainedOutput = unknown,
  TDeltaOutput = unknown,
> {
  contractVersion: typeof WIDGET_RUNTIME_UPDATE_CONTRACT_VERSION;
  mode: WidgetRuntimeUpdateMode;
  publicationSemantics?: WidgetRuntimePublicationSemantics;
  publicationRole?: WidgetRuntimePublicationRole;
  sourceRunId?: string;
  sequence?: number;
  sourceWidgetId?: string;
  sourceOutputId?: string;
  outputContractId?: string;
  retainedOutputLocation?: "carrier" | "envelope";
  retainedOutput?: TRetainedOutput;
  deltaOutput?: TDeltaOutput;
  retainedOutputRef?: RuntimeDataRef;
  deltaOutputRef?: RuntimeDataRef;
  outputRef?: RuntimeDataRef;
  range?: WidgetRuntimeUpdateRange;
  retainedRange?: WidgetRuntimeUpdateRange;
  watermarkBeforeMs?: number;
  watermarkAfterMs?: number;
  operations?: WidgetRuntimeUpdateOperations;
  diagnostics?: Record<string, unknown>;
}

export interface WidgetRuntimeUpdateParts<
  TBase = unknown,
  TDelta = unknown,
> {
  upstreamBase: TBase;
  upstreamDelta?: TDelta;
  upstreamUpdate?: WidgetRuntimeUpdateEnvelope<TBase, TDelta>;
  upstreamBaseRef?: RuntimeDataRef;
  upstreamDeltaRef?: RuntimeDataRef;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function attachWidgetRuntimeUpdateContext<
  TOutput extends { source?: { context?: Record<string, unknown> } },
>(output: TOutput, update: WidgetRuntimeUpdateEnvelope): TOutput {
  return {
    ...output,
    source: {
      ...output.source,
      context: {
        ...(output.source?.context ?? {}),
        [WIDGET_RUNTIME_UPDATE_CONTEXT_KEY]: update,
      },
    },
  };
}

export function readWidgetRuntimeUpdateContext(
  output: unknown,
): WidgetRuntimeUpdateEnvelope | undefined {
  if (!isPlainRecord(output) || !isPlainRecord(output.source)) {
    return undefined;
  }

  const context = output.source.context;

  if (!isPlainRecord(context)) {
    return undefined;
  }

  const update = context[WIDGET_RUNTIME_UPDATE_CONTEXT_KEY];

  return isPlainRecord(update) &&
    update.contractVersion === WIDGET_RUNTIME_UPDATE_CONTRACT_VERSION &&
    (update.mode === "snapshot" || update.mode === "delta")
    ? (update as unknown as WidgetRuntimeUpdateEnvelope)
    : undefined;
}

export function resolveWidgetRuntimeUpdateParts<TBase = unknown, TDelta = unknown>(
  output: TBase,
): WidgetRuntimeUpdateParts<TBase, TDelta> {
  const update = readWidgetRuntimeUpdateContext(output) as
    | WidgetRuntimeUpdateEnvelope<TBase, TDelta>
    | undefined;

  if (!update) {
    return {
      upstreamBase: output,
    };
  }

  const upstreamBase =
    update.retainedOutputLocation === "envelope" && update.retainedOutput !== undefined
      ? update.retainedOutput
      : output;

  return {
    upstreamBase: upstreamBase as TBase,
    upstreamDelta: update.mode === "delta" ? update.deltaOutput : undefined,
    upstreamUpdate: update,
    upstreamBaseRef: update.outputRef ?? update.retainedOutputRef,
    upstreamDeltaRef: update.mode === "delta" ? update.deltaOutputRef : undefined,
  };
}

export function projectWidgetRuntimeUpdateOutput<
  TBase extends { source?: { context?: Record<string, unknown> } },
  TDelta = unknown,
>(
  output: TBase,
  options?: {
    outputContractId?: string;
    sourceOutputId?: string;
  },
) {
  const parts = resolveWidgetRuntimeUpdateParts<TBase, TDelta>(output);
  const update = parts.upstreamUpdate;

  if (!update) {
    return output;
  }

  const carrier =
    update.mode === "delta" && parts.upstreamDelta !== undefined
      ? (parts.upstreamDelta as unknown as TBase)
      : parts.upstreamBase;

  return attachWidgetRuntimeUpdateContext(carrier, {
    ...update,
    sourceOutputId: options?.sourceOutputId ?? update.sourceOutputId,
    outputContractId: options?.outputContractId ?? update.outputContractId,
    retainedOutputLocation:
      carrier === parts.upstreamBase ? "carrier" : "envelope",
    retainedOutput:
      carrier === parts.upstreamBase ? undefined : parts.upstreamBase,
    retainedOutputRef: update.retainedOutputRef ?? update.outputRef,
    deltaOutputRef: update.deltaOutputRef,
    outputRef: update.outputRef,
  });
}

export function mapWidgetRuntimeUpdateEnvelope<TBase = unknown, TDelta = unknown>(
  update: WidgetRuntimeUpdateEnvelope,
  output: {
    mode?: WidgetRuntimeUpdateMode;
    outputContractId?: string;
    upstreamBase: TBase;
    upstreamDelta?: TDelta;
    diagnostics?: Record<string, unknown>;
    preserveOutputRefs?: boolean;
  },
): WidgetRuntimeUpdateEnvelope<TBase, TDelta> {
  const mode = output.mode ?? update.mode;
  const preserveOutputRefs = output.preserveOutputRefs === true;

  return {
    ...update,
    mode,
    outputContractId: output.outputContractId ?? update.outputContractId,
    retainedOutputLocation: "carrier",
    retainedOutput: undefined,
    deltaOutput: mode === "delta" ? output.upstreamDelta : undefined,
    retainedOutputRef: preserveOutputRefs ? (update.retainedOutputRef ?? update.outputRef) : undefined,
    deltaOutputRef: preserveOutputRefs ? update.deltaOutputRef : undefined,
    outputRef: preserveOutputRefs ? update.outputRef : undefined,
    diagnostics: output.diagnostics
      ? {
          ...(update.diagnostics ?? {}),
          ...output.diagnostics,
        }
      : update.diagnostics,
  };
}
