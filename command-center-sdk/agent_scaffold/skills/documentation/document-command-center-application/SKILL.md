---
name: document-command-center-application
description: Create, migrate, validate, build, and review the end-user help site shipped with a Command Center frontend. Use when an application needs task-focused documentation at /docs/, a documentation tree that mirrors its visible navigation, the command-center-sdk application docs init scaffold, or browser verification of the combined application and user-guide artifact. Do not use this skill to publish architecture, source-code, API-contract, deployment, or maintainer documentation.
---

# Document A Command Center Application

## Publish A User Guide, Not An Engineering Manual

Treat `/docs/` as part of the application experience. Every served page must help an application
user understand a feature, find it, complete a task, interpret a visible state, or recover from a
problem they can act on.

Do not publish architecture, source paths, components, package entrypoints, APIs, schemas, backend
transport, authentication implementation, build instructions, tests, deployment, ADRs, or
maintainer notes in the application user guide. Repository engineering documentation may exist
outside the served `docs/` tree, but creating or reorganizing it is outside this skill.

Code, tests, routes, and contracts may be inspected as evidence. Translate that evidence into
verified user-visible behavior; never expose the implementation as the subject of a page.

## Discover The Application Before Writing

1. Inspect the rendered application and its complete visible navigation. Use the supported-role
   superset when menu items vary by permission, and record access requirements on affected pages.
2. Record menu IDs, exact labels, ordering, nesting, and application routes. Prefer stable
   application-owned IDs for folder names; derive a stable kebab-case ID only when none exists.
3. Exercise each destination and record its purpose, entry conditions, primary tasks, controls,
   empty/loading/success/error states, visible limitations, and user-recoverable failures.
4. Reconcile source evidence with the running UI. Use current UI labels and observed behavior when
   old documentation or implementation comments disagree.
5. Identify gaps instead of inventing behavior. A page is not complete merely because it exists.

Read [the user-documentation standard](references/user-documentation-standard.md) before authoring
or reviewing pages.

## Initialize Or Migrate The Site

At the consuming frontend's Git and npm root, preview and apply the official scaffold:

```bash
npx command-center-sdk application docs init --path . --dry-run
npx command-center-sdk application docs init --path .
```

The initializer preserves existing authored files and adds the `/docs/` Docusaurus site to the
application's root npm dependency graph and production artifact. Use `--skip-install` only when
dependency installation must be performed separately.

For initialization, migration, toolchain failures, or output-layout changes, read
[the build and toolchain reference](references/build-and-toolchain.md). Never overwrite existing
documentation or delete legacy content automatically.

## Mirror The Application Navigation

Maintain `documentation/navigation.json` as the ordered projection of the visible application
menu. Schema version 2 derives document paths from navigation IDs:

```text
application menu                          user-guide source
Build                                     docs/build/index.md
  Services                                docs/build/services/index.md
    Create a service (documentation task) docs/build/services/create-a-service.md
```

Apply these rules:

- `docs/index.md` is the only authored Markdown page at the root and is the global help landing.
- Every application-menu node is one folder with an `index.md` page.
- Folder nesting and sibling order match the application menu.
- Documentation-only task pages live inside the closest owning navigation folder.
- Dialogs, create/edit flows, and contextual actions never create unrelated top-level folders.
- Truly global guidance belongs on the help landing; do not invent generic technical categories.
- Labels in the manifest and page titles match the UI exactly.

Do not provide an arbitrary document path for a navigation node. Run `npm run docs:sync` to derive
`docs/SUMMARY.md` and `documentation/sidebars.mjs`; never edit those generated files by hand.

When upgrading a schema-version-1 site, move useful `surfaces/` content into its matching menu
folders and move engineering material outside the served `docs/` tree. Preserve already-published
user-guide URLs with deliberate aliases or redirects when consumers may rely on them.

## Write Complete Task-Focused Pages

Use the prescribed `home`, `section`, `feature`, and `task` page types from the writing standard.
Every page declares `audience: end-user`, uses the exact visible UI vocabulary, starts with the
user outcome, and contains the required behavioral sections for its page type.

Prefer a complete parent page over several thin pages. A feature page should explain how to open
the feature, what the user can do, its common tasks, what important states mean, and what the user
can do when something goes wrong. A task page should state prerequisites, numbered steps, the
expected visible result, and recovery guidance.

Do not add code fences, implementation diagrams, repository links, or developer terminology to
served pages. Screenshots must come from the current application, omit sensitive data, and add
information that stable prose cannot communicate as clearly.

## Build And Verify The Combined Artifact

Run from the application root:

```bash
npm run docs:sync
npm run docs:check
npm run build
```

The release build must produce both `dist/index.html` and `dist/docs/index.html`. A standalone
documentation build is useful for diagnosis, but it does not prove the deployed artifact contains
the application and its help site together.

Against the built artifact or a production-equivalent static server, verify:

1. the application still loads;
2. `/docs/` loads without a redirect loop;
3. every generated user-guide navigation entry resolves;
4. one nested documentation deep link loads directly;
5. documentation labels, ordering, and nesting match the application menu;
6. the application-to-help and help-to-application links work; and
7. no same-origin `/docs/` asset request fails.

Exercise a supported desktop browser and a narrow viewport. Verify light and dark modes when the
application supports both.

## Report The Result

Report the application navigation branches documented, user tasks and states covered, deliberate
content gaps, migrated or retired pages, validation and build results, output location, and browser
routes exercised. Report toolchain or deployment concerns separately; they do not belong in the
served user guide.
