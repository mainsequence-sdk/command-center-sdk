import { useMemo, useState } from "react";
import { Braces, Play } from "lucide-react";
import type { WidgetComponentProps, WidgetSettingsComponentProps } from "../../index.js";
import { executePortableAppComponent } from "./execution.js";
import {
  buildDefaultAppComponentMockJsonDefinition,
  inferAppComponentMockBindingSpec,
  normalizeAppComponentProps,
  normalizeAppComponentRuntimeState,
  type AppComponentBindingSpec,
  type AppComponentMockJsonDefinition,
  type AppComponentWidgetProps,
} from "./model.js";

function JsonEditor<T>({
  disabled,
  label,
  onChange,
  value,
}: {
  disabled: boolean;
  label: string;
  onChange: (value: T | undefined) => void;
  value: T | undefined;
}) {
  const [source, setSource] = useState(() => JSON.stringify(value ?? null, null, 2));
  const [error, setError] = useState<string>();
  return (
    <label>
      <span>{label}</span>
      <textarea
        disabled={disabled}
        rows={12}
        value={source}
        onChange={(event) => {
          const next = event.currentTarget.value;
          setSource(next);
          try {
            const parsed = JSON.parse(next) as T | null;
            setError(undefined);
            onChange(parsed ?? undefined);
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Enter valid JSON.");
          }
        }}
      />
      {error ? <small className="cc-core-widget__error">{error}</small> : null}
    </label>
  );
}

export function AppComponentWidget({
  instanceId,
  onRuntimeStateChange,
  props: rawProps,
  resolvedInputs,
  runtimeState: rawRuntimeState,
  widget,
}: WidgetComponentProps<AppComponentWidgetProps>) {
  const props = normalizeAppComponentProps(rawProps);
  const state = normalizeAppComponentRuntimeState(rawRuntimeState);
  const bindingSpec = useMemo(() => props.bindingSpec ??
    (props.apiTargetMode === "mock-json" && props.mockJson
      ? inferAppComponentMockBindingSpec(props.mockJson)
      : undefined), [props]);
  const [submitting, setSubmitting] = useState(false);
  const draftValues = state.draftValues ?? {};
  const visiblePorts = (bindingSpec?.requestPorts ?? []).filter((port) =>
    props.requestInputMap?.fields[port.fieldKey]?.visibleOnCard !== false,
  );

  const updateDraft = (fieldKey: string, value: string) => {
    onRuntimeStateChange?.({
      ...state,
      draftValues: { ...draftValues, [fieldKey]: value },
    });
  };
  const submit = async () => {
    setSubmitting(true);
    const result = await executePortableAppComponent({
      executionSurface: "private-dashboard",
      widgetId: widget.id,
      instanceId: instanceId ?? widget.id,
      reason: "manual-submit",
      props,
      runtimeState: state,
      resolvedInputs,
    });
    onRuntimeStateChange?.(result.runtimeStatePatch);
    setSubmitting(false);
  };

  if (!bindingSpec) {
    return <div className="cc-core-widget cc-core-widget__empty">Configure an operation or Mock JSON definition in widget settings.</div>;
  }

  return (
    <div className="cc-core-widget cc-core-app-component">
      {props.showHeader ? (
        <header className="cc-core-app-component__header">
          <Braces size={18} aria-hidden="true" />
          <strong>{props.mockJson?.operation.summary ?? bindingSpec.operationKey}</strong>
          <span>{bindingSpec.operationKey}</span>
        </header>
      ) : null}
      <div className={`cc-core-app-component__form cc-core-app-component__form--${props.compactCardLayout}`}>
        {visiblePorts.map((port) => {
          const label = props.requestInputMap?.fields[port.fieldKey]?.label ?? port.label;
          return (
            <label key={port.id}>
              <span>{label}{port.required ? " *" : ""}</span>
              {port.kind === "boolean" ? (
                <select value={draftValues[port.fieldKey] ?? ""} onChange={(event) => updateDraft(port.fieldKey, event.currentTarget.value)}>
                  <option value="">Select</option><option value="true">Yes</option><option value="false">No</option>
                </select>
              ) : (
                <input
                  type={port.kind === "number" || port.kind === "integer" ? "number" : port.kind === "date" ? "date" : port.kind === "date-time" ? "datetime-local" : "text"}
                  value={draftValues[port.fieldKey] ?? props.requestInputMap?.fields[port.fieldKey]?.prefillValue ?? ""}
                  onChange={(event) => updateDraft(port.fieldKey, event.currentTarget.value)}
                />
              )}
              {port.description ? <small>{port.description}</small> : null}
            </label>
          );
        })}
      </div>
      {!props.hideRequestButton ? (
        <button className="cc-core-app-component__submit" disabled={submitting} type="button" onClick={() => void submit()}>
          <Play size={15} aria-hidden="true" /> {submitting ? "Running…" : props.requestButtonLabel}
        </button>
      ) : null}
      {state.error ? <p className="cc-core-widget__error">{state.error}</p> : null}
      {props.showResponse && state.lastResponseStatus ? (
        <section className="cc-core-app-component__response">
          <strong>{state.lastResponseStatus} {state.lastResponseStatusText}</strong>
          <pre>{JSON.stringify(state.lastResponseBody, null, 2)}</pre>
        </section>
      ) : null}
    </div>
  );
}

