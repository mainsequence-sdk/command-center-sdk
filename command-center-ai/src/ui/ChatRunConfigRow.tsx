import { useChatUi } from "./chat-ui-context.js";
import { cx } from "./class-names.js";
import { Select } from "./Select.js";

const selectClassName = "ms-chat-run-config__select";

export interface ChatRunConfigOption {
  disabled?: boolean;
  label: string;
  value: string;
}

export interface ChatRunConfigRowProps {
  provider?: string;
  providerOptions?: ReadonlyArray<{ label: string; value: string }>;
  onProviderChange?: (value: string) => void;
  model: string;
  modelOptions: ReadonlyArray<ChatRunConfigOption>;
  onModelChange: (value: string) => void;
  reasoningEffort: string;
  reasoningEffortOptions: ReadonlyArray<{ label: string; value: string }>;
  onReasoningEffortChange: (value: string) => void;
  disabled?: boolean;
  listboxPlacement?: "bottom" | "top";
  className?: string;
}

/**
 * The chat's provider, model and thinking picker. The composer shows it under
 * the input; the "choose a model" state shows the same row when a session
 * cannot start without a model.
 */
export function ChatRunConfigRow({
  provider,
  providerOptions,
  onProviderChange,
  model,
  modelOptions,
  onModelChange,
  reasoningEffort,
  reasoningEffortOptions,
  onReasoningEffortChange,
  disabled = false,
  listboxPlacement = "top",
  className,
}: ChatRunConfigRowProps) {
  const { onOpenModelProviderSettings } = useChatUi();
  const hasProviderOptions = (providerOptions?.length ?? 0) > 0;
  const hasReasoningEffortOptions = reasoningEffortOptions.length > 0;

  return (
    <div className={cx("ms-chat-run-config", className)} data-chat-run-config>
      {hasProviderOptions ? (
        <Select
          actionLabel="Sign in to provider"
          actionOnSelect={onOpenModelProviderSettings}
          aria-label="Provider"
          className={selectClassName}
          disabled={disabled}
          fitContent
          listboxPlacement={listboxPlacement}
          value={provider}
          onChange={(event) => {
            onProviderChange?.(event.target.value);
          }}
        >
          {(providerOptions ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      ) : null}
      <Select
        aria-label="Model"
        className={selectClassName}
        disabled={disabled}
        fitContent
        listboxPlacement={listboxPlacement}
        value={model}
        onChange={(event) => {
          onModelChange(event.target.value);
        }}
      >
        {modelOptions.map((option) => (
          <option key={option.value} value={option.value} disabled={Boolean(option.disabled)}>
            {option.label}
          </option>
        ))}
      </Select>
      {hasReasoningEffortOptions ? (
        <Select
          aria-label="Reasoning effort"
          className={selectClassName}
          disabled={disabled}
          fitContent
          listboxPlacement={listboxPlacement}
          value={reasoningEffort}
          onChange={(event) => {
            onReasoningEffortChange(event.target.value);
          }}
        >
          {reasoningEffortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      ) : null}
    </div>
  );
}
