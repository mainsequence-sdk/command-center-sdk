import { renderToStaticMarkup } from "react-dom/server";

import {
  APP_COMPONENT_AUTHORING_CONTRACT,
  COMMAND_CENTER_WIDGET_API_VERSION,
  TABLE_WIDGET_AUTHORING_CONTRACT,
  TABULAR_TRANSFORM_AUTHORING_CONTRACT,
  type AppComponentAuthoringContractV1,
  type TabularTransformAuthoringContractV1,
} from "@dev-mainsequence/command-center-sdk/contracts";
import {
  IFRAME_BRIDGE_PROTOCOL_VERSION,
  STATIC_SITE_IFRAME_CONTRACT,
  type ResolveStaticSiteFastApiCredential,
  type StaticSiteFastApiTransportState,
} from "@dev-mainsequence/command-center-sdk/embed";
import {
  SandboxedIframeWidget,
  StaticSiteIframe,
} from "@dev-mainsequence/command-center-sdk/embed/react";
import {
  ActivityIndicator,
  ApplicationStatusScreen,
  ProgressStageList,
  type ProgressStageDefinition,
} from "@dev-mainsequence/command-center-sdk/feedback";
import {
  ApplicationNavigationShell,
  defineNavigationApplication,
} from "@dev-mainsequence/command-center-sdk/navigation";
import {
  ApplicationCard,
  ApplicationCardGrid,
  ApplicationPage,
  ApplicationPageHeader,
  ApplicationPageStack,
} from "@dev-mainsequence/command-center-sdk/layout";
import {
  COMMAND_CENTER_LAYOUT_VIEWPORTS,
  verifyCommandCenterPageLayout,
} from "@dev-mainsequence/command-center-sdk/layout/testing";
import {
  createHttpResourceAdapter,
  defineResourceApplication,
} from "@dev-mainsequence/command-center-sdk/resource";
import { mainSequenceTheme } from "@dev-mainsequence/command-center-sdk/theme";
import { getThemeCategoricalPalette } from "@dev-mainsequence/command-center-sdk/theme/data-viz";
import { graphiteTheme } from "@dev-mainsequence/command-center-sdk/theme/presets";
import { ResourcePagination } from "@dev-mainsequence/command-center-sdk/views";
import { defineExtension } from "@dev-mainsequence/command-center-sdk/widget";
import { coreWidgetsExtension } from "@dev-mainsequence/command-center-sdk/widget/built-ins";
import {
  tableWidgetModule,
  type TableWidgetProps,
} from "@dev-mainsequence/command-center-sdk/widget/built-ins/table";
import { proTableWidgetModule } from "@dev-mainsequence/command-center-sdk/widget/built-ins/pro-table";
import { appComponentWidgetModule } from "@dev-mainsequence/command-center-sdk/widget/built-ins/app-component";
import { tabularTransformWidgetModule } from "@dev-mainsequence/command-center-sdk/widget/built-ins/tabular-transform";
import {
  createWidgetRegistry,
  MAIN_SEQUENCE_FOUNDRY_CODE_REPOSITORY_INFRA_GRAPH_WIDGET_ID,
} from "@dev-mainsequence/command-center-sdk/widget/host";
import { validateWidgetManifest } from "@dev-mainsequence/command-center-sdk/widget/testing";
import { widgetThemeTokens } from "@dev-mainsequence/command-center-sdk/widget/ui";
import {
  WORKSPACE_DOCUMENT_CONTRACT,
  WORKSPACE_DOCUMENT_SCHEMA_ID,
  WORKSPACE_SCHEMA_VERSION,
} from "@dev-mainsequence/command-center-sdk/workspace";
import { WorkspaceRenderer } from "@dev-mainsequence/command-center-sdk/workspace/react";

import "@dev-mainsequence/command-center-sdk/styles.css";
import "@dev-mainsequence/command-center-sdk/theme/styles.css";
import "@dev-mainsequence/command-center-sdk/widget/built-ins.css";

type Service = {
  uid: string;
  name: string;
};

const client = {
  async request<Response>(): Promise<Response> {
    return { count: 0, results: [] } as Response;
  },
};

