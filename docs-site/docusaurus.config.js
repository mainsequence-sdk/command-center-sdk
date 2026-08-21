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
          editUrl:
            "https://github.com/mainsequence-sdk/command-center-sdk/tree/main/command-center-sdk/docs/",
        },
        blog: false,
        pages: false,
        theme: {
          customCss: require.resolve("./src/css/custom.css"),
        },
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
              { label: "Resources", to: "/resources" },
              { label: "Widgets and workspaces", to: "/widgets-and-workspaces" },
              { label: "Backend contracts", to: "/backend-contracts" },
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
