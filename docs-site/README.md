# Docs Site

This directory contains the Docusaurus site that publishes the Command Center documentation from the top-level [`docs/`](../docs) folder.

## Entry Points

- `docusaurus.config.js`: site configuration, docs source mapping, navbar/footer links, and GitHub Pages-aware `url`/`baseUrl` resolution.
- `sidebars.js`: sidebar structure for the Markdown docs under `../docs`.
- `src/css/custom.css`: docs-site-specific theming and layout overrides.
- `package.json`: local development, build, and preview scripts for the docs site.

## Build And Deploy

- Local dev: `npm --prefix docs-site run dev`
- Static build: `npm --prefix docs-site run build`
- GitHub Pages deploy workflow: [`.github/workflows/deploy-docs.yml`](../.github/workflows/deploy-docs.yml)

The deploy workflow publishes the generated `docs-site/build/` output whenever docs content or the docs site configuration changes on `main`.

## Notes

- The docs source of truth is the repository-level `docs/` directory, not `docs-site/docs/`.
- `docusaurus.config.js` keeps local development on `/docs/`, but switches to the repository Pages base path automatically when built in GitHub Actions.
- If the production app URL changes, set `COMMAND_CENTER_APP_URL` in the docs environment or update the fallback in `docusaurus.config.js`.
