import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "ghost" | "outline";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-display font-medium transition-all duration-200 disabled:opacity-40 disabled:pointer-events-none active:scale-[0.98]";

const sizes = {
  md: "h-12 px-6 text-[15px]",
  lg: "h-14 px-8 text-base",
  sm: "h-10 px-4 text-sm",
};

const variants: Record<Variant, string> = {
  primary:
    "bg-amber text-canvas-deep hover:bg-amber-deep hover:shadow-[0_8px_30px_rgba(255,180,84,0.35)]",
  outline:
    "border border-line text-cream hover:border-amber hover:text-amber bg-transparent",
  ghost: "text-cream-dim hover:text-cream hover:bg-surface",
};

function classesFor(variant: Variant, size: keyof typeof sizes, className?: string) {
  return `${base} ${sizes[size]} ${variants[variant]} ${className ?? ""}`;
}

interface CommonProps {
  variant?: Variant;
  size?: keyof typeof sizes;
  children: ReactNode;
  className?: string;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: CommonProps & ComponentProps<"button">) {
  return (
    <button className={classesFor(variant, size, className)} {...rest}>
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: CommonProps & ComponentProps<typeof Link>) {
  return (
    <Link className={classesFor(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}
