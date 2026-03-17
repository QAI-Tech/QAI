import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
// import { useRouter } from "next/navigation";

export default function Home() {
  // const router = useRouter();
  // router.push("/");
  return (
    <div className="min-h-screen flex flex-col items-center px-4 md:px-6 py-8 md:py-12">
      <div className="w-full max-w-7xl mx-auto">
        <div className="h-[4rem]"></div>
        <div
          className={cn(
            "fixed top-0 right-0 left-0 p-4 flex items-center bg-secondary-background shadow-sm shadow-primary/5 backdrop-blur-md justify-between z-10 transition-all",
          )}
        >
          {/* <Home /> */}
          <aside className={cn("flex items-center gap-2")}>
            <img src="/QAI-logo.svg" height={32} width={32} alt="QAI Logo" />
            <span className="text-xl font-bold">QAI</span>
          </aside>
        </div>
        {/* Header */}
        <div className="flex flex-col items-center mb-16 md:mb-24 relative">
          <div className="text-center">
            <h2 className="text-3xl md:text-4xl font-bold">Welcome to QAI</h2>
            <p className="text-xl mt-2">Your Quality Assurance copilot.</p>
          </div>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 mb-16 md:mb-24">
          {/* Card 1 */}
          <div className="relative rounded-3xl overflow-hidden border p-0 flex flex-col">
            <div className="flex flex-col md:flex-row">
              <div className="w-full md:w-auto">
                <Image
                  src="/spoony.jpg"
                  alt="QA Process"
                  width={200}
                  height={300}
                  className="w-full h-auto"
                />
              </div>
              <div className="p-6 flex flex-col justify-center">
                <h3 className="text-xl font-bold mb-2">
                  Plan your QA process with QAI
                </h3>
                <p className="text-gray-700">
                  Get all your tests cases organized as a single source of truth
                  within minutes.
                </p>
              </div>
            </div>
          </div>

          {/* Card 2 */}
          <div className="relative rounded-3xl overflow-hidden border p-0 flex flex-col">
            <div className="flex flex-col md:flex-row">
              <div className="w-full md:w-auto">
                <Image
                  src="/spoony.jpg"
                  alt="Automated Testing"
                  width={200}
                  height={300}
                  className="w-full h-auto"
                />
              </div>
              <div className="p-6 flex flex-col justify-center">
                <h3 className="text-xl font-bold mb-2">
                  Let QAI do the testing for you
                </h3>
                <p className="text-gray-700">
                  Test all planned scenarios on your latest app version across
                  several mobile devices.
                </p>
                <p className="text-gray-700">Automatic, no-code.</p>
              </div>
            </div>
          </div>

          {/* Card 3 */}
          <div className="relative rounded-3xl overflow-hidden border p-0 flex flex-col">
            <div className="flex flex-col md:flex-row">
              <div className="w-full md:w-auto">
                <Image
                  src="/spoony.jpg"
                  alt="Bug Detection"
                  width={200}
                  height={300}
                  className="w-full h-auto"
                />
              </div>
              <div className="p-6 flex flex-col justify-center">
                <h3 className="text-xl font-bold mb-2">
                  Catch bugs before your customers do.
                </h3>
                <p className="text-gray-700">
                  Make decisions faster with actionable defect reports, release
                  with confidence.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Get Started Button */}
        <div className="flex justify-center">
          <Link href="/">
            <Button className="bg-purple-600 hover:bg-purple-700 text-white text-xl py-6 px-12 rounded-full">
              Get Started
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
