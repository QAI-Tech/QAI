"use client";
import { Button } from "@/components/ui/button";
import { Wand2 } from "lucide-react";
import Link from "next/link";
// import { useSelector, useDispatch } from "react-redux";  // TO BE AGAIN UN COMMENTED WHEN THE FEATURE IS USED and below one should be removed
import { useSelector } from "react-redux";
import { RootState } from "@/app/store/store";
import { useProductSwitcher } from "@/providers/product-provider";
import Loading from "@/components/global/loading";
import { useLoading } from "@/app/context/loading-context";
import { useState } from "react";
import { ManageCredentialsDialog } from "@/components/global/manage-credentials-dialog";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

export default function Home() {
  // const dispatch = useDispatch();
  const { productSwitcher } = useProductSwitcher();
  const { isAppLoading } = useLoading();

  // Select data from Redux store
  const testCases = useSelector((state: RootState) => state.testCases);
  const testRuns = useSelector((state: RootState) => state.testRuns);
  const features = useSelector((state: RootState) => state.features);
  const [isCredentialsDialogOpen, setIsCredentialsDialogOpen] = useState(false);
  const router = useRouter();
  // Don't render if still loading
  if (isAppLoading) {
    return null;
  }

  if (!productSwitcher.product_id) {
    return (
      <div className="flex justify-center items-center h-screen p-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Please select a product</h2>
          <p className="text-gray-600 mb-6">
            To continue, please select a product from the dropdown menu in the
            sidebar
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 mt-12">
      <div className="mb-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">
              {productSwitcher.product_name}
            </h1>
            <p className="text-gray-600">
              Automatically plan test cases, manage test runs, and view product
              stats
            </p>
          </div>
          <div className="flex space-x-2">
            <>
              <Button
                variant="outline"
                onClick={() =>
                  router.push(`/${productSwitcher.product_id}/editor`)
                }
              >
                Graph Editor
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">Browser-droid Server</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() =>
                      window.open(
                        `/${productSwitcher.product_id}/browserdroid/server1`,
                        "_blank",
                      )
                    }
                  >
                    Server 1
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      window.open(
                        `/${productSwitcher.product_id}/browserdroid/server2`,
                        "_blank",
                      )
                    }
                  >
                    Server 2
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>

            <Button
              variant="outline"
              onClick={() => setIsCredentialsDialogOpen(true)}
            >
              Manage Credentials
            </Button>
          </div>
        </div>
      </div>

      {/* Test Cases Section */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border bg-white p-6">
          {testCases.loading || features.loading ? (
            <div className="flex justify-center items-center">
              <Loading />
            </div>
          ) : (
            <>
              {testCases?.testCases?.length ? (
                <h2 className="text-3xl font-bold">
                  {testCases.testCases.length} Test Cases
                </h2>
              ) : (
                <h2 className="text-3xl font-bold">No Test Cases Found</h2>
              )}
              <div className="mt-4 hidden gap-3">
                <Link href={`%{productSwitcher.product_id}/test-cases`}>
                  <Button className="bg-purple-600 hover:bg-purple-700">
                    View All Test Cases
                  </Button>
                </Link>
              </div>
            </>
          )}
        </div>

        {/* Test Runs Section */}
        <div className="rounded-lg border bg-white p-6">
          {testRuns.loading ? (
            <div className="flex justify-center items-center">
              <Loading />
            </div>
          ) : (
            <>
              {testRuns?.testRuns?.length ? (
                <h2 className="text-3xl font-bold">
                  {testRuns.testRuns.reduce(
                    (total, section) => total + section.runs.length,
                    0,
                  )}{" "}
                  Test Runs
                </h2>
              ) : (
                <h2 className="text-3xl font-bold">No Test Runs Found</h2>
              )}
              <div className="mt-4 hidden gap-3">
                <Link href={`%{productSwitcher.product_id}/test-runs`}>
                  <Button className="bg-purple-600 hover:bg-purple-700">
                    View Active Test Run
                  </Button>
                </Link>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mt-32 flex justify-center">
        <Link href={`%{productSwitcher.product_id}/test-case-planning`}>
          <Button className="bg-purple-600 hover:bg-purple-700 hidden">
            <Wand2 className="mr-2 h-4 w-4" />
            Create Flow From Videos
          </Button>
        </Link>
        <Link
          href={`${productSwitcher.product_id}/test-cases?selectionMode=true`}
        >
          <Button className="bg-purple-600 hover:bg-purple-700">
            <Wand2 className="mr-2 h-4 w-4" />
            Start Test Run
          </Button>
        </Link>
      </div>
      <ManageCredentialsDialog
        open={isCredentialsDialogOpen}
        onOpenChange={setIsCredentialsDialogOpen}
      />
    </div>
  );
}
