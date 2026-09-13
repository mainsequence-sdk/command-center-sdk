import { readFileSync } from "node:fs";

const applicationPackage = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const title = process.env.DOCS_SITE_TITLE || applicationPackage.displayName || applicationPackage.name;
const url = exactSiteOrigin(process.env.DOCS_SITE_URL || "http://localhost");

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: `${title} User Guide`,
  tagline: `Learn how to use ${title}`,
  url,
  baseUrl: "/docs/",
  trailingSlash: true,
  onBrokenLinks: "throw",
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: "throw",
    },
  },
  presets: [
    [
      "classic",
      {
        blog: false,
        pages: false,
        docs: {
          exclude: ["SUMMARY.md"],
          path: "../docs",
          routeBasePath: "/",
          sidebarPath: "./sidebars.mjs",
        },
        theme: {},
      },
    ],
  ],
  themeConfig: {
    colorMode: {
      defaultMode: "dark",
      respectPrefersColorScheme: true,
    },
    navbar: {
      title,
      items: [
        {
          type: "docSidebar",
          sidebarId: "userGuideSidebar",
          position: "left",
          label: "User guide",
        },
        {
          type: "html",
          position: "right",
          value: '<a class="navbar__link menu__link" href="/">Back to application</a>',
        },
      ],
    },
  },
};

function exactSiteOrigin(raw) {
  const parsed = new URL(raw);
  if (!new Set(["http:", "https:"]).has(parsed.protocol)) {
    throw new Error("DOCS_SITE_URL must use HTTP or HTTPS.");
  }
  if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("DOCS_SITE_URL must be an exact origin without credentials, path, query, or fragment.");
  }
  return parsed.origin;
}

export default config;
