# Model Providers

A chat needs a model to chat with. `ModelProviderSettings` lets a person connect the platform's
built-in providers, administer the Organization's custom providers and their models, and test a
custom model directly. Every model picker in the chat reads the same catalog. Its agent skill is
`manage-model-providers`.

## Render the settings

```tsx
import { ModelProviderSettings } from "@dev-mainsequence/command-center-ai";

<ModelProviderSettings auth={auth} connection={connection} notify={notify} />;
```

| Input | What it is |
| --- | --- |
| `connection` | The connection the application gives the engine. |
| `auth` | Who is signed in. Credentials and custom providers are read and written as that person, with the application's credential from the connection's `sendPlatformRequest`. |
| `notify` | Optional. Reports that a custom provider or model was created, updated, or deleted. |

Place it where the application keeps its settings, and pass `onOpenModelProviderSettings` to
`ChatThread` so the picker's "Sign in to provider" action and the "Open model providers" button
lead there. The screens keep their own state and need no query client.

## The catalog

The platform's catalog (`GET /api/v1/model-providers/`) lists every provider and model the person
can use, including providers whose credentials are missing, and the Organization's custom providers.
The chat reads it once per person and trusts it for five minutes; the settings and every picker on
the page share that read. After a change the settings make, they refresh it themselves. When an
application changes providers some other way, it calls `invalidateModelProviderCatalog()`.

The settings never change a session's model. The composer's picker does, on the session.

## Built-in providers

- A provider card follows the platform: "Sign off" when the provider is `authenticated`, and
  "Sign in" when sign-in is available. An OAuth credential is no longer authenticated after it
  expires, or shortly before, and its card asks for sign-in again.
- Signing in starts an attempt that the screen follows every 1.5 seconds until it completes, fails,
  or is cancelled. The dialog shows only the platform's next step: a browser page whose callback
  completes at the platform, or a device code. The person never pastes a callback URL or a code.
- Known issue: a card's title is built from the provider id instead of the catalog's name.

## Organization custom providers

- A custom provider is created with its models in one request, exactly one of them the default.
  Models can be entered in a form or as JSON: a bare array, or an object with `default_model` and
  `models`.
- Editing a provider keeps its API key and headers unless the person replaces or clears them. The
  screen only shows whether a key is set and which header names exist; the platform never returns a
  secret.
- Deleting a provider or a model is permanent and asks the person to type a confirmation. The
  default model cannot be deleted.
- Whether a person may administer custom providers is the platform's decision; a refusal shows the
  platform's error.

## The test conversation

The test conversation sends one turn from the browser straight to the custom provider's
OpenAI-compatible endpoint (`/chat/completions` or `/responses`), with no Agent, session, or
platform token and never through the application's rewrite or a proxy.

- The endpoint must be HTTPS, because a browser blocks plain HTTP from an HTTPS page (loopback
  excepted), and it must allow CORS from the application's origin. A CORS rejection looks like an
  unreachable host.
- For a saved provider, the person types the API key and each stored header value again. They stay
  in the dialog, go only to the provider, and are dropped when it closes.
- A passing test proves the key that was typed, not the copy the platform stores. If Agents fail
  after a passing test, replace the stored key.

The [model providers README](../src/model-providers/README.md) records every rule the screens follow.
