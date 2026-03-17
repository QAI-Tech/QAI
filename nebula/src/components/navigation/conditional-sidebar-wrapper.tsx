"use client";

export default function ConditionalSidebarWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  // const isHomeV2 = pathname.includes("/homev2");

  return <>{children}</>;
}
