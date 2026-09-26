import { cva } from "class-variance-authority";

const badgeVariants = cva("rounded", {
  variants: {
    intent: {
      neutral: "bg-neutral-surface text-neutral-foreground",
      positive: "bg-positive-surface text-positive-foreground",
    },
  },
  defaultVariants: { intent: "neutral" },
});

export function Badge() {
  return <span className={badgeVariants()} />;
}
