import type { ElementType, ReactNode } from "react";

const maxWidths = {
  sm: "max-w-[640px]",
  md: "max-w-[840px]",
  lg: "max-w-[1280px]",
} as const;

export default function Section({
  id,
  as: Tag = "section",
  children,
  className = "",
  size = "md",
}: {
  id?: string;
  as?: ElementType;
  children: ReactNode;
  className?: string;
  size?: keyof typeof maxWidths;
}) {
  return (
    <Tag
      id={id}
      className={`mx-auto w-full px-6 sm:px-10 ${maxWidths[size]} ${className}`}
    >
      {children}
    </Tag>
  );
}
