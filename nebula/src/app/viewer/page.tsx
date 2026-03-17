"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import PIMViewer from "./PIMViewer";

export default function ViewerPage() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        position: "relative",
        overflow: "visible",
        paddingTop: 24,
      }}
    >
      <div
        style={{
          width: "900px",
          height: "700px",
          maxWidth: "100%",
          maxHeight: "100%",
          minWidth: "320px",
          minHeight: "240px",
          background: "rgba(20,20,20,0.12)",
          borderRadius: 18,
          boxShadow: "0 4px 32px rgba(0,0,0,0.18)",
          padding: 0,
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          overflow: "visible",
        }}
      >
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center space-y-6">
            <h1 className="text-3xl font-bold text-gray-900">PIM Viewer</h1>
            <p className="text-gray-600 max-w-md mx-auto">
              Click the button below to open the interactive 3D flow viewer in a
              modal.
            </p>

            <Dialog open={isOpen} onOpenChange={setIsOpen}>
              <DialogTrigger asChild>
                <Button size="lg" className="px-8 py-3">
                  Open PIM Viewer
                </Button>
              </DialogTrigger>
              <DialogContent
                className="w-screen h-screen max-w-none p-0 bg-black border-0 rounded-none"
                hideCloseButton={true}
              >
                <PIMViewer onClose={() => setIsOpen(false)} />
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
    </div>
  );
}
