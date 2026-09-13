---
sidebar_position: 5
title: Application documentation
---

# Ship an end-user application guide at `/docs/`

The documentation shipped with a Command Center frontend is part of the application experience.
It should help a person find features, complete tasks, understand visible states, and recover from
problems they can act on. It is not an architecture site, API reference, or engineering manual.

This authoring guide matches the packaged
`documentation/document-command-center-application` skill and the official
`command-center-sdk application docs init` scaffold. The instructions on this page are for the
people and agents building the user guide; they are not copied into the served application docs.

## Keep the served content user-facing

Every page below the consuming application's `docs/` directory must explain application behavior
from the user's point of view. Cover:

- what the feature helps the user accomplish;
- where it appears in the application;
- who can access it and what must already be true;
- how to complete common tasks and verify their result;
- what important fields, statuses, empty states, and errors mean; and
- which recovery actions are available to the user.

Do not publish architecture, components, package entrypoints, source paths, APIs, schemas, backend
transport, authentication implementation, local development, tests, deployment, ADRs, or
maintainer procedures in the application user guide. Engineering documentation may remain in the
repository's established maintainer location outside the served `docs/` tree.

Code and tests can help an author discover behavior, but the running application is the final
source for visible labels, menu structure, states, and results. Do not invent behavior when the
evidence is incomplete.

## Inspect the application first

Before adding pages:

1. Exercise the application and inventory its complete visible menu.
2. Record stable menu IDs, exact labels, order, nesting, and application routes.
3. Use the supported-role superset when permissions change the visible menu.
4. Exercise each destination's primary workflows and visible states.
5. Record missing or unverified behavior as a documentation gap.

The documentation structure comes from this inventory. Do not start with generic categories such
as “technical documentation” or “application surfaces.”

## Initialize the documentation system

Run at the frontend's Git and npm root. The root must contain `package.json`, `package-lock.json`,
and an application `build` script.

```bash
npx command-center-sdk application docs init --path . --dry-run
npx command-center-sdk application docs init --path .
```

Initialization:

- preserves the existing application build as `build:app` and makes root `build` produce the
  application and user guide;
- installs exact Docusaurus dependencies into the existing root dependency graph;
- configures the user guide at `/docs/`;
- creates `docs/index.md` as the help landing;
- creates the schema-version-2 navigation manifest and generated summary and sidebar; and
- installs toolchain, navigation, content, and link validators.

Use `--skip-install` only when npm installation will be performed separately. The initializer does
not overwrite a different existing page, script, configuration, or manifest value.

## Mirror the application menu in folders

Use one folder for every visible application-navigation node and one `index.md` in every folder.
Use stable lowercase kebab-case menu IDs as folder names and exact UI labels as titles.

```text
application menu                          user-guide source
Build                                     docs/build/index.md
  Services                                docs/build/services/index.md
    Create a service (documentation task) docs/build/services/create-a-service.md
```

`docs/index.md` is the only authored Markdown page at the root. Documentation-only tasks live
inside the nearest owning navigation folder. Dialogs, create/edit flows, and contextual actions do
not create unrelated top-level folders. Truly global guidance belongs on the help landing.

Represent the same hierarchy in `documentation/navigation.json`:

```json
{
  "schemaVersion": 2,
  "sidebarId": "userGuideSidebar",
  "home": {
    "label": "User guide"
  },
  "navigation": [
    {
      "id": "build",
      "label": "Build",
      "kind": "section",
      "applicationRoute": "/build",
      "pages": [],
      "items": [
        {
          "id": "services",
          "label": "Services",
          "kind": "feature",
          "applicationRoute": "/build/services",
          "pages": [
            {
              "id": "create-a-service",
              "label": "Create a service"
            }
          ],
          "items": []
        }
      ]
    }
  ]
}
```

