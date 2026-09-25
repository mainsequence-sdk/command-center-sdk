---
name: build-command-center-ai-application
description: Design, build, or review how an application that uses @dev-mainsequence/command-center-sdk gets its AI capabilities from @dev-mainsequence/command-center-ai, and route each piece to its focused skill. Use before implementation to decide where the conversation lives (the right rail and the expanded rail, or a conversation-only page), which Agent and sessions the application opens, how it reaches the platform, where model provider settings go, and which deployments are supported.
---

# Build A Command Center AI Application

Make the application-level decisions here, then follow the focused skills. The human guide is
`docs/build-an-ai-application.md` in the installed package.

## Establish The Boundary

Command Center AI draws the conversation and the application places it. The package owns the
session engine, the thread, the composer and its model picker, readiness, the message queue, and
the provider screens. The application owns sign-in and the credential, sending the platform requests itself, which Agent, the frame around the
thread (the right rail and the expanded rail), routing, notifications, and the forwarder to the
platform. The SDK owns the application's shell, pages, controls, and theme.

## Make These Decisions First

1. **Where the conversation lives.** In an application with pages of its own, the conversation is a
   right rail beside them that expands into a full page, as in Command Center. Follow
   `$compose-command-center-ai-rail`. An application that is only a conversation renders the
   expanded rail as its main route.
2. **Which Agent and which session.** One Agent's default session behind a stable handle is the
   usual start (`$mount-agent-conversation`). A session explorer, search, archive, a new-session
   action, or a session in the URL needs `$manage-agent-sessions`.
3. **How it reaches the platform.** The application sends the platform requests, with its own
   credential and renewal, through the connection's `sendPlatformRequest`; passes the Environment;
   and forwards requests from its own origin when the platform does not allow that origin. Follow
   `$connect-command-center-ai-to-the-platform`.
4. **Where model provider settings live.** In the application's settings, reached from the thread's
   picker. Follow `$manage-model-providers`.
5. **Which deployment.** The production case is an application embedded in Command Center through
   the SDK's static-site iframe, with Command Center AI running inside it. It holds no platform
   credential: its sender is the SDK's static-site client, `(request) =>
   client.sendPlatformRequest(request)`, and Command Center sends each request as the person. If
   the installed SDK has no `client.sendPlatformRequest`, stop and report that piece as missing,
   and never pass another credential, such as a FastAPI release token, as the person's. A
   standalone application on its own origin sends the requests itself, with the forwarder.
6. **Controls, pages, and theme.** The application's own buttons, badges, and fields come from the
   SDK's `/controls` (`$compose-command-center-controls`), its pages from `/layout`
   (`$compose-command-center-page`), and its styling from SDK tokens checked by
   `command-center-sdk theme audit` (`$theme-command-center-app`).
7. **What the Agent answers.** When the application also shapes the Agent's answers, design them
   for what the thread draws with `$design-agent-conversation-capabilities`.

## Produce The Decision

Before implementation, write:

```text
Purpose of the AI capability:
Deployment (embedded in Command Center, or standalone):
Where the conversation lives (right rail and expanded rail, or a conversation-only page):
Rail modes (docked from 1400px, overlay below):
Agent and handle (default session), requested sessions, or launch targets:
Session explorer, search, archive, new session:
Platform request sender (embedded: the static-site client; standalone: credential and renewal):
Environment source:
Forwarder for the platform and the Agent runtime:
Model provider settings location:
The thread's words (copy):
Notifications:
Selected focused skills:
Rejected alternatives and reasons:
```

Then load only the focused skills the decision selects. Do not restate their contracts here.

## Enforce The Guardrails

- Do not build a thread, composer, model picker, queue, or readiness check from SDK primitives or
  from assistant-ui directly; mount the package's.
- Do not call the platform's agent session, Agent runtime, or model provider routes from
  application code.
- Do not mount a second `ChatEngineProvider` for the expanded rail: one engine serves the rail and
  the page, so the conversation survives the switch.
- Do not put a credential in a build variable, an environment file, the bundle, or browser storage.
- Do not load the package's stylesheet before the SDK's, copy its CSS, or restyle it with literal
  colours, gradients, or glows; override it with SDK tokens only.
- Do not write raw `<button>`, `<input>`, `<textarea>`, or `<label>` elements around the thread;
  use `/controls`.

Verify the finished application against the decision, the focused skills' checks, and the
application's typecheck, tests, and theme audit.
