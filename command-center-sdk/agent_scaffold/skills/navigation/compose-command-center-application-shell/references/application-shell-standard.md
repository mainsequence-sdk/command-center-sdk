# Command Center application-shell standard

## Required architecture decision

Record these facts before implementation:

```text
Production embedding: main Command Center iframe
Standalone mode: local development/test only, or none
Navigation depth: 0, 1, or 2
Durable destinations and hrefs:
Page-local tabs:
Host-context readiness signal:
Delegated-transport readiness signal:
Critical application readiness endpoint:
Transient retry and timeout policy:
Terminal retry action:
Reconnect behavior:
```

If the destination hierarchy does not justify a depth, simplify it. Names do not create hierarchy:
a label such as “Manage” around all destinations carries no information and must be removed.

## Ownership rules

| Host Command Center | Embedded child application |
| --- | --- |
| Global application selection | Routes within this application |
| Global top navigation and branding | Optional depth-one panel or depth-two rail + panel |
| Account, settings, and session controls | Domain actions and page headers |
| Iframe placement and delegated transport | Readiness checks and route commitment |

A page title and actions belong in `ApplicationPageHeader`; that is content, not a top navigation
bar. On phones, use the SDK floating navigation trigger. Do not add a header solely to hold a menu
button.

## Migration audit

When standardizing an existing application:

1. Locate every header, nav, aside, route definition, startup effect, API bootstrap, iframe bridge,
   media query, and custom loading component.
2. Remove child-owned global/top chrome and duplicate app switching.
3. List durable destinations and select depth 0, 1, or 2 from the decision table.
4. Replace custom responsive sidebar logic with the matching SDK shell.
5. Merge host, transport, and API readiness into one explicit root state machine.
6. Keep route content unmounted until ready and restore the gate on reconnect.
7. Replace page-global custom loaders with `ApplicationStatusScreen`; retain local loading in the
   owning resource surface.
8. Run shell conformance in startup and ready phases, then run page-layout and theme verification.

Treat route IDs and released navigation IDs as compatibility identifiers. Preserve them during a
visual migration unless a coordinated route migration is part of the task.
