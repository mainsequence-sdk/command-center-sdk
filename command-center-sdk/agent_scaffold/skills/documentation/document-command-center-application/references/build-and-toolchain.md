# User-Guide Build And Toolchain Reference

Read this reference when initializing or migrating the documentation site, changing its build, or
diagnosing a documentation toolchain failure. These are authoring and release instructions; do not
copy them into the served application user guide.

## One Application And One Artifact

Run the documentation tooling from the consuming frontend's Git and npm root. The application and
documentation share the root `package.json`, `package-lock.json`, Node pin, dependency graph, and
release build.

```text
npm run build
  -> npm run build:app
  -> npm run build:docs
  -> dist/index.html
  -> dist/docs/index.html
```

Docusaurus uses `baseUrl: "/docs/"`, reads the repository's `docs/` directory, disables unrelated
blog and page routes, and fails on broken links. A development proxy may send `/docs/` to the
Docusaurus dev server, but production must serve the generated `dist/docs` tree and support direct
deep links.

## Initialize Safely

Preview before writing:

```bash
npx command-center-sdk application docs init --path . --dry-run
npx command-center-sdk application docs init --path .
```

The initializer requires `package.json` and `package-lock.json`, rejects competing lockfiles,
aligns `.node-version` or `.nvmrc` with `engines.node` and the running Node process, preserves
existing files, and installs exact Docusaurus development dependencies with npm. Use
`--skip-install` only when installation will be completed separately.

Stop on a file conflict and integrate it deliberately. Do not overwrite authored pages, replace a
custom Docusaurus configuration silently, or add another lockfile.

## Node And Module Mode

Use one even-numbered Node.js LTS major at or above 20. Declare the exact major in `engines.node`
and one root pin in `.node-version` or `.nvmrc`. Keep npm and the root `package-lock.json`
authoritative.

Keep `documentation/package.json` without a `type` field. The root application may use
`"type": "module"`; the nested Docusaurus boundary stays in ambiguous module mode while its `.mjs`
configuration and sidebar remain explicitly ESM. Setting the nested package to pure ESM can leave
`require.resolveWeak` calls uncompiled in the server bundle and fail static generation.

The toolchain check also rejects the known combination of a lockfile containing
`postman-code-generators` and a root `packageManager` declaration. That dependency can invoke a
globally available Yarn during postinstall and conflict with Corepack. The scaffold intentionally
does not add OpenAPI generation tooling.

## Commands

```bash
npm run docs:dev
npm run docs:sync
npm run docs:check
npm run build:docs
npm run build
```

`docs:sync` generates `docs/SUMMARY.md` and `documentation/sidebars.mjs` from
`documentation/navigation.json`. `docs:check` verifies the toolchain, generated navigation,
navigation-to-folder parity, required user-documentation structure, local links, and forbidden
implementation material. The root `build` remains the release gate for the combined artifact.

## Migrate Schema Version 1

Schema version 1 grouped pages under `docs/surfaces/` and `docs/technical/`. Do not delete those
trees automatically.

1. Inventory the current application menu and create schema-version-2 navigation nodes.
2. Move each useful user-facing page from `surfaces/` into the matching navigation folder.
3. Rewrite pages to the current page templates and exact UI terminology.
4. Move architecture and maintainer material to the repository's established engineering-docs
   location outside the served `docs/` tree.
5. Preserve published user-guide URLs with explicit aliases or redirects where required.
6. Regenerate navigation, validate, build, and exercise old and new deep links deliberately.
