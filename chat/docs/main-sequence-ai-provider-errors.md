---
id: main-sequence-ai-provider-errors
title: Main Sequence AI Provider Errors
slug: /extensions/main-sequence-ai-provider-errors
---

# Main Sequence AI Provider Errors

The Main Sequence AI assistant transport consumes model-provider failures through
the standard assistant UI message-stream error frame:

```json
{"type": "error", "errorText": "provider-supplied failure message"}
```

`errorText` is the canonical user-facing field and takes precedence over the
legacy `error`, `message`, and `error_detail` fallbacks. The transport reports
that value through its normal error callback so chat surfaces display the reason
returned by the provider.

Command Center does not map particular providers, HTTP status codes, billing
states, authentication failures, or rate-limit variants to custom messages.
The Agent runtime owns extraction of the provider message and must not include the
raw provider response body in this frame. When `errorText` is absent, Command
Center retains a generic runtime-error fallback.
