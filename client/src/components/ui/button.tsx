import * as React from "react";

import { cn } from "~/lib/utils";

type ButtonVariant = "default" | "outline";
type ButtonSize = "default" | "sm" | "lg";

const buttonVariants: Record<ButtonVariant, string> = {
  default: "bg-gray-900 text-gray-50 hover:bg-gray-900/90",
  outline: "border border-gray-200 bg-white hover:bg-gray-100 text-gray-900",
};

const buttonSizes: Record<ButtonSize, string> = {
  default: "h-9 px-4 py-2",
  sm: "h-8 rounded-md px-3",
  lg: "h-10 rounded-md px-8",
};

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: React.ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      data-slot="button"
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 disabled:pointer-events-none disabled:opacity-50",
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...props}
    />
  );
}

export { Button };
