import { readFileSync } from "node:fs";
import { themes as prismThemes } from "prism-react-renderer";

const applicationPackage = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const title = process.env.DOCS_SITE_TITLE || applicationPackage.displayName || applicationPackage.name;
const url = exactSiteOrigin(process.env.DOCS_SITE_URL || "http://localhost");

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: `${title} Documentation`,
  tagline: "Application surfaces and technical reference",
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
          sidebarId: "documentationSidebar",
          position: "left",
          label: "Documentation",
        },
        {
          type: "html",
          position: "right",
          value: '<a class="navbar__link menu__link" href="/">Back to application</a>',
        },
      ],
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
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
