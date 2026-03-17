"use client";
import Functionality from "./_components/functionality";

import { useRouter } from "next/navigation";

export default function Page() {
  const router = useRouter();
  router.push("/dashboard");

  return (
    <main className="w-full bg-secondary-background text-primary">
      <Functionality />
    </main>
  );
}
