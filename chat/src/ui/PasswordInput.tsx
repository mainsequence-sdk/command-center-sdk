import * as React from "react";

import { Eye, EyeOff } from "lucide-react";

import { Button, Input } from "@dev-mainsequence/command-center-sdk/controls";

import { cx } from "./class-names.js";

/** The SDK's input for a secret, with a button that shows or hides what was typed. */
export interface PasswordInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {}

export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, ...props }, ref) => {
    const [passwordVisible, setPasswordVisible] = React.useState(false);
    const toggleLabel = passwordVisible ? "Hide password" : "View password";

    return (
      <div className="ms-chat-password">
        <Input
          ref={ref}
          type={passwordVisible ? "text" : "password"}
          className={cx("ms-chat-password__input", className)}
          {...props}
        />

        <Button
          aria-label={toggleLabel}
          className="ms-chat-password__toggle"
          iconOnly
          onClick={() => setPasswordVisible((current) => !current)}
          size="small"
          title={toggleLabel}
          variant="ghost"
        >
          {passwordVisible ? <EyeOff className="ms-chat-icon-md" /> : <Eye className="ms-chat-icon-md" />}
        </Button>
      </div>
    );
  },
);

PasswordInput.displayName = "PasswordInput";
