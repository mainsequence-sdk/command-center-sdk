---
sidebar_position: 5
title: Application documentation
---

# Ship application documentation at `/docs/`

Every maintained Command Center frontend should explain both what people can do and how engineers
can safely change it. Keep that documentation beside the application, validate it in the same npm
project, and ship it in the same static artifact at `/docs/`.

This guide matches the `documentation/document-command-center-application` skill and the official
`command-center-sdk project docs init` scaffold.

## Initialize the documentation system

Start at the frontend's Git and npm root. The root must contain `package.json` and
`package-lock.json`, and the application must already have a `build` script.

```bash
npx command-center-sdk project docs init --path . --dry-run
npx command-center-sdk project docs init --path .
```

The dry run reports every file and manifest field that would change. Initialization:

- preserves the existing application build as `build:app` and makes root `build` produce both the
  application and documentation;
- installs exact Docusaurus dependencies into the existing root dependency graph;
- adds the official Docusaurus configuration with `baseUrl: "/docs/"`;
- creates audience-specific `docs/surfaces/` and `docs/technical/` roots;
- creates a canonical `documentation/navigation.json` and its generated `SUMMARY.md` and sidebar;
- installs portable toolchain, navigation, and content validators; and
- aligns `engines.node`, `.node-version` or `.nvmrc`, and the active Node runtime.

Use `--skip-install` only when npm installation must be performed separately. The initializer
never overwrites a different existing documentation file, script, or dependency declaration. A
conflict is an integration task: preserve the existing content and reconcile it deliberately.

## One repository, runtime, and lockfile

Documentation is not a nested JavaScript product. Use the application's root `package.json`,
root `package-lock.json`, root Node pin, and root npm commands. Do not add a second lockfile below
`documentation/` or switch documentation commands to Yarn, pnpm, or Bun.

The generated `npm run docs:check` verifies:

- `engines.node` selects one even-numbered LTS major at or above 20, such as `24.x`;
- `.node-version` or `.nvmrc` selects that same major;
- the running Node process uses that major;
- any checked-in Main Sequence workflow `node_version` agrees;
- `package-lock.json` is the only root package-manager lockfile; and
- `packageManager`, when present, selects npm.

The check also calls out a known install hazard: a lockfile containing
`postman-code-generators` together with a root `packageManager` declaration. That dependency can
invoke globally installed Yarn during postinstall, which can make Corepack reject the install even
though npm owns the project. The base template intentionally excludes OpenAPI tooling. Add it only
after pinning and validating its complete install lifecycle in a clean environment.

Keep `documentation/package.json` without a `type` field even when the application root uses
`"type": "module"`. Docusaurus's webpack pipeline requires ambiguous module mode for the site;
the generated `.mjs` configuration and sidebar remain explicitly ESM. Declaring the nested site as
pure ESM can leave `require.resolveWeak` in the server bundle and fail static generation.

## Write for two audiences

Put user-visible product behavior under `docs/surfaces/`. Describe the purpose of each surface,
who can use it, its important workflows, empty/loading/error states, and visible limitations. Use
screenshots only when they communicate behavior that prose cannot keep current.

Put engineering and operational material under `docs/technical/`. Document architecture,
published SDK entrypoints, API and authentication ownership, runtime assumptions, build and test
commands, failure behavior, deployment boundaries, and maintenance constraints. Link to canonical
contracts instead of copying schemas or private API responses.

Never document access tokens, secrets, private endpoint values, customer data, or credentials.
Keep volatile implementation inventories out of user guides. When a deployment workflow is
platform-owned, link to that workflow and document only the portable `dist/` artifact contract in
the frontend.

## Generate navigation from one source

Edit `documentation/navigation.json`, then run:

```bash
npm run docs:sync
```

That one manifest generates both `docs/SUMMARY.md` and `documentation/sidebars.mjs`. Commit all
three files. Do not hand-edit the generated files: `npm run docs:check` fails when either is stale,
a page is absent from navigation, an ID is duplicated or unsafe, or a Markdown/MDX file is placed
outside the two audience roots.

Every navigation item has this shape:

```json
{
  "label": "Projects",
  "doc": "surfaces/projects",
  "items": []
}
```

`doc` is the extension-free path below `docs/`. Nested items generate nested Docusaurus categories
and matching `SUMMARY.md` entries in the same order.

## Build one deployable artifact

The scaffold establishes this release contract:

```text
npm run build
├── npm run build:app  -> dist/index.html and application assets
└── npm run build:docs -> dist/docs/index.html and documentation assets
```

The application build runs first; Docusaurus writes into the existing `dist/docs` directory
without becoming a second deployment. The generated site uses `/docs/` as its production base,
fails on broken links, disables unrelated blog and page routes, and links back to `/`.

For local development, run `npm run docs:dev`. An application may proxy `/docs/` to port `3011`
while its Vite server is running, but that proxy is development-only. Production and preview
servers must serve the built `dist/docs` content and support direct deep links below `/docs/`.

## Validate and verify in a browser

Run the source and build gates first:

```bash
npm run docs:check
npm run build
```

Then extend the frontend's existing browser suite. Against the built artifact or a
production-equivalent static server, prove:

1. the normal application route still renders;
2. `/docs/` renders without a redirect loop;
3. at least one nested documentation URL works when opened directly;
4. the application documentation link targets `/docs/`;
5. the documentation back link targets `/`; and
6. same-origin `/docs/` scripts, styles, and images load without error responses.

Exercise the project's supported desktop browser and a narrow viewport. Verify light and dark
documentation when the product supports both. A successful Docusaurus compilation is necessary,
but it does not replace integrated browser verification of the final artifact.

## Ownership and extension boundary

The SDK scaffold owns reusable documentation structure, validation, navigation generation,
Docusaurus defaults, and the `dist/docs` output recipe. The consuming frontend owns its authored
content, application link placement, local proxy, browser tests, and any deliberate configuration
extension. The deployment platform owns uploading and serving `dist/`, domains, routing
infrastructure, and release orchestration.

Keep custom Docusaurus plugins minimal. Pin every added dependency, explain why the base template
is insufficient, run the install under the declared Node runtime, and retain the `/docs/` and
single-artifact contracts.
