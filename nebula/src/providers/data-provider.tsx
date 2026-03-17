"use client"; // Mark this as a Client Component
import useInitialDataFetch from "../hooks/use-initial-data-fetch";

export default function DataProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useInitialDataFetch(); // Fetch initial data (products and users) when the component mounts
  return <>{children}</>;
}
