import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { buttonVariants, type ButtonProps } from "./button-variants"; // Removed ButtonVariantProps

import { cn } from "../../lib/utils";

// ButtonProps interface definition removed

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
