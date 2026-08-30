import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ApplicationCard,
  ApplicationCardGrid,
  ApplicationPage,
  ApplicationPageHeader,
  ApplicationPageStack,
} from "./index.js";

describe("application layout primitives", () => {
  it("renders one stable page root and controlled maximum-width mode", () => {
    const html = renderToStaticMarkup(
      <ApplicationPage as="section" className="consumer-page" maxWidth="content">
        Page content
      </ApplicationPage>,
    );

    expect(html).toContain("data-cc-application-page");
    expect(html).toContain('data-cc-application-page-max-width="content"');
    expect(html).toContain("cc-application-page--content");
    expect(html).toContain("consumer-page");
    expect(html.startsWith("<section")).toBe(true);
  });

  it("renders responsive header regions and a configurable title element", () => {
    const html = renderToStaticMarkup(
      <ApplicationPageHeader
        actions={<button type="button">Create</button>}
        description="A sufficiently descriptive page summary."
        eyebrow="Operations"
        title="Services"
        titleAs="h2"
      />,
    );

    expect(html).toContain("data-cc-application-page-header");
    expect(html).toContain("data-cc-application-page-header-actions");
    expect(html).toContain('<h2 class="cc-application-page-header__title">Services</h2>');
    expect(html).toContain("Operations");
    expect(html).toContain("Create");
  });

  it("makes card padding explicit and gives grids an instance-level minimum width", () => {
    const html = renderToStaticMarkup(
      <ApplicationPageStack>
        <ApplicationCardGrid minimumCardWidth="20rem">
          <ApplicationCard header={<h2>Summary</h2>}>Padded content</ApplicationCard>
          <ApplicationCard
            contentPadding="none"
            footer={<button type="button">Inspect</button>}
            surface="nested"
          >
            Full-bleed content
          </ApplicationCard>
        </ApplicationCardGrid>
      </ApplicationPageStack>,
    );

    expect(html).toContain("data-cc-application-page-stack");
    expect(html).toContain('data-cc-application-card-min-width="20rem"');
    expect(html).toContain("--application-card-min-width:20rem");
    expect(html).toContain('data-cc-content-padding="standard"');
    expect(html).toContain('data-cc-content-padding="none"');
    expect(html).toContain("cc-application-card--nested");
    expect(html).toContain("data-cc-application-card-header");
    expect(html).toContain("data-cc-application-card-footer");
  });

  it("keeps every primitive usable through createElement", () => {
    expect(createElement(ApplicationPage, null)).toBeTruthy();
    expect(createElement(ApplicationPageHeader, { title: "Title" })).toBeTruthy();
    expect(createElement(ApplicationPageStack, null)).toBeTruthy();
    expect(createElement(ApplicationCard, null)).toBeTruthy();
    expect(createElement(ApplicationCardGrid, null)).toBeTruthy();
  });
});
