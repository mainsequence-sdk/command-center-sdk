import { renderToStaticMarkup } from "react-dom/server";

import {
  STATIC_SITE_FAST_API_WEBSOCKET_ACK_PROTOCOL,
  STATIC_SITE_IFRAME_CONTRACT,
  StaticSiteFastApiWebSocketError,
  type ResolveStaticSiteFastApiCredential,
  type ResolveStaticSiteFastApiWebSocketTicket,
  type StaticSiteFastApiTransportState,
} from "@dev-mainsequence/command-center-sdk/embed";
import { StaticSiteIframe } from "@dev-mainsequence/command-center-sdk/embed/react";
import {
  Badge,
  Button,
  Field,
  Input,
} from "@dev-mainsequence/command-center-sdk/controls";
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
  resolveResourceDetailTabs,
} from "@dev-mainsequence/command-center-sdk/resource";
import { mainSequenceTheme } from "@dev-mainsequence/command-center-sdk/theme";
import { getThemeCategoricalPalette } from "@dev-mainsequence/command-center-sdk/theme/data-viz";
import { graphiteTheme } from "@dev-mainsequence/command-center-sdk/theme/presets";
import {
  ResourceDetailShell,
  ResourcePagination,
  ResourceTransferList,
  type ResourceDetailBreadcrumbLeadContext,
  type ResourceDetailTabLeadContext,
  type ResourceTransferChange,
} from "@dev-mainsequence/command-center-sdk/views";

import "@dev-mainsequence/command-center-sdk/styles.css";
import "@dev-mainsequence/command-center-sdk/theme/styles.css";

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
      { id: "activity", label: "Activity", isVisible: (service) => service.uid !== "" },
      { id: "settings", label: "Settings", disabled: true },
    ],
  },
});

const packedDetailTabs = resolveResourceDetailTabs(servicesResource.detail?.tabs, {
  activeTabId: "activity",
  resource: { name: "Pricing API", uid: "svc-1" },
});

export const packedDetailHtml = renderToStaticMarkup(
  <ResourceDetailShell<Service>
    activeTabId={packedDetailTabs.activeTab?.id}
    breadcrumbs={[{ id: "services", label: "Services" }, { id: "service", label: "Pricing API" }]}
    renderBreadcrumbLead={({ current }: ResourceDetailBreadcrumbLeadContext) =>
      current ? <span data-icon="service" /> : null}
    renderTabLead={({ level, tab }: ResourceDetailTabLeadContext<Service>) =>
      level === "primary" ? <span data-icon={tab.id} /> : null}
    tabs={packedDetailTabs.tabs}
    tabsLabel="Service sections"
    tabsOverflow="auto"
  >
    <p>{packedDetailTabs.activeTab?.label}</p>
  </ResourceDetailShell>,
);

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
      actions={<Button variant="primary">Create service</Button>}
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

export const packedControlsHtml = renderToStaticMarkup(
  <>
    <Field
      controlId="service-name"
      description="Shown in the catalog."
      error="Enter a name."
      label="Display name"
      required
    >
      <Input name="name" />
    </Field>
    <Badge variant="success">Deployed</Badge>
    <Button pending variant="primary">
      Saving
    </Button>
  </>,
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

export const packedTransferListHtml = renderToStaticMarkup(
  <ResourceTransferList
    description="Chosen users can view this service."
    itemLabel="users"
    onValueChange={(_value: readonly string[], _change: ResourceTransferChange) => undefined}
    options={[
      { label: "Ada Lovelace", subtitle: "ada@example.test", value: "ada" },
      { disabled: true, label: "Linus Torvalds", meta: "Always has access", value: "linus" },
    ]}
    presentation="auto"
    value={["linus"]}
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

export const packedStaticSiteWebSocketResolver: ResolveStaticSiteFastApiWebSocketTicket = async (
  { resourceReleaseUid, path },
) => ({
  resourceReleaseUid,
  origin: "https://site.example.test",
  path,
  websocketUrl: `wss://api.example.test${path}`,
  subprotocol: `mainsequence.ws-ticket.${"a".repeat(32)}`,
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
    resolveFastApiWebSocketTicket={packedStaticSiteWebSocketResolver}
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
  STATIC_SITE_FAST_API_WEBSOCKET_ACK_PROTOCOL,
  STATIC_SITE_IFRAME_CONTRACT,
  StaticSiteFastApiWebSocketError,
  COMMAND_CENTER_LAYOUT_VIEWPORTS,
  defineNavigationApplication,
  getThemeCategoricalPalette,
  graphiteTheme,
  mainSequenceTheme,
  verifyCommandCenterPageLayout,
} satisfies Record<string, unknown>;
