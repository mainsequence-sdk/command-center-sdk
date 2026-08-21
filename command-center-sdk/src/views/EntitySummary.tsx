import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";

import type {
  EntitySummary as EntitySummaryModel,
  EntitySummaryField,
  EntitySummaryItem,
  EntitySummaryStat,
} from "../resource/types.js";

export type {
  EntitySummaryField,
  EntitySummaryItem,
  EntitySummaryStat,
} from "../resource/types.js";

type EditableSummaryItem = EntitySummaryField | EntitySummaryStat;

export interface EntitySummaryProps {
  actions?: ReactNode;
  summary: EntitySummaryModel;
  renderFieldLead?: (field: EntitySummaryField) => ReactNode;
  onAddLabel?: (label: string) => Promise<void> | void;
  onEditItem?: (item: EditableSummaryItem) => void;
  onLinkSelect?: (url: string, item: EntitySummaryItem) => void;
  onRemoveLabel?: (label: string) => Promise<void> | void;
  onLabelMutationError?: (error: unknown) => void;
}

function getValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Not available";
  if (Array.isArray(value)) return value.length ? value.map(getValue).join(", ") : "Not available";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "[object]";
    }
  }
  return String(value);
}

function truncateMiddle(value: string, maxLength = 44) {
  if (value.length <= maxLength) return value;
  const head = value.slice(0, Math.ceil(maxLength / 2) - 2);
  const tail = value.slice(-Math.floor(maxLength / 2) + 1);
  return `${head}...${tail}`;
}

function getLink(item: EntitySummaryItem) {
  if (typeof item.link_url === "string" && item.link_url.trim()) return item.link_url.trim();
  if ("href" in item && typeof item.href === "string" && item.href.trim()) return item.href.trim();
  return null;
}

function isEditable(item: EditableSummaryItem) {
  return item.edit?.enabled === true;
}

function openUrl(url: string) {
  if (typeof window === "undefined") return;
  if (/^https?:\/\//.test(url)) {
    window.open(url, "_blank", "noopener,noreferrer");
  } else {
    window.location.assign(url);
  }
}

function toneClass(tone?: string) {
  return tone ? ` cc-entity-summary--${tone}` : "";
}

function EditButton({ item, onEdit }: { item: EditableSummaryItem; onEdit?: (item: EditableSummaryItem) => void }) {
  if (!onEdit || !isEditable(item)) return null;
  return (
    <button
      aria-label={`Edit ${item.label}`}
      className="cc-entity-summary__icon-button"
      onClick={(event) => {
        event.stopPropagation();
        onEdit(item);
      }}
      title={`Edit ${item.label}`}
      type="button"
    >
      <span aria-hidden="true">✎</span>
    </button>
  );
}

function LinkedValue({
  children,
  className,
  item,
  onLinkSelect,
}: {
  children: ReactNode;
  className?: string;
  item: EntitySummaryItem;
  onLinkSelect?: EntitySummaryProps["onLinkSelect"];
}) {
  const link = getLink(item);
  if (!link) return <span className={className}>{children}</span>;
  return (
    <button
      className={`cc-entity-summary__link${className ? ` ${className}` : ""}`}
      onClick={() => (onLinkSelect ? onLinkSelect(link, item) : openUrl(link))}
      title={link}
      type="button"
    >
      <span>{children}</span><span aria-hidden="true">↗</span>
    </button>
  );
}

function FieldLead({ field, renderFieldLead }: { field: EntitySummaryField; renderFieldLead?: EntitySummaryProps["renderFieldLead"] }) {
  if (field.image) {
    return <img alt={field.image_alt ?? field.label} className="cc-entity-summary__field-image" src={field.image} />;
  }
  return renderFieldLead?.(field) ?? null;
}