export const servicesResource = defineResourceApplication({
  id: "services",
  label: "Services",
  getId: (service: Service) => service.uid,
  adapter: createHttpResourceAdapter({
    client,
    endpoints: {
      list: "/services/",
      detail: (uid) => `/services/${encodeURIComponent(uid)}/`,
    },
    normalizeList: (response: { count: number; results: Service[] }) => ({
      items: response.results,
      pageInfo: {
        pageIndex: 0,
        pageSize: 25,
        totalItems: response.count,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    }),
  }),
  columns: [
    { id: "name", header: "Name", getValue: (service) => service.name },
    { id: "uid", header: "UID", getValue: (service) => service.uid },
  ],
  actions: [
    {
      id: "delete",
      label: "Delete",
      scope: "selection",
      tone: "danger",
      requiresConfirmation: true,
    },
  ],
  detail: {
    tabs: [
      { id: "overview", label: "Overview" },
      { id: "activity", label: "Activity" },
    ],
  },
});

export const packedNavigationApplication = defineNavigationApplication({
  id: "foundry",
  label: "Foundry",
  href: "/app/foundry/services",
  defaultDestinationId: "services",
  subApplications: [
    {
      id: "build",
      label: "Build",
      destinations: [
        { id: "services", label: "Services", href: "/app/foundry/services" },
        { id: "clusters", label: "Clusters", href: "/app/foundry/clusters" },
      ],
    },
    {
      id: "ship",
      label: "Ship",
      destinations: [
        { id: "releases", label: "Releases", href: "/app/foundry/releases" },
      ],
    },
  ],
});

export const packedNavigationHtml = renderToStaticMarkup(
  <ApplicationNavigationShell
    activeApplicationId="foundry"
    activeDestinationId="services"
    applications={[packedNavigationApplication]}
    collapsed={false}
    onNavigate={() => undefined}
    onOpenApplicationChange={() => undefined}
    openApplicationId="foundry"
  >
    <main>Consumer surface</main>
  </ApplicationNavigationShell>,
);

export const packedLayoutHtml = renderToStaticMarkup(
  <ApplicationPage maxWidth="content">
    <ApplicationPageHeader
      actions={<button type="button">Create service</button>}
      description="Manage services through the public SDK layout."
      title="Services"
    />
    <ApplicationPageStack>
      <ApplicationCardGrid>
        <ApplicationCard header={<h2>Active</h2>}>12 services</ApplicationCard>
        <ApplicationCard header={<h2>Queued</h2>}>3 services</ApplicationCard>
      </ApplicationCardGrid>
    </ApplicationPageStack>
  </ApplicationPage>,
);

export const packedFeedbackStages = [
  {
    id: "runtime",
    label: "Application runtime",
    description: "Attaching registered capabilities.",
    status: "active",
    elapsedSeconds: 4.2,
    details: [{ id: "resources", label: "Resource registry" }],
  },
] satisfies ProgressStageDefinition[];

export const packedFeedbackHtml = renderToStaticMarkup(
  <ApplicationStatusScreen
    eyebrow="Runtime startup"
    message="Preparing the application runtime."
    stages={packedFeedbackStages}
    title="Preparing application"
  />,
);

export const packedConsumerHtml = renderToStaticMarkup(
  <ResourcePagination
    count={42}
    itemLabel="services"
    pageIndex={0}
    pageSize={20}
    onPageChange={() => undefined}
  />,
);

export const packedStaticSiteCredentialResolver: ResolveStaticSiteFastApiCredential = async (
  { resourceReleaseUid },
) => ({
  resourceReleaseUid,
  rpcUrl: "https://api.example.test/",
  token: "fixture-delegated-token",
  expiresAt: "2099-01-01T00:00:00.000Z",
});

export const packedStaticSiteTransportState: StaticSiteFastApiTransportState = {
  status: "runtime-starting",
  resourceReleaseUid: "11111111-1111-4111-8111-111111111111",
  attempt: 2,
  responseStatus: 503,
  retryDelayMs: 500,
};

export const packedStaticSiteHostHtml = renderToStaticMarkup(
  <StaticSiteIframe
    src="https://site.example.test/launch"
    themeId="graphite"
    themeMode="dark"
    userUid="11111111-1111-4111-8111-111111111111"
    resolveFastApiCredential={packedStaticSiteCredentialResolver}
  />,
);

export const packedSdkSurfaceSmoke = {
  ApplicationCard,
  ApplicationCardGrid,
  ActivityIndicator,
  ApplicationStatusScreen,
  ApplicationNavigationShell,
  ApplicationPage,
  ApplicationPageHeader,
  ApplicationPageStack,
  ProgressStageList,
  APP_COMPONENT_AUTHORING_CONTRACT,
  COMMAND_CENTER_WIDGET_API_VERSION,
  IFRAME_BRIDGE_PROTOCOL_VERSION,
  MAIN_SEQUENCE_FOUNDRY_CODE_REPOSITORY_INFRA_GRAPH_WIDGET_ID,
  STATIC_SITE_IFRAME_CONTRACT,
  SandboxedIframeWidget,
  TABULAR_TRANSFORM_AUTHORING_CONTRACT,
  WORKSPACE_DOCUMENT_CONTRACT,
  WORKSPACE_DOCUMENT_SCHEMA_ID,
  WORKSPACE_SCHEMA_VERSION,
  COMMAND_CENTER_LAYOUT_VIEWPORTS,
  WorkspaceRenderer,
  coreWidgetsExtension,
  appComponentWidgetModule,
  proTableWidgetModule,
  tabularTransformWidgetModule,
  tableWidgetModule,
  TABLE_WIDGET_AUTHORING_CONTRACT,
  createWidgetRegistry,
  defineExtension,
  defineNavigationApplication,
  getThemeCategoricalPalette,
  graphiteTheme,
  mainSequenceTheme,
  validateWidgetManifest,
  verifyCommandCenterPageLayout,
  widgetThemeTokens,
} satisfies Record<string, unknown>;

export const packedTableProps = {
  tableSourceMode: "manual",
  manualColumns: [{ key: "symbol", type: "string" }],
  manualRows: [{ symbol: "ALPHA" }],
} satisfies TableWidgetProps;

export const packedAppComponentAuthoring = {
  contract: APP_COMPONENT_AUTHORING_CONTRACT,
  widgetId: "core__app-component",
  props: {
    apiTargetMode: "mock-json",
    mockJson: {
      version: 1,
      operation: { method: "post", path: "/preview" },
      response: { status: 200, body: { accepted: true } },
    },
  },
} satisfies AppComponentAuthoringContractV1;

export const packedTabularTransformAuthoring = {
  contract: TABULAR_TRANSFORM_AUTHORING_CONTRACT,
  widgetId: "core__tabular-transform",
  props: {
    transformMode: "filter",
    filterRules: [{ field: "status", operator: "equals", value: "active" }],
  },
} satisfies TabularTransformAuthoringContractV1;