export function AppComponentWidgetSettings({
  draftProps,
  editable,
  onDraftPropsChange,
}: WidgetSettingsComponentProps<AppComponentWidgetProps>) {
  const props = normalizeAppComponentProps(draftProps);
  const update = (patch: Partial<AppComponentWidgetProps>) => onDraftPropsChange({ ...draftProps, ...patch });
  return (
    <div className="cc-core-widget__settings">
      <label>
        <span>Target mode</span>
        <select disabled={!editable} value={props.apiTargetMode} onChange={(event) => {
          const apiTargetMode = event.currentTarget.value;
          update({
            apiTargetMode,
            mockJson: apiTargetMode === "mock-json"
              ? props.mockJson ?? buildDefaultAppComponentMockJsonDefinition()
              : props.mockJson,
          });
        }}>
          <option value="mock-json">Mock JSON</option>
          <option value="manual">Manual API</option>
        </select>
      </label>
      {props.apiTargetMode === "manual" ? <>
        <label><span>API base URL</span><input disabled={!editable} type="url" value={props.apiBaseUrl ?? ""} onChange={(event) => update({ apiBaseUrl: event.currentTarget.value })} /></label>
        <label><span>HTTP method</span><select disabled={!editable} value={props.method ?? "get"} onChange={(event) => update({ method: event.currentTarget.value as AppComponentWidgetProps["method"] })}>{["get", "post", "put", "patch", "delete"].map((entry) => <option key={entry} value={entry}>{entry.toUpperCase()}</option>)}</select></label>
        <label><span>Operation path</span><input disabled={!editable} value={props.path ?? ""} onChange={(event) => update({ path: event.currentTarget.value })} /></label>
        <label><span>Authentication</span><select disabled={!editable} value={props.authMode} onChange={(event) => update({ authMode: event.currentTarget.value as AppComponentWidgetProps["authMode"] })}><option value="none">No authentication</option><option value="session-jwt">Host session JWT</option></select></label>
        {props.authMode === "session-jwt" ? <small>A trusted host adapter must supply session authentication.</small> : null}
        <JsonEditor<AppComponentBindingSpec> disabled={!editable} label="Compiled binding specification" value={props.bindingSpec} onChange={(bindingSpec) => update({ bindingSpec })} />
      </> : (
        <JsonEditor<AppComponentMockJsonDefinition> disabled={!editable} label="Mock JSON definition" value={props.mockJson} onChange={(mockJson) => update({ mockJson })} />
      )}
      <label><span>Submit button label</span><input disabled={!editable} value={props.requestButtonLabel ?? "Submit"} onChange={(event) => update({ requestButtonLabel: event.currentTarget.value })} /></label>
      <label><input disabled={!editable} type="checkbox" checked={props.showResponse === true} onChange={(event) => update({ showResponse: event.currentTarget.checked })} /> Show response</label>
      <label><input disabled={!editable} type="checkbox" checked={props.refreshOnDashboardRefresh !== false} onChange={(event) => update({ refreshOnDashboardRefresh: event.currentTarget.checked })} /> Run on dashboard refresh</label>
    </div>
  );
}