export function EntitySummary({
  actions,
  onAddLabel,
  onEditItem,
  onLabelMutationError,
  onLinkSelect,
  onRemoveLabel,
  renderFieldLead,
  summary,
}: EntitySummaryProps) {
  const summaryLabels = summary.label_management?.labels ?? summary.labels ?? [];
  const [labels, setLabels] = useState(summaryLabels);
  const [labelInput, setLabelInput] = useState("");
  const [labelInputOpen, setLabelInputOpen] = useState(false);
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);
  const displayedLabels = useMemo(
    () => Array.from(new Set(labels.map((label) => label.trim()).filter(Boolean))),
    [labels],
  );
  const canAddLabel = Boolean(onAddLabel);
  const canRemoveLabel = Boolean(onRemoveLabel);

  useEffect(() => {
    setLabels(summaryLabels);
    setLabelInput("");
    setLabelInputOpen(false);
  }, [summary.entity.id, summary.entity.type, summary.label_management?.labels, summary.labels]);

  async function addLabel(rawLabel: string) {
    const label = rawLabel.trim();
    if (!label || displayedLabels.includes(label) || !onAddLabel) return;
    setPendingLabel(label);
    try {
      await onAddLabel(label);
      setLabels((current) => [...current, label]);
      setLabelInput("");
      setLabelInputOpen(false);
    } catch (error) {
      onLabelMutationError?.(error);
    } finally {
      setPendingLabel(null);
    }
  }

  async function removeLabel(label: string) {
    if (!onRemoveLabel) return;
    setPendingLabel(label);
    try {
      await onRemoveLabel(label);
      setLabels((current) => current.filter((candidate) => candidate !== label));
    } catch (error) {
      onLabelMutationError?.(error);
    } finally {
      setPendingLabel(null);
    }
  }

  function onLabelKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setLabelInput("");
      setLabelInputOpen(false);
    } else if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      void addLabel(labelInput);
    } else if (event.key === "Backspace" && !labelInput && displayedLabels.length) {
      event.preventDefault();
      void removeLabel(displayedLabels[displayedLabels.length - 1]!);
    }
  }

  return (
    <section className="cc-entity-summary">
      <div className="cc-entity-summary__top">
        <div className="cc-entity-summary__identity">
          <h2>{summary.entity.title}</h2>
          <div className="cc-entity-summary__inline-fields">
            {summary.inline_fields.map((field) => {
              const value = getValue(field.value);
              return (
                <div className="cc-entity-summary__inline-field" key={field.key} title={field.meta || value}>
                  <FieldLead field={field} renderFieldLead={renderFieldLead} />
                  {(!field.icon && !field.image) || field.kind === "code" ? <span>{field.label}</span> : null}
                  <LinkedValue className={field.kind === "code" ? "cc-entity-summary__code" : undefined} item={field} onLinkSelect={onLinkSelect}>
                    {field.kind === "code" ? truncateMiddle(value) : value}
                  </LinkedValue>
                  <EditButton item={field} onEdit={onEditItem} />
                </div>
              );
            })}
          </div>
        </div>
        {actions ? <div className="cc-entity-summary__actions">{actions}</div> : null}
      </div>

      {summary.badges.length ? (
        <div className="cc-entity-summary__badges">
          {summary.badges.map((badge) => {
            const badgeNode = <span className={`cc-entity-summary__badge${toneClass(badge.tone)}`}>{badge.label}</span>;
            const link = getLink(badge);
            return link ? <button className="cc-entity-summary__badge-button" key={badge.key} onClick={() => (onLinkSelect ? onLinkSelect(link, badge) : openUrl(link))} type="button">{badgeNode}</button> : <span key={badge.key}>{badgeNode}</span>;
          })}
        </div>
      ) : null}

      {displayedLabels.length || canAddLabel ? (
        <div className="cc-entity-summary__labels">
          <span className="cc-entity-summary__label-heading">⌑ Labels</span>
          {displayedLabels.map((label) => (
            <span className="cc-entity-summary__label" key={label}>
              {label}
              {canRemoveLabel ? <button aria-label={`Remove ${label} label`} disabled={Boolean(pendingLabel)} onClick={() => void removeLabel(label)} type="button">{pendingLabel === label ? "…" : "×"}</button> : null}
            </span>
          ))}
          {canAddLabel && labelInputOpen ? <input aria-label="New label" autoFocus disabled={Boolean(pendingLabel)} onBlur={() => { if (!labelInput.trim()) setLabelInputOpen(false); }} onChange={(event) => setLabelInput(event.currentTarget.value)} onKeyDown={onLabelKeyDown} placeholder="Type a label" value={labelInput} /> : null}
          {canAddLabel ? <button aria-label="Add label" className="cc-entity-summary__add-label" disabled={Boolean(pendingLabel)} onClick={() => setLabelInputOpen((current) => !current)} type="button">+</button> : null}
        </div>
      ) : null}

      {summary.summary_warning ? <div className="cc-entity-summary__warning"><span aria-hidden="true">⚠</span><span>{summary.summary_warning}</span></div> : null}

      {summary.highlight_fields.length || summary.stats.length ? (
        <div className="cc-entity-summary__facts">
          {summary.highlight_fields.map((field) => (
            <div className="cc-entity-summary__fact" key={field.key} title={field.meta || getValue(field.value)}>
              <div className="cc-entity-summary__fact-label"><FieldLead field={field} renderFieldLead={renderFieldLead} /><span>{field.label}</span>{field.info ? <span className="cc-entity-summary__info" title={field.info}>i</span> : null}<EditButton item={field} onEdit={onEditItem} /></div>
              {field.kind === "badges" && Array.isArray(field.value) ? <div className="cc-entity-summary__badges">{field.value.length ? field.value.map((value, index) => <span className={`cc-entity-summary__badge${toneClass(field.tone)}`} key={`${field.key}-${index}`}>{String(value)}</span>) : <span>Not available</span>}</div> : <LinkedValue className={`cc-entity-summary__fact-value${toneClass(field.tone)}`} item={field} onLinkSelect={onLinkSelect}>{getValue(field.value)}</LinkedValue>}
              {field.meta ? <div className="cc-entity-summary__meta">{field.meta}</div> : null}
            </div>
          ))}
          {summary.stats.map((stat) => (
            <div className="cc-entity-summary__fact" key={stat.key} title={stat.info ?? stat.label}>
              <div className="cc-entity-summary__fact-label"><span>{stat.label}</span><EditButton item={stat} onEdit={onEditItem} /></div>
              <LinkedValue className="cc-entity-summary__stat-value" item={stat} onLinkSelect={onLinkSelect}>{stat.display}</LinkedValue>
              {stat.info ? <div className="cc-entity-summary__meta">{stat.info}</div> : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
