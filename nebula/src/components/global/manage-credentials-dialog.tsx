// manage-credentials-dialog.tsx with alignment fixes

"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useProductSwitcher } from "@/providers/product-provider";
import { Loader2, Plus } from "lucide-react";
import { CredentialDialog } from "./credential-dialog";
import { Credential } from "@/lib/types";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ManageCredentialsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ManageCredentialsDialog({
  open,
  onOpenChange,
}: ManageCredentialsDialogProps) {
  const { productSwitcher } = useProductSwitcher();
  const [isLoading, setIsLoading] = useState(true);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [defaultCredentialsId, setDefaultCredentialsId] = useState<
    string | undefined
  >();
  const [isCredentialDialogOpen, setIsCredentialDialogOpen] = useState(false);
  const [selectedCredential, setSelectedCredential] =
    useState<Credential | null>(null);
  const [credentialDialogMode, setCredentialDialogMode] = useState<
    "view" | "add" | "edit"
  >("add");

  const fetchCredentials = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(
        `/api/get-credentials?productId=${productSwitcher.product_id}`,
      );
      if (!response.ok) {
        throw new Error("Failed to fetch credentials");
      }
      const data = await response.json();

      setCredentials(data.credentials || []);
      setDefaultCredentialsId(data.default_credentials_id);
    } catch (error) {
      console.error("Error fetching credentials:", error);
      setCredentials([]);
      setDefaultCredentialsId(undefined);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchCredentials();
    }
  }, [open, productSwitcher.product_id]);

  const handleCredentialClick = (credential: Credential) => {
    setSelectedCredential(credential);
    setCredentialDialogMode("view");
    setIsCredentialDialogOpen(true);
  };

  const handleAddCredential = () => {
    setSelectedCredential(null);
    setCredentialDialogMode("add");
    setIsCredentialDialogOpen(true);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Manage Credentials</DialogTitle>
            <DialogDescription className="break-all overflow-hidden max-w-full text-wrap">
              View and manage credentials for {productSwitcher.product_name}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div className="flex justify-end px-4 mb-4">
              <Button
                className="bg-purple-600 hover:bg-purple-700 text-white"
                onClick={handleAddCredential}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Credentials
              </Button>
            </div>

            {isLoading ? (
              <div className="flex justify-center items-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
              </div>
            ) : credentials.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No credentials found
              </div>
            ) : (
              <ScrollArea className="h-[400px]">
                <div className="space-y-4 px-4">
                  {credentials.map((credential) => (
                    <div
                      key={credential.id}
                      className="flex items-center justify-between p-4 rounded-lg border cursor-pointer hover:border-purple-600 transition-colors w-full"
                      onClick={() => handleCredentialClick(credential)}
                    >
                      <div className="min-w-0 w-full overflow-hidden">
                        <h4 className="font-medium truncate break-all overflow-hidden max-w-full text-wrap">
                          {(() => {
                            const uname = credential.credentials?.username;
                            if (uname) return uname;
                            const entries = Object.entries(
                              credential.credentials || {},
                            );
                            const firstField = entries.find(([, v]) => v);
                            if (firstField) {
                              const [key, value] = firstField;
                              const label =
                                key.toLowerCase() === "pin"
                                  ? "PIN"
                                  : key.charAt(0).toUpperCase() + key.slice(1);
                              return `${label}: ${value}`;
                            }
                            return "Credential";
                          })()}
                        </h4>
                        <p className="text-sm text-gray-500 truncate break-all overflow-hidden max-w-full text-wrap">
                          {credential.description}
                          {credential.id === defaultCredentialsId && (
                            <span className="ml-2 text-purple-600 whitespace-nowrap">
                              (Default)
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <CredentialDialog
        open={isCredentialDialogOpen}
        onOpenChange={setIsCredentialDialogOpen}
        onCredentialAdded={fetchCredentials}
        credential={selectedCredential}
        mode={credentialDialogMode}
        onModeChange={setCredentialDialogMode}
        defaultCredentialsId={defaultCredentialsId}
      />
    </>
  );
}
