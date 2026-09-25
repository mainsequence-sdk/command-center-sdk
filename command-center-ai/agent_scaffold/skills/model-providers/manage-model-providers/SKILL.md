---
name: manage-model-providers
description: Add and verify the model provider settings of the @dev-mainsequence/command-center-ai package (ModelProviderSettings) in an application that uses Command Center AI - the platform's model catalog with built-in provider sign-in and sign-off, Organization custom providers and their models, and the direct test conversation with a custom model, with its HTTPS and CORS constraints and secrets that are re-entered and never persisted. Use when an application needs people to connect providers or choose models, or when a model does not appear in the thread's picker. Do not use to add a provider to the platform itself or to change how an Agent calls models.
---

# Manage Model Providers

A conversation needs a model. Command Center AI's `ModelProviderSettings` connects and chooses
them against the platform's catalog, the same catalog every model picker in the thread reads. The
human guide is `docs/model-providers.md` in the installed package.

## Render The Settings

```tsx
import { ModelProviderSettings } from "@dev-mainsequence/command-center-ai";

<ModelProviderSettings auth={auth} connection={connection} notify={notify} />;
```

- `connection` and `auth` are the ones the application gives `ChatEngineProvider`
  (`$mount-agent-conversation`). Credentials and custom providers are read and written as that person.
- `notify` is optional; it reports that a custom provider or model was created, updated, or deleted.
- Put it where the application keeps its settings, and pass `onOpenModelProviderSettings` to
  `ChatThread` so the picker's "Sign in to provider" action and the "Open model providers" button
  lead there. Compose that settings page with `$compose-command-center-page`, and the
  application's own actions on it with `/controls` (`$compose-command-center-controls`); the
  screens' own controls stay the package's.
- The screens hold their own state. They need no query client, and their styles are in the package's
  stylesheet.

## Built-In Providers

- The catalog is `GET /api/v1/model-providers/`: one request per person, trusted for five minutes,
  shared by the settings and every picker. It lists providers with missing credentials too.
- A card follows the platform's fields: `authenticated` shows "Sign off", and `sign_in_available`
  shows "Sign in". An OAuth credential can stay `active` after it expires, or shortly before; it
  is then not `authenticated`, and the card asks for sign-in again.
- Sign-in starts an attempt, which is read at once and then every 1.5 seconds until it completes,
  fails, or is cancelled. The dialog shows only the platform's next step: a browser callback that
  completes at the platform, or a device code the person enters with the provider. Never collect
  callback URLs, authorization codes, or other secrets by hand.
- Today a card's title is built from the provider id, not from the catalog's name. Leave it: it is
  reported to the package's owner.

## Organization Custom Providers

- The custom-provider list is an editing screen, not an availability source: pickers and Agents
  read the one catalog, which already includes the Organization's custom providers.
- Creating a provider sends its models in the same request, with exactly one default. A model list
  can be entered as a form or as JSON (a bare array, or `{ "default_model": ..., "models": [...] }`).
- Editing a provider keeps its API key and headers unless the person chooses to replace or clear
  them. Secrets are write-only: the screen shows only whether a key exists and which header names
  are set.
- Deleting a provider or a model is a real deletion behind a confirmation the person types. The
  default model cannot be deleted.
- Whether a person may administer custom providers is the platform's decision; a refusal is shown
  as the platform's error.

## The Direct Test Conversation

- It sends one test turn from the browser straight to the custom provider's OpenAI-compatible
  endpoint (`/chat/completions` or `/responses`), with no Agent, session, or platform token, and
  never through the rewrite or a proxy.
- The endpoint must be HTTPS (a plain-HTTP endpoint from an HTTPS page is blocked, loopback
  excepted) and must allow CORS from the application's origin. The browser reports a CORS
  rejection like an unreachable host.
- For a saved provider the person re-enters the API key and each stored header value; the platform
  never returns them. They live in the dialog only, go only to the provider's endpoint, and are
  dropped when it closes. Never persist, prefill, or log them.
- A passing test proves the key the person typed, not the encrypted copy on the platform.

## After A Change Elsewhere

The settings refresh the catalog after every change they make. When the application changes
providers another way, call `invalidateModelProviderCatalog()` so every picker reads the catalog
again. The settings never change a session's model; the session's picker does.

## Verify

1. On the scripted stand-in (`$mount-agent-conversation`), open the settings: "Built-in providers"
   lists the stand-in's providers with "Sign in" and "Sign off", and "Organization custom
   providers" lists its custom provider. A sign-in completes on the second read of its attempt.
2. Create a custom provider with two models, edit it, and delete a model; the thread's picker offers
   the change without a reload.
3. Against the platform, sign in to a provider and pick one of its models in the thread.
