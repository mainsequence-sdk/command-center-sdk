import { Braces } from "lucide-react";
import {
  CORE_VALUE_BOOLEAN_CONTRACT,
  CORE_VALUE_INTEGER_CONTRACT,
  CORE_VALUE_JSON_CONTRACT,
  CORE_VALUE_NUMBER_CONTRACT,
  CORE_VALUE_STRING_CONTRACT,
  APP_COMPONENT_AUTHORING_SCHEMA_ID,
  CORE_APP_COMPONENT_WIDGET_ID,
} from "../../../contracts/index.js";
import {
  defineWidgetModule,
  resolveWidgetDescription,
  resolveWidgetUsageGuidance,
} from "../../index.js";
import { AppComponentWidget, AppComponentWidgetSettings } from "./AppComponentWidget.js";
import { appComponentExecutionDefinition } from "./execution.js";
import {
  buildDefaultAppComponentMockJsonDefinition,
  normalizeAppComponentRuntimeState,
  resolveAppComponentWidgetIo,
  type AppComponentWidgetProps,
} from "./model.js";
import { appComponentWidgetUsageGuidance } from "./usage-guidance.js";

export { CORE_APP_COMPONENT_WIDGET_ID } from "../../../contracts/index.js";
const mockJson = buildDefaultAppComponentMockJsonDefinition();

export const appComponentWidgetModule = defineWidgetModule<AppComponentWidgetProps>({
  manifest: {
    id: CORE_APP_COMPONENT_WIDGET_ID,
    widgetVersion: "1.2.0",
    title: "AppComponent",
    description: resolveWidgetDescription(appComponentWidgetUsageGuidance),
    category: "Core",
    kind: "custom",
    source: "core",
    defaultSize: { w: 8, h: 8 },
    responsive: { minWidthPx: 420 },
    requiredPermissions: ["workspaces:view"],
    tags: ["openapi", "api", "forms", "requests", "mock-json"],
    propsSchema: { $ref: `${APP_COMPONENT_AUTHORING_SCHEMA_ID}#/$defs/props` },
    propsVersion: 1,
    userStateVersion: 1,
    workspaceRuntimeMode: "execution-owner",
    registryContract: {
      configuration: {
        mode: "custom-settings",
        summary: "Builds one portable request widget from a compiled operation contract or inline Mock JSON definition.",
        fields: [
          { id: "apiTargetMode", label: "Target mode", type: "enum", required: true, source: "custom-settings" },
          { id: "apiBaseUrl", label: "API base URL", type: "url", source: "custom-settings" },
          { id: "mockJson", label: "Mock JSON definition", type: "object", source: "custom-settings" },
          { id: "bindingSpec", label: "Compiled binding spec", type: "compiled-binding", source: "custom-settings" },
          { id: "requestInputMap", label: "Request input map", type: "object", source: "custom-settings" },
        ],
        dynamicConfigSummary: "Request fields and response ports come from the saved binding specification.",
        requiredSetupSteps: [
          "Choose a portable target mode or install a trusted host runtime adapter.",
          "Configure one operation and save its binding specification.",
        ],
        configurationNotes: [
          "Mock JSON is part of AppComponent rather than an independent widget.",
          "Trusted hosts can add authenticated transports without changing persisted identity.",
        ],
      },
      runtime: {
        refreshPolicy: "allow-refresh",
        executionTriggers: ["manual-submit", "dashboard-refresh", "settings-test"],
        executionSummary: "Executes Mock JSON locally or a manual no-auth request and publishes response-derived outputs.",
      },
      io: {
        mode: "dynamic",
        summary: "Generates request inputs and response outputs from the instance binding specification.",
        inputContracts: [
          CORE_VALUE_STRING_CONTRACT,
          CORE_VALUE_NUMBER_CONTRACT,
          CORE_VALUE_INTEGER_CONTRACT,
          CORE_VALUE_BOOLEAN_CONTRACT,
          CORE_VALUE_JSON_CONTRACT,
        ],
        outputContracts: [
          CORE_VALUE_STRING_CONTRACT,
          CORE_VALUE_NUMBER_CONTRACT,
          CORE_VALUE_INTEGER_CONTRACT,
          CORE_VALUE_BOOLEAN_CONTRACT,
          CORE_VALUE_JSON_CONTRACT,
        ],
      },
      capabilities: {
        builtInTargetModes: ["manual", "mock-json"],
        builtInAuthModes: ["none"],
        hostTargetProviders: true,
        requestInputLocations: ["path", "query", "header", "body"],
        responsePublication: ["status", "headers", "body", "publishedOutputs"],
      },
      usageGuidance: resolveWidgetUsageGuidance(appComponentWidgetUsageGuidance),
      examples: [{
        label: "Inline mock request",
        summary: "Prototypes a request and published response without a backend.",
        props: { apiTargetMode: "mock-json", mockJson },
      }],
    },
  },
  runtime: {
    definition: {
      exampleProps: {
        apiTargetMode: "manual",
        apiBaseUrl: "https://api.example.com",
        authMode: "none",
        method: "get",
        path: "/status",
        showHeader: true,
        showResponse: true,
      },
      mockProps: {
        apiTargetMode: "mock-json",
        method: mockJson.operation.method,
        path: mockJson.operation.path,
        mockJson,
        showHeader: true,
        showResponse: true,
        requestButtonLabel: "Submit",
      },
      settingsComponent: AppComponentWidgetSettings,
      showRawPropsEditor: false,
      workspaceIcon: Braces,
      resolveIo: ({ props }) => resolveAppComponentWidgetIo(props),
      execution: appComponentExecutionDefinition,
      buildAgentSnapshot: ({ props, runtimeState }) => {
        const state = normalizeAppComponentRuntimeState(runtimeState);
        return {
          displayKind: "form",
          state: state.status === "error" ? "error" : state.lastResponseStatus ? "ready" : "idle",
          summary: state.error ?? (state.lastResponseStatus
            ? `AppComponent last responded with ${state.lastResponseStatus}.`
            : "AppComponent is configured and waiting for execution."),
          data: {
            widgetRole: "interactive",
            targetMode: props.apiTargetMode ?? "manual",
            operationKey: state.operationKey,
            responseStatus: state.lastResponseStatus,
            responseBody: state.lastResponseBody,
          },
        };
      },
      component: AppComponentWidget,
    },
  },
});

export const appComponentWidget = appComponentWidgetModule.runtime.definition;
