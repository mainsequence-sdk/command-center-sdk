---
name: compose-command-center-ai-rail
description: Compose Command Center AI's right rail and expanded rail in an application that uses @dev-mainsequence/command-center-sdk and @dev-mainsequence/command-center-ai - the 540px rail docked beside the pages or floating over them, its header with the Agent's icon, Expand, and Close, the expanded rail as a full page with a session explorer, the run status, and the thread, switching between them over one engine, the thread's words, phone presentation, and styling with SDK tokens. Use when placing the conversation in an application or reviewing how it looks and behaves.
---

# Compose The Right Rail And The Expanded Rail

Command Center shows AI in two places that share one conversation: a right rail beside the page the
person is working on, and the expanded rail, a full page for longer work. Build the same two so the
application looks and behaves like Command Center. The human guide is
`docs/rail-and-expanded-rail.md` in the installed package.

## Confirm The Installed Surface

The package draws the conversation: `ChatThread` with `surface="overlay"` for the rail and
`surface="page"` for the expanded rail, `AgentIcon`, `AgentConnectingState`, and the hooks
`useChatEngine()` and `useChatRunStatus()`. The frame around them (the rail's panel and header, the
page's explorer and header, and the switches) belongs to the application and is built from SDK
primitives as below. Confirm these exports in the installed declarations first
(`$use-command-center-ai`).

## Keep One Engine For Both

Mount one `ChatEngineProvider` above the application's routes (`$mount-agent-conversation`) and
render the rail and the expanded rail inside it. A second provider for the page loses the
conversation on every switch. Pass `isVisible` true while the rail is open or the expanded rail is
on screen, and false otherwise, so the engine stops working while nothing shows it. Pass
`onRequestVisible` a function that opens the rail.

## The Right Rail

- **Size and place.** 540px wide, on the right edge, the full height below the application's top
  bar.
- **Two modes.** Docked: a column of the application's layout grid, so the page narrows to make room
  (`grid-template-columns: <sidebar> minmax(0, 1fr) 540px`). Overlay: a panel fixed over the page
  at the right edge, `min(540px, 100vw - 10px)` wide, raised with `--shadow-panel`. Dock the rail
  when the viewport is at least 1400px wide and float it below.
- **Header.** A 44px square tile holding the Agent's `AgentIcon`, with a sparkle as the fallback;
  the assistant's name and a one-line subtitle; then, at the right, an `Expand` button
  (`size="small"`, with an expand icon) and an icon-only close button with
  `aria-label="Close chat rail"`. Both come from the SDK's `/controls`
  (`$compose-command-center-controls`).
- **Body.** `ChatThread` in a flex column that can shrink (`min-height: 0`), so the thread scrolls
  inside the rail and the composer stays at its foot.
- **Opening.** A navigation entry or a top-bar button toggles the rail, and shows as active while
  the rail is open or the expanded rail is on screen. The rail never shows on the expanded rail's
  own route.
- **Closing.** Close hides the rail. When the person had opened another Agent's session in it
  (`hasDirectLaunchSelection()`), closing first returns the engine to the default session with
  `restoreDefaultSessionSelection()`.

```tsx
import { Expand, Sparkles, X } from "lucide-react";

import { Button } from "@dev-mainsequence/command-center-sdk/controls";
import { AgentIcon, ChatThread, type ChatThreadCopy, type ChatViewer } from "@dev-mainsequence/command-center-ai";

interface AssistantRailProps {
  agentUid: string | null;
  copy: Partial<ChatThreadCopy>;
  docked: boolean;
  viewer: ChatViewer;
  onClose: () => void;
  onExpand: () => void;
  onOpenModelProviderSettings: () => void;
}

export function AssistantRail({ agentUid, copy, docked, viewer, onClose, onExpand, onOpenModelProviderSettings }: AssistantRailProps) {
  return (
    <section aria-label="Assistant" className={docked ? "assistant-rail" : "assistant-rail assistant-rail--overlay"}>
      <header className="assistant-rail__header">
        <span className="assistant-rail__agent-icon">
          <AgentIcon agentUid={agentUid} fallback={<Sparkles />} />
        </span>
        <div className="assistant-rail__heading">
          <strong>Main Sequence AI</strong>
          <span>Assistant rail</span>
        </div>
        <Button size="small" onClick={onExpand}>
          <Expand /> Expand
        </Button>
        <Button aria-label="Close chat rail" iconOnly onClick={onClose}>
          <X />
        </Button>
      </header>
      <div className="assistant-rail__body">
        <ChatThread copy={copy} surface="overlay" viewer={viewer} onOpenModelProviderSettings={onOpenModelProviderSettings} />
      </div>
    </section>
  );
}
```

```css
.assistant-rail {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--card);
  border-left: 1px solid var(--border);
}

.assistant-rail--overlay {
  position: fixed;
  inset-block: 0;
  right: 0;
  z-index: 110;
  width: min(540px, calc(100vw - 10px));
  box-shadow: var(--shadow-panel);
}

.assistant-rail__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}
```

The icons are `lucide-react`, the set the SDK draws with; add it to the application's dependencies
to import it.

## The Expanded Rail

- **A route of its own.** Expand remembers where the person was (path, query, and hash), closes the
  rail, and navigates to the expanded rail's route with the active session in the URL,
  `?session=<id>` (`$manage-agent-sessions`). Minimize returns to the remembered place and reopens
  the rail in the mode the viewport prefers.
- **Layout.** The full content area below the application's top bar: a 320px session explorer at
  the left, then the conversation. Below the SDK's `lg` breakpoint (1024px) the explorer is an
  overlay with a scrim, and it can be collapsed at every width.
- **Header.** Above the thread, the Agent's name and the session's title, each on one truncated
  line, and at the right a run-status `Badge` from `useChatRunStatus()`: `primary` while thinking
  or responding, `success` when complete, `danger` on an error, `warning` while queued, and
  `neutral` when idle, with the label "Working" while the session works.
- **Actions.** In the explorer's header, icon-only `ghost` buttons, each with an `aria-label`: New
  session, Show or hide context (a card with the `viewContext` the engine sends), Collapse the
  explorer, and Minimize to rail.
- **Thread.** `ChatThread surface="page"` in a centred column at most 64rem wide.

## Words, People, And Agents

- Pass the application's words through `copy` over `DEFAULT_CHAT_THREAD_COPY`: the empty state's
  title and description, the composer's placeholder, the session loading and unavailable titles,
  and the disclaimer ("Main Sequence AI can make mistakes. Verify important outputs before
  acting."). Name the assistant as the rail's header does.
- Pass `viewer` (uid, name, avatar) so the person's own messages carry their avatar.
- Pass `onOpenModelProviderSettings` so the picker can send the person to the provider settings
  (`$manage-model-providers`); without it, the picker's sign-in action does not appear.
- While the default session loads or its Agent is missing (`defaultSessionStatus`), show a blocking
  state in the rail and the page in place of the thread, unless the session waits for a model
  choice (`sessionModelSelectionRequest`); the thread then shows the picker.

## Style With SDK Tokens

Every surface takes its look from the SDK theme: `--card` for the rail, `--border` for its edge,
`--shadow-panel` for the floating rail, `--primary` for the Agent tile, and the `Badge` variants for
the run status. Do not add gradients, glows, blurred shapes, or literal colours; they fail
`command-center-sdk theme audit`, and the Main Sequence themes are flat. Override the package's
`ms-chat-*` classes only with ordinary rules that use SDK tokens, loaded after its stylesheet; its
compact picker is the one place it uses `!important`. Follow `$theme-command-center-app`.

## Check The Phone Presentation

At 375×812 the rail is an overlay 10px narrower than the screen, and the explorer is an overlay with
a scrim. In one dark and one light theme, confirm the header's actions stay reachable, the composer
stays above the on-screen keyboard, and nothing scrolls sideways.

## Do Not Rebuild Owned Behavior

- Do not draw messages, reasoning, tool calls, the composer, the queue, or the model picker
  yourself; `ChatThread` owns them.
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
