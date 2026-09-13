# Changelog

## Unreleased

No unreleased changes.

## 0.2.1

- Reorganize the SDK documentation around architecture, ownership, resource, interface,
  integration, and operational concepts; add deeper public API, theme, embed, and operations
  guides; and verify the complete guide set in the published package artifact.
- Add the accepted static-site FastAPI WebSocket bridge with one-time ticket resolution, strict
  additive v1 messages, native protocol ordering, cancellation and lifecycle invalidation,
  language-neutral fixtures, and real-browser handshake coverage.
- Refactor the application-documentation skill and scaffold into an end-user-only help system.
  Schema-version-2 navigation now derives the docs folder tree from stable application-menu IDs,
  while validation enforces user-facing page types, task completeness, navigation parity, and the
  exclusion of architecture and implementation material from the served `/docs/` site.
- Retheme the `quartz-light` preset ("Main Sequence Light") to the light half of the Linear-derived
  dark theme: white canvas, dead-neutral grey surfaces (`#F8F8F8`, `#F4F4F4`, `#F0F0F0`), soft
  charcoal text at `#282A30`, the same `#5E6AD2` indigo brand, and `radius` from `16px` to `8px`.
  Status tokens are Linear's light hues darkened along their own hue until they clear WCAG AA as
  text on white (`danger #E42020`, `success #1F8536`, `warning #8D7000`), because the SDK paints
  cells and pills with these tokens as text; the previous `success` and `warning` failed. Give the
  theme its own chrome block: no background gradient, no panel shadow, lighter dialog and picker
  shadows, and a solid `::selection` pair. Add a data-visualization palette whose series clear 3:1
  on white and whose scales are hue-matched for the palette resolver. The theme ID and every token
  key are unchanged.

## 0.2.0

- Narrow the SDK to reusable application navigation, layout, feedback, resource, theme, contract,
  documentation, and static-site embed primitives.
- Remove product-domain exports, schemas, examples, styles, skills, and compatibility aliases.
- Keep one public package and validate it through source, schema, packed-consumer, and documentation
  checks.
