export const markdownWidgetUsageGuidance = `
## buildPurpose

Markdown-rendered workspace note for narrative text and runbooks.

## whenToUse

- Use when the content is static authored documentation or commentary.
- Use when downstream prompt-driven widgets should reuse the authored Markdown source as plain text.

## whenNotToUse

- Do not use when the content should come from structured upstream data or execution outputs.

## authoringSteps

- Add the widget and write the Markdown body.
- Adjust width, vertical alignment, and link behavior if needed.
- Bind \`Markdown content\` when another widget should consume the authored source text directly.

## inboundPorts

- None.

## outboundPorts

- \`markdown-content\` publishes the raw authored source as \`core.value.string@v1\`.
- The host-generated \`agent-context\` output exposes the widget snapshot.

## commonPitfalls

- Large operational datasets should use a table widget rather than a Markdown table.
- The output is authored Markdown source, not rendered HTML.
`;
