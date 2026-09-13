# End-User Documentation Standard

Use this standard for every Markdown or MDX page served at `/docs/`.

## Audience Boundary

Write to a person using the application. Explain what they can accomplish, where to go, what to
select or enter, what result to expect, what visible states mean, and how to recover when they can.

Do not explain:

- application architecture or engineering decisions;
- source files, components, hooks, functions, types, or package exports;
- endpoints, protocols, request or response shapes, schemas, or backend transport;
- authentication, authorization, or persistence implementation;
- local development, builds, tests, deployment, monitoring, or rollback; or
- ADRs, contributor workflows, release notes, or maintainer ownership.

It is acceptable to explain a user-visible permission, status, integration, or application feature
whose UI label contains words such as “API” or “deployment.” Describe only what the user sees and
does. Do not turn that into implementation documentation.

## Evidence And Voice

- Verify the current UI before writing. Use source and tests only to find behavior that still needs
  browser confirmation.
- Use the exact labels shown by the application. Write `Build → Services`, not a guessed route or
  internal feature name.
- Lead with the user outcome. Prefer “Create a service” to “Service creation functionality.”
- Use direct second-person instructions and short, concrete sentences.
- State access requirements in user terms, such as the role or permission shown by the product.
- Describe limitations only when they affect a user's decision or next action.
- Never expose credentials, tokens, private endpoint values, customer data, or copied private
  responses.

## Required Frontmatter

Every page declares:

```yaml
---
title: Exact visible title
description: A concrete sentence explaining what the user can accomplish here.
audience: end-user
pageType: feature
---
```

The allowed `pageType` values are `home`, `section`, `feature`, and `task`. Only `docs/index.md`
uses `home`. Navigation landing pages use `section` or `feature`. Supplemental workflow pages use
`task`.

## Page Types

### Home

The help landing introduces the application in user terms and tells the reader how to find a
feature. It must contain `## Find a feature`. Keep truly global prerequisites or support guidance
here instead of inventing a top-level documentation category that is absent from the application.

### Section

A section landing corresponds to a visible navigation group. It must contain:

- `## What you can do`, summarizing the outcomes available in the section; and
- `## Choose a feature`, linking to and distinguishing its visible child destinations.

Do not create one-line directory placeholders. If the menu group has children, explain how a user
chooses among them.

### Feature

A feature landing corresponds to a visible application destination. It must contain:

- `## Open this page`, with the exact navigation breadcrumb and access prerequisites;
- `## What you can do`, describing the feature's user outcomes;
- `## Common tasks`, with real actions and expected results;
- `## Understand what you see`, explaining meaningful fields, statuses, and empty/loading states;
  and
- `## If something goes wrong`, containing only recovery actions available to the user.

If the destination has only one short workflow, keep that workflow on the feature page. Create a
separate task page only when it materially improves findability or comprehension.

### Task

A task page must contain:

- `## Before you start`;
- `## Steps`, with a numbered procedure;
- `## Expected result`; and
- `## If something goes wrong`.

Each step names the visible control or field and explains decisions the user must make. Never stop
at “save the form”; state what confirmation, status, or changed screen proves success.

## Information Architecture

Use stable navigation IDs as folder names and exact UI labels as titles:

```text
docs/
  index.md
  build/
    index.md
    services/
      index.md
      create-a-service.md
```

Every menu node owns a folder and `index.md`. A workflow that is not itself a menu item belongs
inside the closest feature folder. Root-level authored pages other than `index.md` are forbidden.

Use the navigation superset across supported roles. Explain who can see a restricted item instead
of duplicating the documentation tree for each role.

## Quality Gate

Reject or consolidate a page when it only restates a menu label, lists controls without explaining
their effect, omits the expected result, or describes an error without a user action. Do not use a
word count as a substitute for behavioral coverage.

Served pages must not contain code fences, source-code or repository links, implementation
diagrams, or headings dedicated to architecture, development, testing, APIs, schemas, deployment
internals, or maintainer instructions.
