import { cva } from "class-variance-authority";
import { forwardRef } from "react";

const buttonVariants = cva("inline-flex items-center", {
  variants: {
    intent: {
      primary: "bg-primary-background text-primary-foreground",
      secondary: "bg-surface-background text-primary-foreground",
    },
    size: {
      small: "h-8 px-3",
      large: "h-12 px-6",
    },
  },
  defaultVariants: { intent: "primary", size: "small" },
});

export interface ButtonProps {
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>((props, ref) => <button ref={ref} className={buttonVariants()} />);
