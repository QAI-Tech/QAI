import { SignIn } from "@clerk/nextjs";
import Image from "next/image";
import { cn } from "@/lib/utils";

export default function AuthPage() {
  return (
    <>
      <div
        className={cn(
          "fixed top-0 right-0 left-0 p-4 flex items-center bg-secondary-background shadow-sm shadow-primary/5 backdrop-blur-md z-10 transition-all",
        )}
      >
        <aside className="flex items-center gap-2 flex-1">
          <Image
            unoptimized
            src={"/QAI-logo.svg"}
            height={32}
            width={32}
            alt="QAI Logo"
          />
          <span className="text-xl font-bold">QAI</span>
        </aside>

        <aside className="flex-1 text-center">
          <span className="text-xl">Hop In</span>
        </aside>

        <aside className="flex-1 flex justify-end"></aside>
      </div>
      <div className="flex items-center justify-center h-screen">
        <SignIn />
      </div>
    </>
  );
}
