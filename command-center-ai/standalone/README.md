# Standalone Chat Application

## Purpose

A chat application that is nothing but the chat, built only on the chat package's public exports
and the Command Center SDK. It proves the package works outside Command Center, and it is the
development bed and the browser-test target (ADR 096, section 5).

It has no Command Center shell, stores, or Tailwind build. It loads the SDK's theme, component,
and markdown stylesheets and the chat's stylesheet, and uses the SDK's controls for its own form.
It may read its own environment; the package in `../src` may not.

## Entry Points

- `main.tsx` loads the stylesheets and mounts the application; `../index.html` is its page.
- `StandaloneApp.tsx` is the application. A form takes the platform API URL, a token, the person,
  the Organization Environment, and an Agent. Connecting mounts `ChatEngineProvider` with the
  Agent's default session behind the handle `standalone_chat`, so every visit continues the same
  conversation, and shows `ChatThread`. A header button switches to `ModelProviderSettings`, and
  notices from the chat appear in a small stack in the corner.
- `connection.ts` builds the application's connection to the backend, including its request-URL
  rewrite.
- `platform-proxy.ts` holds the proxy prefix shared with `../vite.config.ts`.
- `stand-in/` is a scripted stand-in for the platform and the Agent runtime: it answers every route
  the package calls, and streams a reply with text, reasoning, a tool call, and a data part.
  `StandaloneApp.client.test.tsx` runs the application against it.

## Trying It

With a platform: `npm run chat:dev` from the repository root serves the application on
`http://localhost:5183`. That origin is not on the platform's allow-list, so a direct call is
refused by the browser. Put the platform API URL in `command-center-ai/.env.local`:

```bash
VITE_CHAT_API_BASE_URL=https://platform.example.com
```

The dev server then forwards `/__platform__` to it, and `connection.ts` points platform requests
there. Optional defaults for the form: `VITE_CHAT_USER_UID`, `VITE_CHAT_ENVIRONMENT_UID`,
`VITE_CHAT_AGENT_UID`.

Without a platform: open `http://localhost:5183/?stand-in`. In development that query answers every
request from the stand-in and prefills the form; any token works.

## Maintenance Notes

- Import the chat only from `../src` (the public exports), never from a path inside it.
- The token stays in memory. The other fields are remembered in `localStorage` under
  `chat-standalone.settings`.
- Never put a token in an environment file.
- `npm run build:standalone` bundles the application into `standalone/dist/`; `dist/` at the package
  root is the library build.
