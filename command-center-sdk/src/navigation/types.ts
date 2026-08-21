import type { ComponentType } from "react";

export type NavigationIcon = ComponentType<{ className?: string }>;

export interface NavigationDestinationDefinition {
  id: string;
  label: string;
  description?: string;
  icon?: NavigationIcon;
  order?: number;
  disabled?: boolean;
  unavailableReason?: string;
}

export interface NavigationSubApplicationDefinition {
  id: string;
  label: string;
  description?: string;
  icon?: NavigationIcon;
  order?: number;
  destinations: readonly NavigationDestinationDefinition[];
}

export interface NavigationApplicationDefinition {
  id: string;
  label: string;
  description?: string;
  icon?: NavigationIcon;
  order?: number;
  disabled?: boolean;
  unavailableReason?: string;
  defaultDestinationId?: string;
  subApplications: readonly NavigationSubApplicationDefinition[];
}

export interface NavigationContributionDefinition {
  id: string;
  targetApplicationId: string;
  subApplication: NavigationSubApplicationDefinition;
}

export interface NavigationIntent {
  applicationId: string;
  subApplicationId: string;
  destinationId: string;
}
