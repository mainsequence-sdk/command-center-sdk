---
name: compose-command-center-ai-rail
description: Compose Command Center AI's right rail and expanded rail in an application that uses @dev-mainsequence/command-center-sdk and @dev-mainsequence/command-center-ai with the package's own frame - ChatRail (the 540px rail docked or floating, with the theme's gradient and glows, the Agent's icon, Expand, and Close), ChatLauncher, ChatPageLayout (the expanded rail with its session explorer and run status), AgentSessionExplorer, the standalone ChatComposer and useChatComposerState for whether the assistant can take a message, switching between them over one engine, the thread's words, and phone presentation. Use when placing the conversation in an application or reviewing how it looks and behaves.
---

# Compose The Right Rail And The Expanded Rail

Command Center shows AI in two places that share one conversation: a right rail beside the page the
person is working on, and the expanded rail, a full page for longer work. The package draws both,
frame included, and Command Center draws its own with the same components, so use them and the
application looks exactly like Command Center. The human guide is `docs/rail-and-expanded-rail.md`
in the installed package.

## Confirm The Installed Surface

Confirm these exports in the installed declarations first (`$use-command-center-ai`):

- `ChatRail`, `ChatLauncher`, `ChatPageLayout`, and `AgentSessionExplorer`: the frame.
- `ChatThread`: the conversation, `surface="overlay"` in the rail and `surface="page"` in the
  expanded rail.
- `ChatComposer`, `ChatQueueStrip`, and `useChatComposerState()`: the composer on its own and
  whether the assistant can take a message.
- `useChatEngine()`, `useChatRunStatus()`, `AgentIcon`, and `AgentConnectingState`.

If the frame components are missing, the installed package predates them: upgrade
`@dev-mainsequence/command-center-ai` rather than building the frame by hand.

## Keep One Engine For Both

Mount one `ChatEngineProvider` above the application's routes (`$mount-agent-conversation`) and
render the rail and the expanded rail inside it. A second provider for the page loses the
conversation on every switch. Pass `isVisible` true while the rail is open or the expanded rail is
on screen, and false otherwise, so the engine stops working while nothing shows it. Pass
`onRequestVisible` a function that opens the rail.

## The Right Rail

```tsx
import { ChatLauncher, ChatRail, ChatThread, type ChatThreadCopy, type ChatViewer } from "@dev-mainsequence/command-center-ai";

interface AssistantRailProps {
  copy: Partial<ChatThreadCopy>;
  docked: boolean;
  open: boolean;
  viewer: ChatViewer;
  onClose: () => void;
  onExpand: () => void;
  onOpen: () => void;
  onOpenModelProviderSettings: () => void;
}

export function AssistantRail({ copy, docked, open, viewer, onClose, onExpand, onOpen, onOpenModelProviderSettings }: AssistantRailProps) {
  if (!open) {
    return <ChatLauncher label="Ask Main Sequence AI" onClick={onOpen} />;
  }

  return (
    <ChatRail
      title="Main Sequence AI"
      subtitle="Assistant rail."
      mode={docked ? "docked" : "overlay"}
      onExpand={onExpand}
      onClose={onClose}
    >
      <ChatThread copy={copy} surface="overlay" viewer={viewer} onOpenModelProviderSettings={onOpenModelProviderSettings} />
    </ChatRail>
  );
}
```

- **Size and place.** The rail is 540px wide, on the right edge, the full height below the
  application's top bar.
- **Two modes.** `mode="docked"`: put `ChatRail` in a column of the application's layout grid, so
  the page narrows to make room (`grid-template-columns: <sidebar> minmax(0, 1fr) 540px`).
  `mode="overlay"`: it floats over the page at the right edge, `min(540px, 100vw - 10px)` wide.
  Dock the rail when the viewport is at least 1400px wide and float it below.
- **Header.** `ChatRail` draws the Agent's icon tile, `title`, `subtitle`, an optional `detail`
  pill, `Expand` (when `onExpand` is given), and the icon-only close button labelled
  `Close chat rail`. Its buttons are the SDK's `/controls` (`$compose-command-center-controls`).
  `tone="accent"` marks a rail opened directly on one Agent.
- **Opening.** A top-bar toggle, or `ChatLauncher` at the bottom right while neither the rail nor
  the expanded rail is on screen. The rail never shows on the expanded rail's own route.
- **Closing.** Close returns the engine to the default session when the person had opened another
  Agent's session, then calls `onClose`. Pass `restoreDefaultSessionOnClose={false}` only when the
  rail belongs to one launched Agent.

## The Expanded Rail

