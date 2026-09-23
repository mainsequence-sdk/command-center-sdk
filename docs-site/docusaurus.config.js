// @ts-check

const githubRepositoryOwner = process.env.GITHUB_REPOSITORY_OWNER || "mainsequence-sdk";
const githubRepositoryName =
  process.env.GITHUB_REPOSITORY?.split("/")[1] || "command-center-sdk";
const isGitHubPagesBuild = process.env.GITHUB_ACTIONS === "true";
const docsSiteUrl = process.env.DOCS_SITE_URL || `https://${githubRepositoryOwner}.github.io`;
const docsBaseUrl =
  process.env.DOCS_BASE_URL || (isGitHubPagesBuild ? `/${githubRepositoryName}/` : "/docs/");

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: "Command Center SDK",
  tagline: "Build Command Center-compatible applications from published contracts.",
  favicon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%230b1017'/%3E%3Cpath d='M8 23V9h3.2l4.8 7.8L20.8 9H24v14h-3V14.7l-4.1 6.7h-1.8L11 14.7V23H8Z' fill='%23f1e7c9'/%3E%3C/svg%3E",
  url: docsSiteUrl,
  baseUrl: docsBaseUrl,
  organizationName: githubRepositoryOwner,
  projectName: githubRepositoryName,
  onBrokenLinks: "throw",
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: "throw",
    },
  },
  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },
  presets: [
    [
      "classic",
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          path: "../command-center-sdk/docs",
          routeBasePath: "/",
          sidebarPath: require.resolve("./sdk-sidebars.js"),
          // The docs source sits outside docs-site. Build the repository path explicitly instead
          // of letting Docusaurus append its `../command-center-sdk/docs` source path.
          editUrl: ({ docPath }) =>
            `https://github.com/mainsequence-sdk/command-center-sdk/tree/main/command-center-sdk/docs/${docPath}`,
        },
        blog: false,
        pages: false,
        theme: {
          customCss: require.resolve("./src/css/custom.css"),
        },
      }),
    ],
  ],
  plugins: [
    [
      "@docusaurus/plugin-content-docs",
      /** @type {import('@docusaurus/plugin-content-docs').Options} */
      ({
        // The chat package's documentation, as its own section. Its guides link to the module
        // READMEs beside the code, so the section reads from the package root and publishes
        // those files too; every relative link then resolves here as it does on GitHub.
        id: "chat",
        path: "../chat",
        routeBasePath: "chat",
        include: [
          "README.md",
          "docs/**/*.md",
          "src/*/README.md",
          "standalone/README.md",
          "standalone/stand-in/README.md",
        ],
        sidebarPath: require.resolve("./chat-sidebars.js"),
        editUrl: ({ docPath }) =>
          `https://github.com/mainsequence-sdk/command-center-sdk/tree/main/chat/${docPath}`,
      }),
    ],
  ],
  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      image: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 630'%3E%3Crect width='1200' height='630' fill='%230b1017'/%3E%3Cpath d='M190 455V175h70l105 156 105-156h70v280h-65V289l-90 133h-40l-90-133v166h-65Z' fill='%23f1e7c9'/%3E%3C/svg%3E",
      navbar: {
        title: "Command Center SDK",
        items: [
          {
            type: "docSidebar",
            sidebarId: "sdkSidebar",
            position: "left",
            label: "Documentation",
          },
          {
            type: "docSidebar",
            sidebarId: "chatSidebar",
            docsPluginId: "chat",
            position: "left",
            label: "Chat",
          },
          {
            href: "https://www.npmjs.com/package/@dev-mainsequence/command-center-sdk",
            label: "npm",
            position: "right",
          },
          {
            href: "https://github.com/mainsequence-sdk/command-center-sdk",
            label: "GitHub",
            position: "right",
          },
        ],
      },
      footer: {
        style: "dark",
        links: [
          {
            title: "SDK",
            items: [
              { label: "Getting started", to: "/getting-started" },
              { label: "Core concepts", to: "/concepts/sdk-architecture" },
              { label: "Resources", to: "/resources" },
              { label: "Public API", to: "/public-api" },
            ],
          },
          {
            title: "Integrate and operate",
            items: [
              { label: "Themes", to: "/themes" },
              { label: "Static-site embeds", to: "/static-site-embeds" },
              { label: "Backend contracts", to: "/backend-contracts" },
              { label: "Application operations", to: "/application-operations" },
            ],
          },
          {
            title: "Package",
            items: [
              {
                label: "Source",
                href: "https://github.com/mainsequence-sdk/command-center-sdk",
              },
              {
                label: "npm",
                href: "https://www.npmjs.com/package/@dev-mainsequence/command-center-sdk",
              },
            ],
          },
        ],
        copyright: `Copyright ${new Date().getFullYear()} Main Sequence`,
      },
      colorMode: {
        defaultMode: "dark",
        disableSwitch: true,
        respectPrefersColorScheme: false,
      },
    }),
};

module.exports = config;
