# Model Providers

## Purpose

This directory is the chat's model provider settings (ADR 096, step 5): the Organization's custom
providers and their models, a direct test conversation with a custom model, and sign-in and
sign-off for the built-in providers, with the models the platform's catalog publishes for each.

## Entry Points

The package exports `ModelProviderSettings`. Its inputs:

- `connection`: the connection to the platform;
- `auth`: the person's token, token type, and user uid (`ChatAuth`). Credentials and custom
  providers are read and written as that person;
- `notify`: optional; shows the person a short notice, for example a toast, after a custom
  provider or model is created, updated, or deleted.

Command Center renders it as its Settings section; a chat application renders it wherever it keeps
its settings.

The rest is internal:

- `ModelProviderSettings.tsx`: the page, the built-in provider cards, and the sign-in dialog.
- `CustomModelProviderSettings.tsx`: the custom provider list, the provider and model editors, and
  the delete confirmations.
- `CustomModelTestChatDialog.tsx`: the direct test conversation with one custom model.
- `model-provider-auth-state.ts`: the label a provider's credential state shows.

## Dependencies

- The platform clients in `../backend/`: `model-provider-auth-api.ts` (sign-in start, poll, and
  cancel, and sign-off), `custom-model-provider-api.ts` (provider and nested model CRUD, secret-safe
  read projections), `custom-model-provider-model-json.ts` (the JSON model entry), and
  `custom-model-direct-chat.ts` (the browser-to-endpoint test turn).
- The catalog store in `../engine/run-config-options.ts`: `useModelProviderCatalog` and
  `invalidateModelProviderCatalog()`.
- The package's own `Dialog`, `ConfirmationDialog`, `PasswordInput`, and `Select` in `../ui/`, and
  the SDK's `Button`, `Badge`, `Input`, and `Textarea`.
- The `ms-chat-providers`, `ms-chat-custom-providers`, `ms-chat-test-chat`, and `ms-chat-form`
  rules of the package's stylesheet.

## State

The screens hold their own state; nothing here needs a query client.

- The catalog comes from the same store as the chat's model pickers: one request per person,
  trusted for five minutes. Every change here calls `invalidateModelProviderCatalog()`, so the
  settings and every picker on the page read the catalog again.
- The custom provider list belongs to this screen. It loads when the screen mounts and again after
  every change; a failed read is tried once more after a second.
- A sign-in attempt is read at once and then every 1.5 seconds until it completes, fails, or is
  cancelled. A failed read is tried once more after a second. An attempt the platform no longer
  knows (`signin_attempt_not_found`, `signin_attempt_not_active`) closes the dialog and refreshes
  the catalog. Starting a sign-in while one is in progress opens that attempt.
- A change to a custom provider or model keeps its editor open, with the error, until the platform
  accepts it; then the list reloads, the editor closes, and `notify` reports it.

## Maintenance Notes

- Provider auth state is the source of truth for sign-in/sign-off controls. Do not infer provider
  authentication only from model presence.
- The platform's model catalog and provider sign-in operations require `session.user.uid` only as a
  local identity sanity check. Requests send the person's token and no user, Agent, or AgentSession
  uid; the platform derives the User. Numeric legacy ids are rejected before network I/O.
- The canonical catalog includes providers with missing credentials. Render its `authenticated`,
  `credential_status`, and `sign_in_available` fields directly rather than merging a second
  runtime-owned provider list.
- An OAuth credential may keep `credential_status=active` after it expires, or shortly before it
  does. In that state `authenticated=false`; provider cards render `Requires sign-in`, offer the
  normal sign-in flow when available, and must not render `Sign off`.
- Provider cards should follow the platform's workflow flags directly: `authenticated` controls
  `Sign off` and `signInAvailable` controls `Sign in`.
- Built-in authentication cards render only catalog rows with `known=true`. Organization custom
  rows use `known=false`, require no per-user sign-in, and are administered in the custom-provider
  section rather than being misrepresented as sign-off targets.
- The custom-provider administration list is an editing surface, not an availability source. It may
  call `/api/v1/custom-model-providers/` on this settings page, but Agents, the chat, AgentSession
  editors, deployment settings, and every model picker must continue to use one merged `GET
  /api/v1/model-providers/` request with no client-side merge.
- Provider creation submits a non-empty set of relational model definitions and exactly one default.
  Provider PATCH never replaces models; model add/edit/delete uses the nested routes. Default model
  rows cannot be deleted, and provider/model deletion is a real hard delete shown behind an explicit
  confirmation dialog.
- Provider creation offers synchronized form and JSON model-entry modes. JSON mode accepts either a
  bare model array or a catalog-style `{ "default_model": "...", "models": [...] }` object using
  the canonical snake-case model fields. This is a client authoring convenience for large model
  registries: all rows are validated locally and still use the one atomic provider-create request;
  it does not introduce bulk mutation routes or a second availability source.
- Provider PATCH keeps API keys and headers when their fields are omitted. The editor exposes that
  omission as `Keep`, sends a new write-only value for `Replace`, and sends `api_key: null` or
  `headers: []` for explicit clearing. It displays only `auth.has_api_key` and
  `auth.header_names`; secret values never return to the UI.
- The test chat never reads stored secrets, because the platform does not return them. For a saved
  provider the tester re-enters the API key and one value per stored header name; Send stays
  disabled until all are filled so the test matches the stored configuration. For a draft provider
  it uses the values already in the create form. Entered secrets live only in the dialog's React
  state, are sent only to the provider endpoint, and are dropped when the dialog closes. Do not
  persist them, prefill them, or send them to the platform.
- A saved-provider test validates the secrets the tester typed, not the encrypted copy on the
  platform. If agents fail after a passing test, replace the stored key.
- The test chat requires an HTTPS endpoint that allows CORS from the Command Center origin. It
  detects a plain-HTTP endpoint on an HTTPS page and explains the block instead of sending.
- Keep the test chat dialog rendered outside the provider and model `<form>` elements. React events
  bubble through portals, so nesting it would let its events reach the form submit handler. While
  it is open the provider editor ignores Escape so the draft is not discarded.
- In the test chat only real inputs may look typable. The conversation has no empty state: an empty
  bordered box with hint text reads as the message field and people click and type into it. The
  message box is the labelled, highlighted field, takes the keyboard on open (the first credential
  field does when stored secrets must be entered), and keeps it after Send. System prompt, max
  output tokens, and thinking level stay in the collapsed Options block so they do not compete
  with it.
- Failed turns are excluded from the transcript resent on the next turn so strict
  user/assistant-alternation endpoints keep working after an error.
- The model list in this section is informational. It should not mutate chat model selection.
- Per-provider model lists should stay collapsed by default so provider status remains the primary
  view and large catalogs do not dominate the dialog.
- This screen and every model picker use the platform's `/api/v1/model-providers/` catalog. Provider
  discovery must never be routed through an assistant runtime.
- The sign-in modal renders only the platform's safe `next_action` projection. Browser callbacks
  complete at the platform's public callback route; device flows show `user_code` and are polled by
  the platform. The UI must not collect callback URLs, authorization codes, or other manual secret
  input.

## Tests

`ModelProviderSettings.client.test.tsx` covers the sign-in loop: the attempt is followed until it
completes, an unknown attempt closes the dialog, and a sign-in already in progress opens.
`CustomModelProviderSettings.client.test.tsx` covers the atomic provider editor and a test
conversation opened from a draft model; `CustomModelTestChatDialog.client.test.tsx` covers the
test conversation; `model-provider-auth-state.test.ts` covers the credential labels.
