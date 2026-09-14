import type { ReactNode } from "react";
import { useState } from "react";

import "@dev-mainsequence/command-center-sdk/theme/styles.css";
import "@dev-mainsequence/command-center-sdk/styles.css";

import {
  ApplicationStatusScreen,
  type ProgressStageDefinition,
} from "@dev-mainsequence/command-center-sdk/feedback";
import { ApplicationPage } from "@dev-mainsequence/command-center-sdk/layout";
import {
  ApplicationNavigationPanelShell,
  ApplicationNavigationShell,
  type NavigationApplicationDefinition,
  type NavigationIntent,
} from "@dev-mainsequence/command-center-sdk/navigation";

type StartupStageId = "host" | "transport" | "api";

type StartupState =
  | { phase: StartupStageId; message: string }
  | { failedStage: StartupStageId; phase: "error"; message: string; retry: () => void }
  | { phase: "ready" };

type NavigationMode =
  | { depth: 0 }
  | { depth: 1; application: NavigationApplicationDefinition }
  | {
      depth: 2;
      activeApplicationId: string;
      applications: readonly NavigationApplicationDefinition[];
      openApplicationId: string | null;
      setOpenApplicationId: (id: string | null) => void;
    };

const startupStages = (startup: StartupState): ProgressStageDefinition[] => {
  const phases = ["host", "transport", "api"] as const;
  const currentPhase = startup.phase === "error" ? startup.failedStage : startup.phase;
  const activeIndex = currentPhase === "ready"
    ? phases.length
    : phases.indexOf(currentPhase);
  const labels = {
    host: "Initialize host context and theme",
    transport: "Connect delegated API transport",
    api: "Confirm application readiness",
  };

  return phases.map((id, index) => ({
    id,
    label: labels[id],
    status: index < activeIndex
      ? "complete"
      : index === activeIndex ? startup.phase === "error" ? "error" : "active" : "pending",
  }));
};

export function EmbeddedApplicationShell({
  activeDestinationId,
  children,
  navigate,
  navigation,
  startup,
}: {
  activeDestinationId: string;
  children: ReactNode;
  navigate: (intent: NavigationIntent) => void;
  navigation: NavigationMode;
  startup: StartupState;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  if (startup.phase !== "ready") {
    return (
      <ApplicationStatusScreen
        action={startup.phase === "error"
          ? { label: "Retry startup", onSelect: startup.retry }
          : undefined}
        message={startup.message}
        stages={startupStages(startup)}
        state={startup.phase === "error" ? "error" : "loading"}
        title={startup.phase === "error" ? "Application could not start" : "Preparing application"}
        variant="viewport"
      />
    );
  }

  const content = <ApplicationPage maxWidth="full">{children}</ApplicationPage>;
  if (navigation.depth === 0) return content;

  if (navigation.depth === 1) {
    return (
      <ApplicationNavigationPanelShell
        activeDestinationId={activeDestinationId}
        application={navigation.application}
        menuOpen={menuOpen}
        onMenuOpenChange={setMenuOpen}
        onNavigate={navigate}
        presentation="auto"
      >
        {content}
      </ApplicationNavigationPanelShell>
    );
  }

  return (
    <ApplicationNavigationShell
      activeApplicationId={navigation.activeApplicationId}
      activeDestinationId={activeDestinationId}
      applications={navigation.applications}
      collapsed={false}
      menuOpen={menuOpen}
      onMenuOpenChange={setMenuOpen}
      onNavigate={navigate}
      onOpenApplicationChange={navigation.setOpenApplicationId}
      openApplicationId={navigation.openApplicationId}
      overlayTrigger="floating"
      presentation="auto"
    >
      {content}
    </ApplicationNavigationShell>
  );
}
