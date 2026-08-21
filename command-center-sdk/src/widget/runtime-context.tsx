import { createContext, useContext, type ReactNode } from "react";

import type { RuntimeDataStore } from "../contracts/index.js";

export interface WidgetRuntimeContextValue {
  capabilities: Readonly<Record<string, unknown>>;
  theme: Readonly<Record<string, string>>;
  locale: string;
  runtimeDataStore?: RuntimeDataStore | null;
}

const WidgetRuntimeContext = createContext<WidgetRuntimeContextValue | null>(null);

export function WidgetRuntimeProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: WidgetRuntimeContextValue;
}) {
  return (
    <WidgetRuntimeContext.Provider value={value}>
      {children}
    </WidgetRuntimeContext.Provider>
  );
}

export function useWidgetRuntime(): WidgetRuntimeContextValue {
  const value = useContext(WidgetRuntimeContext);
  if (!value) {
    throw new Error("Widget runtime hooks require a WidgetRuntimeProvider.");
  }
  return value;
}

export function useWidgetCapability<T>(capabilityId: string): T | undefined {
  return useWidgetRuntime().capabilities[capabilityId] as T | undefined;
}

export function useRequiredWidgetCapability<T>(capabilityId: string): T {
  const capability = useWidgetCapability<T>(capabilityId);
  if (capability === undefined) {
    throw new Error(`Required widget capability "${capabilityId}" is unavailable.`);
  }
  return capability;
}

export function useWidgetTheme(): Readonly<Record<string, string>> {
  return useWidgetRuntime().theme;
}
