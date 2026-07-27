import * as React from "react";
import { Eye, EyeOff, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FloatingLabelInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Renders an eye/eye-off toggle that swaps the input between `password` and `text`. */
  revealable?: boolean;
  /** Static icon shown at the end (right) of the field, e.g. Mail or Lock. */
  icon?: LucideIcon;
  /** Skips the anti-autofill lock so the browser's saved-credential dropdown can appear on click. */
  enableAutofill?: boolean;
}

/**
 * Outlined text field with a label that sits vertically centered at rest and
 * floats to the top of the box once it's focused or has a value — tracked via
 * React state (not CSS :placeholder-shown) so the "floated" condition is exact
 * and independently testable.
 */
export const FloatingLabelInput = React.forwardRef<HTMLInputElement, FloatingLabelInputProps>(
  ({ id, label, value, onChange, revealable, icon: Icon, enableAutofill, type = "text", className, onFocus, onBlur, ...props }, ref) => {
    const [focused, setFocused] = React.useState(false);
    const [revealed, setRevealed] = React.useState(false);
    // Chrome/Edge generally won't inject saved autofill into a field marked
    // readOnly at load — dropping it the instant the user actually interacts
    // keeps the field fully usable while denying autofill the opening it
    // needs. Fields with enableAutofill skip the lock entirely so the
    // browser's saved-credential dropdown can appear right away.
    const [locked, setLocked] = React.useState(!enableAutofill);
    const floated = focused || value.length > 0;
    const inputType = revealable ? (revealed ? "text" : "password") : type;
    const hasTrailingContent = Boolean(Icon) || revealable;

    const unlock = () => setLocked(false);

    return (
      // Outlined field: the border lives on the wrapper so the focus ring can
      // wrap the whole control (including the trailing icons), while the label
      // is positioned against that same box. Every colour here is a design
      // token, so the control inherits light/dark automatically instead of
      // assuming it sits on a dark hero background as it used to.
      <div
        className={cn(
          "relative rounded-lg border bg-background transition-all duration-200",
          focused ? "border-primary ring-2 ring-primary/20" : "border-input hover:border-primary/40"
        )}
      >
        <input
          ref={ref}
          id={id}
          type={inputType}
          value={value}
          onChange={onChange}
          readOnly={locked}
          onMouseDown={unlock}
          onFocus={(e) => {
            unlock();
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          className={cn(
            "peer w-full bg-transparent border-0 text-foreground text-sm rounded-lg",
            "px-3 pt-5 pb-1.5 focus:outline-none",
            Icon && revealable ? "pr-16" : hasTrailingContent && "pr-10",
            className
          )}
          {...props}
        />
        <label
          htmlFor={id}
          className={cn(
            "absolute left-3 pointer-events-none transition-all duration-200 ease-out",
            floated
              ? "top-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
              : "top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
          )}
        >
          {label}
        </label>
        {hasTrailingContent && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2.5">
            {revealable && (
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setRevealed((r) => !r)}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label={revealed ? "Hide password" : "Show password"}
              >
                {revealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            )}
            {Icon && <Icon className="w-4 h-4 text-muted-foreground pointer-events-none" />}
          </div>
        )}
      </div>
    );
  }
);
FloatingLabelInput.displayName = "FloatingLabelInput";
