import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";

const buttonVariants = cva(
  "inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition duration-150 ease-out disabled:pointer-events-none disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/35 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:stroke-[1.5]",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-fg hover:bg-accent-hi",
        secondary: "border border-hairline bg-transparent text-fg-strong hover:bg-surface-2 hover:border-hairline-hi",
        outline: "border border-hairline bg-transparent text-fg hover:bg-surface-2 hover:border-hairline-hi",
        ghost: "bg-transparent text-fg hover:bg-surface-2 hover:text-fg-strong",
        destructive: "bg-danger text-white hover:opacity-90",
      },
      size: {
        sm: "h-8 px-2.5 text-xs",
        md: "h-9 px-3",
        lg: "h-10 px-4",
        icon: "h-9 w-9 px-0",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />;
  },
);
Button.displayName = "Button";

export { buttonVariants };
