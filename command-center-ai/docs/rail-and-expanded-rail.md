# The Right Rail and the Expanded Rail

Command Center shows AI in two places that share one conversation: a right rail beside the page the
person is working on, and the expanded rail, a full page for longer work. The package draws both,
frame and all, so an application built on Command Center AI looks exactly like Command Center, and
Command Center draws its own with the same components. Its agent skill is
`compose-command-center-ai-rail`.

| Component | What it draws |
| --- | --- |
| `ChatRail` | The right rail: the panel with the theme's gradient, tinted edge, and glows; the header with the Agent's icon tile, the assistant's name and subtitle, Expand, and Close; and the body. |
| `ChatLauncher` | The floating button that opens the rail. |
| `ChatPageLayout` | The expanded rail: the session explorer, the header with the Agent, the session, and the run status, the page's actions, and the context card. |
| `AgentSessionExplorer` | The person's sessions under their Agents, with search, archive, and archived sessions. `ChatPageLayout` draws it from its `explorer` props. |
| `ChatThread` | The conversation, with `surface="overlay"` in the rail and `surface="page"` in the expanded rail. |

Mount one `ChatEngineProvider` above both, so switching between them keeps the conversation.

## The right rail

```tsx
import { ChatLauncher, ChatRail, ChatThread } from "@dev-mainsequence/command-center-ai";

{railOpen ? (
  <ChatRail
    title="Main Sequence AI"
    subtitle="Assistant rail."
    mode={docked ? "docked" : "overlay"}
    onExpand={expand}
    onClose={() => setRailOpen(false)}
  >
    <ChatThread copy={copy} surface="overlay" viewer={viewer} onOpenModelProviderSettings={openProviders} />
  </ChatRail>
) : (
  <ChatLauncher label="Ask Main Sequence AI" onClick={() => setRailOpen(true)} />
)}
```

| Aspect | Rule |
| --- | --- |
| Size and place | 540px wide, on the right edge, the full height below the application's top bar. |
| Docked | From a 1400px viewport: `mode="docked"` in a column of the layout grid (`grid-template-columns: <sidebar> minmax(0, 1fr) 540px`), so the page narrows. |
| Overlay | Below 1400px: `mode="overlay"` fixes it over the page, `min(540px, 100vw - 10px)` wide, with a shadow. `rightOffset` keeps it clear of a column the application holds at the right. |
| Header | `title` and `subtitle`; `detail` adds a pill, for example the session; `onExpand` adds Expand. The tile shows the engine's active Agent unless `agentUid` names one. |
| Tone | `tone="accent"` for a rail opened directly on one Agent, as Command Center does for a code repository's Agent. |
| Closing | Close returns the engine to the default session when another Agent's session was open, then calls `onClose`. |
| Opening | A top-bar toggle or `ChatLauncher`. Show the launcher only while neither the rail nor the expanded rail is on screen. |

## The expanded rail

```tsx
import { ChatPageLayout, ChatThread } from "@dev-mainsequence/command-center-ai";

<div style={{ height: "calc(100dvh - 56px)" }}>
  <ChatPageLayout
    explorer={{
      onOpenSession: (id) => navigate(`/assistant?session=${encodeURIComponent(id)}`),
      onOpenSessionDetails: (id) => navigate(`/assistant/sessions/${id}`),
      environmentLabel: environment.name,
    }}
    onCreateSession={() => navigate("/assistant")}
    onMinimize={minimizeToRail}
  >
    <ChatThread copy={copy} surface="page" viewer={viewer} onOpenModelProviderSettings={openProviders} />
  </ChatPageLayout>
</div>
```

| Aspect | Rule |
| --- | --- |
| Route | Expand remembers where the person was, closes the rail, and opens the expanded rail's route with `?session=<id>`. Minimize returns there and reopens the rail. The rail never shows on this route. |
| Height | `ChatPageLayout` fills its parent; give the parent the height below the top bar. |
| Explorer | 320px at the left from 1024px, an overlay with a scrim below, collapsible at every width. Pass `agents` (uid, name) to list the Agents without recent sessions too. |
| Header | The Agent's name and the session's title, and the run status: Thinking and Responding in the brand colour, Complete, Error, Queued, and Working while the session works. |
| Actions | New session (`onCreateSession` runs after it), Show context (`showContext={false}` hides it), Collapse, and Minimize (with `onMinimize`). |
| Blocking | `blockingState` replaces the page while the application cannot show a session, for example while its default Agent opens. |

## A composer of your own

An application that draws its own transcript still takes the composer from the package:
`ChatComposer` has the input, Enter to send (Shift+Enter for a new line), Enter to queue while the
Agent works, the send and stop controls, the model row, the queue strip, and the context footer.
`ChatQueueStrip` is the queue strip alone. Never put either beside a `ChatThread`, which has both.

`useChatComposerState()` says whether the assistant can take a message now, for a status line, a
disabled action elsewhere on the page, or a test:

| `status` | Meaning |
| --- | --- |
| `ready` | `canSend`: Enter sends. |
| `working` | The Agent is working; `queues`: Enter adds the draft to the queue. |
| `waking`, `loading`, `loading-models` | Not yet; a draft already written is kept. |
| `unavailable`, `models-unavailable` | The session, its Agent, or the models cannot take a message. |
| `no-session`, `choosing-model`, `stopping`, `busy` | No session is selected, a model must be chosen, a stop is confirming, or a session is being created. |

`reason` carries the words the composer shows for every status but `ready`, and `canWrite` says
whether the input takes typing. It is the same decision the composer obeys.

## Look

The rail's gradient, tinted edge, and glows are Command Center's look and part of the theme: every
colour is a theme variable (`--card` fading into `--background`, `--primary` and `--accent` for the
glows), so each preset draws its own and the stylesheet passes `command-center-sdk theme audit`. The
top sheen and the floating shadow follow the SDK's `dark` class, which `applyThemePresetToRoot` sets.
Do not restyle the frame; override the package's `ms-chat-*` classes only with ordinary rules that
use theme variables, loaded after its stylesheet. The application's words go through the thread's
`copy`, including a disclaimer that the assistant can make mistakes.

## Verify

Open the rail at 1440×900 (docked) and 1280×800 (overlay); expand, send a message, and minimize, and
the conversation is the same in both; check 375×812 in a dark and a light theme; and run the theme
audit. The [Build an AI application](./build-an-ai-application.md) guide covers the scripted
stand-in.
