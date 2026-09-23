import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { Loader2, Send, Square, Trash2 } from "lucide-react";

import { Badge, Button, Input, Textarea } from "@dev-mainsequence/command-center-sdk/controls";

import {
  buildCustomModelDirectChatUrl,
  CustomModelDirectChatError,
  getCustomModelDirectChatBlockReason,
  streamCustomModelDirectChat,
  type CustomModelDirectChatErrorStage,
  type CustomModelDirectChatMessage,
  type CustomModelDirectChatResult,
} from "../backend/custom-model-direct-chat.js";
import type {
  CustomModelProviderApi,
  CustomModelProviderHeaderInput,
  CustomModelThinkingLevel,
} from "../backend/custom-model-provider-api.js";
import { Dialog } from "../ui/Dialog.js";
import { PasswordInput } from "../ui/PasswordInput.js";
import { Select } from "../ui/Select.js";

export interface CustomModelTestChatTarget {
  providerLabel: string;
  baseUrl: string;
  model: string;
  displayName: string;
  api: CustomModelProviderApi;
  reasoning: boolean;
  thinkingLevels: CustomModelThinkingLevel[];
  /**
   * `stored` secrets never reach the browser, so the tester re-enters them here.
   * `draft` secrets come from the unsaved provider form that opened this dialog.
   */
  auth:
    | { kind: "stored"; hasApiKey: boolean; headerNames: string[] }
    | { kind: "draft"; apiKey: string; headers: CustomModelProviderHeaderInput[] };
}

interface Exchange {
  id: number;
  prompt: string;
  reply: string;
  reasoning: string;
  status: "streaming" | "done" | "stopped" | "error";
  result: CustomModelDirectChatResult | null;
  error: { stage: CustomModelDirectChatErrorStage; message: string } | null;
}

const errorStageLabels: Record<CustomModelDirectChatErrorStage, string> = {
  aborted: "Stopped",
  auth: "Authentication",
  blocked: "Blocked by the browser",
  http: "Endpoint error",
  network: "Network or CORS",
  not_found: "Not found",
  protocol: "Protocol mismatch",
};

function formatDuration(milliseconds: number) {
  return milliseconds >= 1000
    ? `${(milliseconds / 1000).toFixed(1)} s`
    : `${Math.round(milliseconds)} ms`;
}

function formatResultSummary(result: CustomModelDirectChatResult) {
  const parts = [`HTTP ${result.status}`, `${formatDuration(result.latencyMs)} total`];
  if (result.firstTokenMs !== null) {
    parts.push(`first token ${formatDuration(result.firstTokenMs)}`);
  }
  if (result.usage) {
    parts.push(`${result.usage.inputTokens ?? "?"} in / ${result.usage.outputTokens ?? "?"} out tokens`);
  }
  if (result.finishReason) parts.push(`finish: ${result.finishReason}`);
  return parts.join(" · ");
}

function includedInHistory(exchange: Exchange) {
  return (exchange.status === "done" || exchange.status === "stopped") && Boolean(exchange.reply);
}

