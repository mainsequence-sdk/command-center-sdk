import type { HTMLAttributes, ReactNode } from "react";

export interface WidgetFieldHelpProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  label?: string;
}

export function WidgetFieldHelp({ children, label = "More information", ...props }: WidgetFieldHelpProps) {
  return (
    <span
      role="img"
      aria-label={label}
      title={typeof children === "string" ? children : undefined}
      {...props}
    >
      ⓘ
      <span className="sr-only">{children}</span>
    </span>
  );
}

export const widgetThemeTokens = {
  background: "var(--background)",
  foreground: "var(--foreground)",
  border: "var(--border)",
  mutedForeground: "var(--muted-foreground)",
  primary: "var(--primary)",
} as const;
