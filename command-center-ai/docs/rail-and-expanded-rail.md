# The Right Rail and the Expanded Rail

Command Center shows AI in two places that share one conversation: a right rail beside the page the
person is working on, and the expanded rail, a full page for longer work. An application built on
Command Center AI uses the same two, so it looks and behaves like Command Center. Its agent skill is
`compose-command-center-ai-rail`.

The package draws the thread (`ChatThread`, with `surface="overlay"` in the rail and
`surface="page"` in the expanded rail). The frame around it is the application's, built with the
SDK's controls and theme tokens. Mount one `ChatEngineProvider` above both, so switching between
them keeps the conversation.

## The right rail

| Aspect | Rule |
| --- | --- |
| Size and place | 540px wide, on the right edge, the full height below the application's top bar. |
| Docked | From a 1400px viewport: a column of the layout grid, so the page narrows to make room. |
| Overlay | Below 1400px: a panel fixed over the page, `min(540px, 100vw - 10px)` wide, raised with `--shadow-panel`. |
| Header | The Agent's `AgentIcon` in a 44px tile, the assistant's name and a subtitle, then an `Expand` button and an icon-only close button, both from the SDK's `/controls`. |
| Body | `ChatThread` in a flex column that can shrink, so the thread scrolls and the composer stays at the foot. |
| Closing | Hides the rail; when another Agent's session was open, the engine first returns to the default session. |

## The expanded rail

| Aspect | Rule |
| --- | --- |
| Route | Expand remembers where the person was, closes the rail, and opens the expanded rail's route with `?session=<id>`. Minimize returns there and reopens the rail. The rail never shows on this route. |
| Layout | A 320px session explorer at the left (an overlay with a scrim below 1024px, collapsible at every width), then the conversation. |
| Header | The Agent's name and the session's title, and a run-status `Badge` from `useChatRunStatus()`. |
| Actions | New session, Show context, Collapse the explorer, and Minimize to rail, as icon-only ghost buttons. |
| Thread | `ChatThread surface="page"` in a centred column at most 64rem wide. |

## Look

Everything uses the SDK theme: `--card` for the rail, `--border` for its edge, `--shadow-panel` when
it floats, `--primary` for the Agent tile, and the `Badge` variants for the run status. No gradients,
glows, or literal colours: they fail `command-center-sdk theme audit`, and the Main Sequence themes
are flat. The application's words go through the thread's `copy`, including a disclaimer that the
assistant can make mistakes.

## Verify

Open the rail at 1440×900 (docked) and 1280×800 (overlay); expand, send a message, and minimize, and
the conversation is the same in both; check 375×812 in a dark and a light theme; and run the theme
audit. The [Build an AI application](./build-an-ai-application.md) guide covers the scripted
stand-in.
