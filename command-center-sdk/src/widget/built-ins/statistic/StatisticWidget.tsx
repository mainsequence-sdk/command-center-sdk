import type { WidgetComponentProps, WidgetSettingsComponentProps } from "../../index.js";

import { buildStatisticCards, resolveStatisticFrame, type StatisticMode, type StatisticWidgetProps } from "./model.js";

export function StatisticWidget({ props, resolvedInputs }: WidgetComponentProps<StatisticWidgetProps>) {
  const frame = resolveStatisticFrame(resolvedInputs);
  if (!frame) return <div className="cc-core-widget cc-core-widget__empty">Bind this statistic to a canonical tabular source.</div>;
  if (frame.status === "error") return <div className="cc-core-widget cc-core-widget__empty">{frame.error ?? "The source failed."}</div>;
  const cards = buildStatisticCards(frame, props);
  if (cards.length === 0) return <div className="cc-core-widget cc-core-widget__empty">No statistic values are available.</div>;
  const columns = Math.max(1, Math.min(8, Number(props.columnCount) || Math.min(cards.length, 4)));
  return <div className="cc-core-widget cc-core-statistic-grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>{cards.map((card) => <div className="cc-core-statistic-card" key={card.id}><div className="cc-core-statistic-card__label">{card.label}</div><div className="cc-core-statistic-card__value">{card.formattedValue}</div></div>)}</div>;
}

const modes: StatisticMode[] = ["last", "first", "sum", "mean", "min", "max", "count"];
export function StatisticWidgetSettings({ draftProps, editable, onDraftPropsChange }: WidgetSettingsComponentProps<StatisticWidgetProps>) {
  const update = (patch: Partial<StatisticWidgetProps>) => onDraftPropsChange({ ...draftProps, ...patch });
  return <div className="cc-core-widget__settings">
    <label>Statistic mode<select value={draftProps.statisticMode ?? "last"} disabled={!editable} onChange={(event) => update({ statisticMode: event.target.value as StatisticMode })}>{modes.map((mode) => <option key={mode}>{mode}</option>)}</select></label>
    <label>Value field<input value={draftProps.valueField ?? ""} disabled={!editable} onChange={(event) => update({ valueField: event.target.value || undefined })} /></label>
    <label>Group field<input value={draftProps.groupField ?? ""} disabled={!editable} onChange={(event) => update({ groupField: event.target.value || undefined })} /></label>
    <label>Order field<input value={draftProps.orderField ?? ""} disabled={!editable} onChange={(event) => update({ orderField: event.target.value || undefined })} /></label>
    <label>Decimals<input type="number" min={0} max={6} value={draftProps.decimals ?? 2} disabled={!editable} onChange={(event) => update({ decimals: Math.max(0, Math.min(6, Number(event.target.value))) })} /></label>
  </div>;
}
