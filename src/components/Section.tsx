import type { ElementType, ReactNode } from "react";

export default function Section({
  id,
  as: Tag = "section",
  children,
  className = "",
  narrow = false,
}: {
  id?: string;
  as?: ElementType;
  children: ReactNode;
  className?: string;
  narrow?: boolean;
}) {
  return (
    <Tag
      id={id}
      className={`mx-auto w-full px-6 sm:px-10 ${narrow ? "max-w-[640px]" : "max-w-[840px]"} ${className}`}
    >
      {children}
    </Tag>
  );
}
