import {
  defineExtension,
  defineWidgetModule,
  type WidgetComponentProps,
} from "@dev-mainsequence/command-center-sdk/widget";

interface HelloProps extends Record<string, unknown> {
  message?: string;
}

function HelloWidget({ props }: WidgetComponentProps<HelloProps>) {
  return <section>{props.message ?? "Hello from an external widget package."}</section>;
}

export const helloWidgetModule = defineWidgetModule<HelloProps>({
  manifest: {
    id: "example__hello",
    widgetVersion: "1.0.0",
    propsVersion: 1,
    userStateVersion: 1,
    title: "Hello",
    description: "Shows a configurable greeting.",
    category: "Example",
    kind: "custom",
    source: "example",
    workspaceRuntimeMode: "local-ui",
    registryContract: {
      usageGuidance: {
        buildPurpose: "Show a greeting in a workspace.",
        whenToUse: ["Use to validate a new widget package and deployment composition."],
        whenNotToUse: ["Do not use for data execution."],
        authoringSteps: ["Add the widget and set its message."],
      },
    },
  },
  runtime: {
    definition: {
      component: HelloWidget,
      exampleProps: { message: "Hello, Command Center." },
      mockProps: { message: "Preview greeting" },
    },
  },
});

export default defineExtension({
  id: "example-hello-widgets",
  title: "Example Hello Widgets",
  packageName: "@example/command-center-hello-widget",
  packageVersion: "0.1.0",
  widgets: [helloWidgetModule],
});
