export const statisticWidgetUsageGuidance = `
## buildPurpose

Reduces a bound canonical tabular frame into one or more statistic cards.

## whenToUse

- Use for KPIs derived from a tabular source.
- Use grouping to produce one card per category.

## whenNotToUse

- Do not use for free-form narrative content or full row inspection.

## authoringSteps

- Bind \`Seed data\` or \`Live updates\` to a \`core.tabular_frame@v1\` output.
- Select the value field and aggregation mode.
- Optionally select grouping, ordering, formatting, and column count.

## inboundPorts

- \`seedData\` accepts one canonical tabular frame snapshot.
- \`liveUpdates\` accepts a canonical tabular frame update.

## outboundPorts

- None. Statistic is a presentation consumer.

## runtimeOwnership

- Consumer. The upstream widget or host owns execution and streaming.

## commonPitfalls

- Numeric aggregations require a numeric value field.
- \`first\` and \`last\` use the optional order field when provided.
`;
