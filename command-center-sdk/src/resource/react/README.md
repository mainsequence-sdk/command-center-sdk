# Resource React State

This module contains React state helpers for resource applications. `index.ts` is its public
entrypoint and exports `useResourceSelection` for loaded-page selection plus
`useResourceBulkSelection` for the distinct explicit/all-matching server-action scope.

Hooks operate only on normalized resource values. They must not import application stores, query
clients, routers, or backend transports.