```tsx
import { ChatPageLayout, ChatThread, type ChatThreadCopy, type ChatViewer } from "@dev-mainsequence/command-center-ai";

interface AssistantPageProps {
  copy: Partial<ChatThreadCopy>;
  environmentName: string | null;
  viewer: ChatViewer;
  onMinimize: () => void;
  onOpenModelProviderSettings: () => void;
  onOpenSession: (sessionId: string | null) => void;
}

export function AssistantPage({ copy, environmentName, viewer, onMinimize, onOpenModelProviderSettings, onOpenSession }: AssistantPageProps) {
  return (
    <div className="assistant-page">
      <ChatPageLayout
        explorer={{ onOpenSession, environmentLabel: environmentName }}
        onCreateSession={() => onOpenSession(null)}
        onMinimize={onMinimize}
      >
        <ChatThread copy={copy} surface="page" viewer={viewer} onOpenModelProviderSettings={onOpenModelProviderSettings} />
      </ChatPageLayout>
    </div>
  );
}
```

```css
.assistant-page {
  height: calc(100dvh - 56px);
  min-height: 0;
}
```

- **A route of its own.** Expand remembers where the person was (path, query, and hash), closes the
  rail, and navigates to the expanded rail's route with the active session in the URL,
  `?session=<id>` (`$manage-agent-sessions`). Minimize returns to the remembered place and reopens
  the rail in the mode the viewport prefers.
- **Height.** `ChatPageLayout` fills its parent; give the parent the height below the top bar.
- **Explorer.** `explorer` draws `AgentSessionExplorer`: 320px at the left from 1024px, an overlay
  with a scrim below, collapsible at every width. `onOpenSession` puts the session in the URL;
  `onOpenSessionDetails` adds a details button; `agents` (uid and name) lists the Agents without a
  recent session too.
- **Header and actions.** The layout draws the Agent's name, the session's title, the run status
  from `useChatRunStatus()`, and New session, Show context, Collapse, and Minimize. `onCreateSession`
  runs after New session, for example to drop `?session=` from the URL.
- **Blocking.** While the default session loads or its Agent is missing (`defaultSessionStatus`),
  pass `blockingState` to the layout and show the same state in the rail's body, unless the session
  waits for a model choice (`sessionModelSelectionRequest`); the thread then shows the picker.

## Readiness And A Composer Of Your Own

- `useChatComposerState()` says whether the assistant can take a message: `status` is `ready`
  (Enter sends), `working` (Enter queues), or a waiting or unavailable state, with `canSend`,
  `queues`, `canWrite`, and `reason`, the words the composer shows. Use it for a status line or an
  action elsewhere on the page; never re-derive readiness from the engine's fields.
- An application that draws its own transcript uses `ChatComposer`: the input with Enter to send,
  Shift+Enter for a new line, Enter to queue while the Agent works, send and stop, the model row,
  and the queue. Never put it beside a `ChatThread`, which has its own.

## Words, People, And Agents

- Pass the application's words through `copy` over `DEFAULT_CHAT_THREAD_COPY`: the empty state's
  title and description, the composer's placeholder, the session loading and unavailable titles,
  and the disclaimer ("Main Sequence AI can make mistakes. Verify important outputs before
  acting."). Name the assistant as the rail's `title` does.
- Pass `viewer` (uid, name, avatar) so the person's own messages carry their name and avatar.
- Pass `onOpenModelProviderSettings` so the picker can send the person to the provider settings
  (`$manage-model-providers`); without it, the picker's sign-in action does not appear.

## The Look Is The Theme's

The rail's gradient, tinted edge, and glows are Command Center's look and part of the theme: every
colour is a theme variable, so each preset draws its own, and the package's stylesheet passes
`command-center-sdk theme audit`. Load the package's stylesheet after the SDK's
(`$mount-agent-conversation`) and apply the theme with `applyThemePresetToRoot`, which sets the
`dark` class the rail's sheen and floating shadow follow. Do not restyle the frame or rebuild it with
the application's own panel, header, gradients, or `--shadow-panel`; override `ms-chat-*` classes
only with ordinary rules that use SDK tokens, loaded after the package's stylesheet. Follow
`$theme-command-center-app`.

## Check The Phone Presentation

At 375×812 the rail is an overlay 10px narrower than the screen, and the explorer is an overlay with
a scrim. In one dark and one light theme, confirm the header's actions stay reachable, the composer
stays above the on-screen keyboard, and nothing scrolls sideways.

## Do Not Rebuild Owned Behavior

- Do not draw the rail's panel or header, the launcher, the expanded rail's layout, or the session
  explorer yourself; `ChatRail`, `ChatLauncher`, `ChatPageLayout`, and `AgentSessionExplorer` own
  them.
- Do not draw messages, reasoning, tool calls, the composer, the queue, or the model picker
  yourself; `ChatThread` and `ChatComposer` own them.
- Do not mount a second engine for the expanded rail.
- Do not hide the thread's notices, readiness, or model-required states behind the application's
  own.

## Verify

1. At 1440×900 open the rail: it docks, and the page narrows. At 1280×800 it floats, and the page
   does not move.
2. Expand, send a message, and minimize: the same conversation shows in both, and the person is back
   where they were.
3. Close with another Agent's session open: the default session returns.
4. Run it on the scripted stand-in (`$mount-agent-conversation`) at 375×812 in a dark and a light
   theme, and run `command-center-sdk theme audit` over the application's CSS.
