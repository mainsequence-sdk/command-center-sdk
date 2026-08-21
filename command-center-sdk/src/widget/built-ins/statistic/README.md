# Statistic Widget

Public package implementation of `core__statistic`.

- `definition.tsx` owns the consumer manifest, IO, snapshot, and demo fixture.
- `model.ts` performs framework-independent tabular reduction.
- `StatisticWidget.tsx` renders cards and package-local settings.
- `USAGE_GUIDANCE.md` supplies catalog and backend guidance.

The widget accepts `core.tabular_frame@v1`; upstream execution and streaming stay host-owned. Keep
aggregation pure, preserve the widget id and existing props, and avoid importing Command Center
runtime stores or managed-connection application adapters.
