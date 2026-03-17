"use client";
import { useState } from "react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import AddTestCaseManually from "./add-test-case-manually";
import { useRouter } from "next/navigation";
import { isQaiOrgUser, isQaiOrgAnalystUser } from "@/lib/constants";
import { useUser } from "@clerk/nextjs";

export default function AddTestCaseDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [openAddManualTestCase, setOpenAddManualTestCase] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  console.log(isOpen);
  const router = useRouter();
  const { user } = useUser();
  const userOrgId = user?.publicMetadata?.organisation_id as string | undefined;
  const isQaiUser = isQaiOrgUser(userOrgId) || isQaiOrgAnalystUser(userOrgId);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogTrigger asChild>
        <Button variant="outline" onClick={() => setIsOpen(true)}>
          Add new test case
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md p-6 ">
        <div className="flex flex-col items-center space-y-8 my-5">
          <Button
            className="w-3/4 font-semibold bg-purple-600 text-white py-3 rounded-lg hover:bg-purple-700"
            onClick={() => setOpenAddManualTestCase(true)}
            id={"addTestCase"}
          >
            Add New Test Case Manually
          </Button>
          {isQaiUser && (
            <Button
              onClick={() => router.push("test-case-planning")}
              className="w-3/4 font-semibold bg-purple-600 text-white py-3 rounded-lg hover:bg-purple-700"
            >
              Create Flow From Videos
            </Button>
          )}
        </div>
      </DialogContent>

      <AddTestCaseManually
        open={openAddManualTestCase}
        onClose={() => setOpenAddManualTestCase(false)}
      />
    </Dialog>
  );
}
