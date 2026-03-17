"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

interface WebExtensionInstallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WebExtensionInstallDialog({
  open,
  onOpenChange,
}: WebExtensionInstallDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-2xl font-semibold">
            Install Web Recorder Extension
          </DialogTitle>
        </DialogHeader>

        <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg">
          <div className="flex items-start gap-3">
            <ExternalLink className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
            <div className="text-sm text-foreground">
              <p className="font-medium mb-1 text-foreground">
                Install the QAI Web Recorder Extension
              </p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>
                  Open the{" "}
                  <a
                    href="https://chromewebstore.google.com"
                    target="_blank"
                    rel="noreferrer"
                    className="underline text-primary hover:text-primary/80"
                  >
                    Chrome Web Store
                  </a>
                </li>
                <li>Search for &quot;QAI Web Recorder&quot;</li>
                <li>Click &quot;Add to Chrome&quot;</li>
                <li>Approve the permissions when prompted</li>
                <li>Click the extension icon and start recording</li>
                <li>Navigate to any website and interact with it</li>
              </ol>
            </div>
          </div>
        </div>

        <div className="flex justify-center">
          <Button
            onClick={() =>
              window.open(
                "https://chromewebstore.google.com/detail/mmjmlhbbimjhjiiebomjpepfjooigoko?utm_source=item-share-cb",
                "_blank",
              )
            }
          >
            Install QAI Plugin
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
