/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sdkSidebars = {
  sdkSidebar: [
    "README",
    {
      type: "category",
      label: "Start here",
      collapsed: false,
      items: ["getting-started", "public-api"],
    },
    {
      type: "category",
      label: "Core concepts",
      collapsed: false,
      items: [
        "concepts/sdk-architecture",
        "concepts/resource-applications",
        "concepts/state-and-ownership",
        "concepts/mobile",
      ],
    },
    {
      type: "category",
      label: "Build interfaces",
      items: [
        "navigation",
        "application-layout",
        "application-feedback",
        "application-controls",
        "resources",
      ],
    },
    {
      type: "category",
      label: "Theme and integrate",
      items: [
        "themes",
        "static-site-embeds",
        "backend-contracts",
        "application-documentation",
      ],
    },
    {
      type: "category",
      label: "Operate and maintain",
      items: [
        "application-operations",
        "extending-and-releasing",
        {
          type: "category",
          label: "Architecture decisions",
          link: { type: "doc", id: "adr/README" },
          items: [
            "adr/adr-sdk-001-static-site-delegated-fastapi-credential-bridge",
            "adr/adr-sdk-002-controlled-application-navigation",
            "adr/adr-sdk-003-public-application-layout-system",
            "adr/adr-sdk-004-public-application-feedback-system",
            "adr/adr-sdk-005-static-site-fastapi-websocket-ticket-bridge",
            "adr/adr-sdk-006-device-aware-primitives",
            "adr/adr-sdk-007-responsive-column-importance-and-stacked-tables",
            "adr/adr-sdk-008-immersive-embedded-presentation",
            "adr/adr-sdk-009-opinionated-embedded-application-shell",
            "adr/adr-sdk-010-host-navigation-drawer-and-wide-screen-embedded-frame",
            "adr/adr-sdk-011-public-control-and-form-primitives",
          ],
        },
      ],
    },
  ],
};

module.exports = sdkSidebars;
