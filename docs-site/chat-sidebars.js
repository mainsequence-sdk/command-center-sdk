/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const chatSidebars = {
  chatSidebar: [
    "README",
    "docs/README",
    {
      type: "category",
      label: "Guides",
      collapsed: false,
      items: [
        "docs/build-a-chat-application",
        "docs/connect-to-the-platform",
        "docs/model-providers",
        "docs/conversation-contract",
        "docs/agent-session-resolution",
        "docs/main-sequence-ai-provider-errors",
      ],
    },
    {
      type: "category",
      label: "Modules",
      items: [
        "src/backend/README",
        "src/engine/README",
        "src/session-detail/README",
        "src/ui/README",
        "src/model-providers/README",
        "standalone/README",
        "standalone/stand-in/README",
        "agent_scaffold/README",
        "cli/README",
      ],
    },
    {
      type: "category",
      label: "Architecture decisions",
      items: [
        "docs/adr/adr-060-session-backed-chat-request-contract",
        "docs/adr/adr-087-queued-chat-messages-while-the-agent-works",
        "docs/adr/adr-090-agent-icons-in-command-center-surfaces",
        "docs/adr/adr-093-client-verified-agent-readiness",
        "docs/adr/adr-096-independent-chat-package",
        "docs/adr/adr-098-one-communication-contract-for-every-agent",
      ],
    },
  ],
};

module.exports = chatSidebars;
