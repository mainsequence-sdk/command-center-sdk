# Markdown Widget

Public package implementation of `core__markdown-note`.

- `definition.tsx` owns the manifest, IO output, agent snapshot, and preview fixtures.
- `MarkdownWidget.tsx` owns sanitized rendering and native package settings.
- `USAGE_GUIDANCE.md` supplies the catalog description and backend guidance.

The widget depends only on the public SDK/contracts, React Markdown, sanitization plugins, and a
Lucide icon. Keep props JSON-safe, preserve the raw Markdown string output, and do not add host auth,
routing, persistence, or application UI imports.