The generator derives document paths from the nested IDs. Authors cannot supply an unrelated
`doc` path. `kind` is `section` for a navigation grouping and `feature` for a usable application
destination. Entries in `pages` are task guides owned by that destination.

Run `npm run docs:sync` after editing the manifest. It generates `docs/SUMMARY.md` and
`documentation/sidebars.mjs` in the same order. Commit all three files and never hand-edit the two
generated files.

## Write complete pages

Every page declares `title`, a concrete `description`, `audience: end-user`, and one of these
`pageType` values:

- `home` for `docs/index.md`; include `## Find a feature`;
- `section` for a navigation group; include `## What you can do` and `## Choose a feature`;
- `feature` for an application destination; include `## Open this page`, `## What you can do`,
  `## Common tasks`, `## Understand what you see`, and `## If something goes wrong`; and
- `task` for a substantial workflow; include `## Before you start`, `## Steps`,
  `## Expected result`, and `## If something goes wrong`.

Task steps are numbered and use exact visible control names. Always state the visible result that
proves success. Prefer one complete feature page over multiple pages that merely restate menu
labels. Do not use a word count as a substitute for actual task, state, and recovery coverage.

Served pages must not contain fenced source code, implementation diagrams, repository links, SDK
package imports, or engineering-only sections. Screenshots must come from the current application,
exclude sensitive data, and communicate something that stable prose cannot explain as clearly.

## Use one runtime and build artifact

Use the application's root `package.json`, root `package-lock.json`, root Node pin, and root npm
commands. Do not add a nested lockfile or switch documentation commands to another package
manager. The generated checks require one even-numbered Node.js LTS major at or above 20 across
`engines.node`, `.node-version` or `.nvmrc`, the active runtime, and applicable workflows.

Keep `documentation/package.json` without a `type` field, even when the application root is pure
ESM. The generated `.mjs` configuration remains explicit ESM while Docusaurus retains the module
mode its build expects.

The release contract is:

```text
npm run build
├── npm run build:app  -> dist/index.html and application assets
└── npm run build:docs -> dist/docs/index.html and user-guide assets
```

The Docusaurus site uses `/docs/` as its production base, fails on broken links, disables unrelated
blog and page routes, and links back to `/`. A local application server may proxy `/docs/` to
`npm run docs:dev`, but production must serve the generated `dist/docs` content and nested routes.

## Validate content and browser behavior

Run:

```bash
npm run docs:sync
npm run docs:check
npm run build
```

`docs:check` verifies the Node and npm toolchain, generated files, folder-to-navigation parity,
required page metadata and sections, local links, task procedures, and clear implementation-only
content. The Docusaurus build provides final MDX, route, and broken-link validation.

Against the built artifact or a production-equivalent static server, prove:

1. the normal application route renders;
2. `/docs/` renders without a redirect loop;
3. every documentation navigation entry resolves;
4. a nested documentation deep link works when opened directly;
5. documentation labels, nesting, and ordering match the application menu;
6. the application help link and user-guide return link work; and
7. same-origin `/docs/` scripts, styles, and images load successfully.

Exercise the supported desktop browser and a narrow viewport. Verify both color modes when the
product supports them. A successful static build does not replace integrated browser verification.

## Migrate the previous scaffold deliberately

Schema version 1 required `docs/surfaces/` and `docs/technical/`. Version 2 intentionally rejects
that layout.

Move user-facing pages from `surfaces/` into folders matching the current application menu. Move
architecture and maintainer pages outside the served `docs/` tree. Preserve established
user-guide URLs with explicit aliases or redirects when consumers may rely on them. The
initializer does not delete or silently rewrite either legacy tree.

## Ownership boundary

The SDK scaffold owns the portable Docusaurus configuration, manifest rules, generated navigation,
validation, and `dist/docs` recipe. The consuming frontend owns its verified user content,
application-menu projection, help-link placement, route aliases, and browser tests. The deployment
platform owns serving the combined `dist/` artifact, domains, and release orchestration.
