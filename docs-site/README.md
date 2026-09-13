# Docs Site

This directory contains the Docusaurus site that publishes the SDK documentation from
[`command-center-sdk/docs/`](../command-center-sdk/docs).

## Entry Points

- `docusaurus.config.js`: site configuration, docs source mapping, navbar/footer links, and GitHub
  Pages-aware `url`/`baseUrl` resolution.
- `sdk-sidebars.js`: deliberate concept-based navigation for the Markdown docs under
  `../command-center-sdk/docs`.
- `src/css/custom.css`: docs-site-specific theming and layout overrides.
- `package.json`: local development, build, and preview scripts for the docs site.

## Build And Deploy

- Local dev: `npm --prefix docs-site run dev`
- Static build: `npm --prefix docs-site run build`
- GitHub Pages deploy workflow: [`.github/workflows/deploy-docs.yml`](../.github/workflows/deploy-docs.yml)

The deploy workflow publishes the generated `docs-site/build/` output whenever docs content or the
docs site configuration changes on `main`.

## Notes

- The docs source of truth is `command-center-sdk/docs/`, not `docs-site/docs/` or generated build
  output.
- Keep sidebar categories organized by reader intent: start, concepts, interface building,
  integrations, and maintenance. Do not let filename ordering become the information architecture.
- `docusaurus.config.js` keeps local development on `/docs/`, but switches to the repository Pages
  base path automatically when built in GitHub Actions.
- Override the canonical site or base path with `DOCS_SITE_URL` and `DOCS_BASE_URL` when publishing
  somewhere other than the configured GitHub Pages location.