export function CustomModelTestChatDialog({
  onClose,
  target,
}: {
  onClose: () => void;
  target: CustomModelTestChatTarget;
}) {
  const [apiKey, setApiKey] = useState("");
  const [headerValues, setHeaderValues] = useState<Record<string, string>>({});
  const [system, setSystem] = useState("");
  const [maxTokens, setMaxTokens] = useState("");
  const [thinking, setThinking] = useState<CustomModelThinkingLevel | "">("");
  const [prompt, setPrompt] = useState("");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const nextIdRef = useRef(0);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const promptRef = useRef<HTMLTextAreaElement | null>(null);

  const endpointUrl = buildCustomModelDirectChatUrl(target.baseUrl, target.api);
  const blockReason = useMemo(
    () => getCustomModelDirectChatBlockReason(target.baseUrl),
    [target.baseUrl],
  );
  const isStreaming = exchanges.some((exchange) => exchange.status === "streaming");
  const storedAuth = target.auth.kind === "stored" ? target.auth : null;
  const needsSecrets = Boolean(
    storedAuth && (storedAuth.hasApiKey || storedAuth.headerNames.length > 0),
  );
  const missingSecrets = storedAuth
    ? (storedAuth.hasApiKey && !apiKey) ||
      storedAuth.headerNames.some((name) => !headerValues[name])
    : false;
  const canSend = !blockReason && !isStreaming && !missingSecrets && Boolean(prompt.trim());

  // Entered secrets live only in this component; closing the dialog discards them.
  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    const transcript = transcriptRef.current;
    if (transcript) transcript.scrollTop = transcript.scrollHeight;
  }, [exchanges]);

  const updateExchange = (id: number, update: (exchange: Exchange) => Exchange) => {
    setExchanges((current) =>
      current.map((exchange) => (exchange.id === id ? update(exchange) : exchange)),
    );
  };

  const resolveAuth = () =>
    target.auth.kind === "draft"
      ? { apiKey: target.auth.apiKey, headers: target.auth.headers }
      : {
          apiKey: target.auth.hasApiKey ? apiKey : null,
          headers: target.auth.headerNames.map((name) => ({
            name,
            value: headerValues[name] ?? "",
          })),
        };

  const send = async () => {
    if (!canSend) return;

    let parsedMaxTokens: number | null = null;
    if (maxTokens.trim()) {
      parsedMaxTokens = Number(maxTokens);
      if (!Number.isInteger(parsedMaxTokens) || parsedMaxTokens <= 0) {
        setFormError("Max output tokens must be a positive whole number.");
        return;
      }
    }
    setFormError(null);

    const content = prompt.trim();
    const messages: CustomModelDirectChatMessage[] = [
      ...exchanges.filter(includedInHistory).flatMap<CustomModelDirectChatMessage>((exchange) => [
        { role: "user", content: exchange.prompt },
        { role: "assistant", content: exchange.reply },
      ]),
      { role: "user", content },
    ];

    nextIdRef.current += 1;
    const id = nextIdRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    setPrompt("");
    // Keep the keyboard in the message box when Send was clicked instead of Enter.
    promptRef.current?.focus();
    setExchanges((current) => [
      ...current,
      { id, prompt: content, reply: "", reasoning: "", status: "streaming", result: null, error: null },
    ]);

    try {
      const result = await streamCustomModelDirectChat({
        baseUrl: target.baseUrl,
        api: target.api,
        model: target.model,
        messages,
        system,
        maxTokens: parsedMaxTokens,
        thinking: thinking || null,
        auth: resolveAuth(),
        signal: controller.signal,
        onTextDelta: (delta) =>
          updateExchange(id, (exchange) => ({ ...exchange, reply: exchange.reply + delta })),
        onReasoningDelta: (delta) =>
          updateExchange(id, (exchange) => ({
            ...exchange,
            reasoning: exchange.reasoning + delta,
          })),
      });
      updateExchange(id, (exchange) => ({
        ...exchange,
        reply: result.text,
        reasoning: result.reasoning,
        status: "done",
        result,
      }));
    } catch (error) {
      const stage = error instanceof CustomModelDirectChatError ? error.stage : "network";
      const message = error instanceof Error ? error.message : "The test request failed.";
      updateExchange(id, (exchange) =>
        stage === "aborted"
          ? { ...exchange, status: "stopped" }
          : { ...exchange, status: "error", error: { stage, message } },
      );
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const handlePromptKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Test ${target.displayName}`}
      description="Talks straight from this browser to the model endpoint. No Agent, session, or tool is involved and nothing is saved."
      className="ms-chat-test-chat"
    >
      <div className="ms-chat-test-chat__body">
        <div className="ms-chat-test-chat__hint">
          <div className="ms-chat-test-chat__target">
            <span>{target.providerLabel}</span>
            <Badge variant="neutral">{target.api}</Badge>
          </div>
          <div className="ms-chat-test-chat__endpoint">POST {endpointUrl}</div>
          <div className="ms-chat-test-chat__mono">model: {target.model}</div>
          {target.auth.kind === "draft" ? (
            <div className="ms-chat-test-chat__line">
              Uses the API key and headers currently entered in the provider form.
            </div>
          ) : !needsSecrets ? (
            <div className="ms-chat-test-chat__line">
              No stored authentication, so requests are sent without credentials.
            </div>
          ) : null}
        </div>

        {blockReason ? (
          <div className="ms-chat-test-chat__blocked">
            {blockReason}
          </div>
        ) : null}

        {storedAuth && needsSecrets ? (
          <section className="ms-chat-test-chat__credentials">
            <div className="ms-chat-test-chat__heading">Credentials for this test</div>
            <div className="ms-chat-test-chat__hint">
              Stored secrets are never returned to the browser. Re-enter them to test. They stay in
              this dialog's memory, go only to the model endpoint, and are discarded on close.
            </div>
            {storedAuth.hasApiKey ? (
              <label className="ms-chat-form__field ms-chat-form__field--block">
                <span className="ms-chat-label">API key</span>
                <PasswordInput
                  autoFocus
                  value={apiKey}
                  autoComplete="off"
                  placeholder="API key"
                  onChange={(event) => setApiKey(event.target.value)}
                />
              </label>
            ) : null}
            {storedAuth.headerNames.map((name, index) => (
              <label key={name} className="ms-chat-form__field ms-chat-form__field--block">
                <span className="ms-chat-label">Header: {name}</span>
                <PasswordInput
                  autoFocus={!storedAuth.hasApiKey && index === 0}
                  value={headerValues[name] ?? ""}
                  autoComplete="off"
                  placeholder={`${name} value`}
                  onChange={(event) =>
                    setHeaderValues((current) => ({ ...current, [name]: event.target.value }))
                  }
                />
              </label>
            ))}
          </section>
        ) : null}

        {/* The conversation only exists once something was sent. An empty bordered box with hint
            text reads as the place to type, so there is no empty state here. */}
        {exchanges.length > 0 ? (
          <div
            ref={transcriptRef}
            role="log"
            aria-label="Test conversation"
            className="ms-chat-test-chat__transcript"
          >
            {exchanges.map((exchange) => (
              <div key={exchange.id} className="ms-chat-test-chat__group">
                <div className="ms-chat-test-chat__user">
                  {exchange.prompt}
                </div>
                {exchange.reasoning ? (
                  <details className="ms-chat-test-chat__reasoning">
                    <summary className="ms-chat-test-chat__reasoning-summary">Reasoning</summary>
                    <div className="ms-chat-test-chat__reasoning-text">{exchange.reasoning}</div>
                  </details>
                ) : null}
                {exchange.reply || exchange.status === "streaming" ? (
                  <div className="ms-chat-test-chat__assistant">
                    {exchange.reply}
                    {exchange.status === "streaming" ? (
                      <Loader2 className="ms-chat-test-chat__typing ms-chat-spin" />
                    ) : null}
                  </div>
                ) : null}
                {exchange.result ? (
                  <div className="ms-chat-test-chat__meta">
                    {formatResultSummary(exchange.result)}
                  </div>
                ) : null}
                {exchange.status === "stopped" ? (
                  <div className="ms-chat-test-chat__meta">Stopped.</div>
                ) : null}
                {exchange.error ? (
                  <div className="ms-chat-test-chat__error">
                    <div className="ms-chat-test-chat__error-title">{errorStageLabels[exchange.error.stage]}</div>
                    <div className="ms-chat-test-chat__error-detail">{exchange.error.message}</div>
                    <div className="ms-chat-test-chat__error-stage">
                      This turn is left out of the conversation sent with your next message.
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        <div className="ms-chat-test-chat__group">
          <label className="ms-chat-form__field ms-chat-form__field--block">
            <span className="ms-chat-label">Your message</span>
            <Textarea
              ref={promptRef}
              name="message"
              autoFocus={!needsSecrets}
              className="ms-chat-test-chat__input"
              value={prompt}
              placeholder="Type here…"
              disabled={Boolean(blockReason)}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={handlePromptKeyDown}
            />
          </label>
          {formError ? <div className="ms-chat-test-chat__composer-error">{formError}</div> : null}
          <div className="ms-chat-test-chat__composer-footer">
            <div className="ms-chat-test-chat__hint">
              {missingSecrets
                ? "Enter the stored credentials above to send."
                : "Enter sends, Shift+Enter adds a line. The whole conversation is resent every turn."}
            </div>
            <div className="ms-chat-test-chat__composer-actions">
              <Button
                size="small"
                variant="ghost"
                disabled={isStreaming || exchanges.length === 0}
                onClick={() => setExchanges([])}
              >
                <Trash2 className="ms-chat-icon-md" /> Clear
              </Button>
              {isStreaming ? (
                <Button size="small" variant="outline" onClick={() => abortRef.current?.abort()}>
                  <Square className="ms-chat-icon-md" /> Stop
                </Button>
              ) : (
                <Button variant="primary" size="small" disabled={!canSend} onClick={() => void send()}>
                  <Send className="ms-chat-icon-md" /> Send
                </Button>
              )}
            </div>
          </div>
        </div>

        <details className="ms-chat-test-chat__settings">
          <summary className="ms-chat-test-chat__settings-summary">
            Options: system prompt, max output tokens
            {target.reasoning && target.thinkingLevels.length > 0 ? ", thinking level" : ""}
          </summary>
          <div className="ms-chat-test-chat__settings-grid">
            <label className="ms-chat-form__field">
              <span className="ms-chat-label">System prompt</span>
              <Textarea
                className="ms-chat-test-chat__system-prompt"
                value={system}
                onChange={(event) => setSystem(event.target.value)}
              />
            </label>
            <label className="ms-chat-form__field">
              <span className="ms-chat-label">Max output tokens</span>
              <Input
                type="number"
                min={1}
                value={maxTokens}
                placeholder="Endpoint default"
                onChange={(event) => setMaxTokens(event.target.value)}
              />
            </label>
            {target.reasoning && target.thinkingLevels.length > 0 ? (
              <label className="ms-chat-form__field">
                <span className="ms-chat-label">Thinking level</span>
                <Select
                  value={thinking}
                  onChange={(event) =>
                    setThinking(event.target.value as CustomModelThinkingLevel | "")
                  }
                >
                  <option value="">Endpoint default</option>
                  {target.thinkingLevels.map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </Select>
              </label>
            ) : null}
          </div>
        </details>
      </div>
    </Dialog>
  );
}
