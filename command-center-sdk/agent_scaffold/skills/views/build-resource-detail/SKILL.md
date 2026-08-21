---
name: build-resource-detail
description: Build or migrate a single-object experience with ResourceDetailShell and EntitySummary from @dev-mainsequence/command-center-sdk/views. Use for controlled breadcrumbs, summaries, header action placement, loading and error content, flat tabs, nested tabs, related-resource sections, and domain-specific content inside standard detail composition.
---

# Build A Resource Detail

## Use The Detail Shell

Use `ResourceDetailShell` when the screen represents one identified resource and needs standard
breadcrumbs, summary placement, header actions, tabs, nested tabs, loading, or controlled error
presentation. Keep the shell even when individual tab bodies are domain-specific.

Use `EntitySummary` or `CollapsedEntitySummary` directly only inside a composition that does not
need the full detail lifecycle.

## Read The Exact Contract

Inspect the installed `/resource` and `/views` declarations, `ResourceDetailShellProps`, entity
summary models, and tests. Treat the installed version as authoritative.

## Compose The Detail

1. Keep the selected resource id, active tab ids, routing, queries, and mutations controlled by the
   consumer.
2. Normalize entity identity, badges, fields, highlights, statistics, labels, and warnings into the
   SDK summary model.
3. Provide callbacks for navigation, editing, labels, links, and other behavior; do not put
   transport instructions in the summary view model.
4. Declare stable flat or primary/secondary tab ids and render domain content inside the selected
   content region.
5. Render related object collections through embedded `$build-resource-list` compositions.
6. Render consumer-controlled action elements through `headerActions`. Use
   `$add-resource-actions` to distinguish this slot from the automated list bulk-action lifecycle.

## Do Not Rebuild Owned Behavior

Do not create a separate breadcrumb header, summary card system, tab styling, blocking transition,
or detail error shell. Do not encode routes or backend endpoints in reusable SDK models.

## Verify

Test loading, each consumer-provided error state, summary, header actions, flat tabs, nested tabs,
and controlled navigation. Confirm unknown domain tab content does not take ownership of
surrounding SDK chrome.
