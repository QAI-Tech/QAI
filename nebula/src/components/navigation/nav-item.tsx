"use client";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { usePathname } from "next/navigation";
export default function NavItem({
  href,
  icon: Icon,
  text,
  className = "",
}: {
  href: string;
  icon: LucideIcon;
  text: string;
  className?: string;
}) {
  const pathname = usePathname();
  const baseHref = href.split("?")[0];

  const isDashboard = baseHref.split("/").filter(Boolean).length === 1;
  const isActive = isDashboard
    ? pathname === baseHref || pathname === `${baseHref}/`
    : pathname === baseHref || pathname.startsWith(`${baseHref}/`);

  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-gray-50 ${
        isActive ? "bg-purple-50 text-purple-700 font-medium" : "text-gray-700"
      } ${className}`}
    >
      <Icon className="h-5 w-5" />
      {text}
    </Link>
  );
}
