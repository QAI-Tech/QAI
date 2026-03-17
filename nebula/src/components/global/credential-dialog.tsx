"use client";
import type React from "react";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProductSwitcher } from "@/providers/product-provider";
import { Loader2, Eye, EyeOff, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Credential } from "@/lib/types";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDispatch } from "react-redux";
import type { AppDispatch } from "@/app/store/store";
import { addCredential } from "@/app/store/credentialsSlice";
import { cn, ValidationHelpers } from "@/lib/utils";
import * as Sentry from "@sentry/nextjs";
import { ConsoleCollaborationEvents } from "@/app/(editor)/types/collaborationEvents";

interface CredentialDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCredentialAdded?: (
    credentialId?: string,
    updatedCredential?: Credential,
  ) => void;
  credential?: Credential | null;
  mode?: "view" | "add" | "edit";
  onModeChange?: (mode: "view" | "add" | "edit") => void;
  defaultCredentialsId?: string;
  testCaseId?: string;
  isTestCaseLevel?: boolean;
  defaultDescription?: string;
}

export function CredentialDialog({
  open,
  onOpenChange,
  onCredentialAdded,
  credential,
  mode = "add",
  onModeChange,
  defaultCredentialsId,
  testCaseId,
  isTestCaseLevel,
}: CredentialDialogProps) {
  const { productSwitcher } = useProductSwitcher();
  const dispatch = useDispatch<AppDispatch>();
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [description, setDescription] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [customCreds, setCustomCreds] = useState<
    { id: string; key: string; value: string }[]
  >([]);
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [isDefault, setIsDefault] = useState(false);
  const presetOptions = [
    "username",
    "email",
    "password",
    "pin",
    "Custom",
  ] as const;

  // Validation error states
  const [labelError, setLabelError] = useState("");

  // Helper to generate stable unique IDs per credential row
  const generateId = () =>
    `cred-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

  // Validation functions
  const validateLabel = (value: string) => {
    if (!value.trim()) {
      return "Label is required";
    }
    if (!ValidationHelpers.isValidGeneralName(value)) {
      return "Label must not exceed 1000 characters.";
    }
    return "";
  };

  const resetForm = () => {
    setDescription("");
    setShowPassword(false);
    setCustomCreds([]);
    setShowTooltip(false);
    setIsDefault(false);
    setIsDeleting(false);
    setLabelError("");
  };

  useEffect(() => {
    if (!showDeleteAlert) {
      setIsDeleting(false);
    }
  }, [showDeleteAlert]);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm();
      if (onModeChange) {
        onModeChange("add");
      }
    }
    onOpenChange(newOpen);
  };

  useEffect(() => {
    if (open) {
      if (credential && (mode === "view" || mode === "edit")) {
        const creds = credential.credentials || ({} as Record<string, string>);
        setCustomCreds(
          Object.entries(creds).map(([k, v]) => ({
            id: generateId(),
            key: k,
            value: v,
          })),
        );
        setDescription(credential.description);
        setIsDefault(credential.id === defaultCredentialsId);
      } else {
        setCustomCreds([{ id: generateId(), key: "username", value: "" }]);
        setDescription("");
        setIsDefault(false);
      }
    } else {
      resetForm();
    }

    return () => {
      resetForm();
    };
  }, [credential, mode, open, defaultCredentialsId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const mergedCredentials: Record<string, string> = Object.fromEntries(
      customCreds
        .filter((p) => p.key.trim() !== "")
        .map((p) => [p.key.trim(), p.value]),
    );

    if (Object.keys(mergedCredentials).length === 0) {
      toast.error("Add at least one credential");
      return;
    }

    // Validate label
    const labelValidation = validateLabel(description);
    setLabelError(labelValidation);

    if (labelValidation) {
      return;
    }

    setIsLoading(true);

    try {
      if (mode === "edit" && credential) {
        const originalCreds = (credential.credentials || {}) as Record<
          string,
          string
        >;
        const initialIsDefault = credential.id === defaultCredentialsId;
        const defaultChanged = initialIsDefault !== isDefault;
        const credentialsChanged =
          JSON.stringify(originalCreds) !== JSON.stringify(mergedCredentials);
        const finalDescription =
          description ||
          (isTestCaseLevel ? `Test Case credentials` : "Product credentials");
        const descriptionChanged = credential.description !== finalDescription;

        if (!credentialsChanged && !defaultChanged && !descriptionChanged) {
          toast.message("No changes to update");
          setIsLoading(false);
          return;
        }
        const response = await fetch("/api/update-credentials", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            credentials_id: credential.id,
            product_id: productSwitcher.product_id,
            credentials: mergedCredentials,
            description: finalDescription,
            is_default: isDefault,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to update credentials");
        }

        toast.success("Credentials updated successfully");
        onCredentialAdded?.(credential.id, {
          ...credential,
          credentials: mergedCredentials,
          description:
            description ||
            (isTestCaseLevel ? `Test Case credentials` : "Product credentials"),
        });
      } else {
        if (!productSwitcher.product_id) {
          throw new Error("Missing product ID for adding credentials");
        }

        if (isTestCaseLevel && !testCaseId) {
          throw new Error(
            "Missing test case ID for adding test case credentials",
          );
        }

        const credentialData = {
          credentials: mergedCredentials,
          description:
            description ||
            (isTestCaseLevel ? `Test Case credentials` : "Product credentials"),
          is_default: !isTestCaseLevel ? isDefault : undefined,
        };

        const resultAction = await dispatch(
          addCredential({
            productId: productSwitcher.product_id,
            testCaseId: isTestCaseLevel ? testCaseId : undefined,
            data: credentialData,
          }),
        );

        if (addCredential.fulfilled.match(resultAction)) {
          const newCredential = resultAction.payload;
          toast.success("Credentials added successfully");

          // Emit collaboration event if we're in Graph Editor context
          // Check if collaboration events are available (only in Graph Editor)
          if (ConsoleCollaborationEvents.instance) {
            try {
              const collaborationEvents = new ConsoleCollaborationEvents();
              const credentialPayload = {
                id: newCredential.id,
                credentials: newCredential.credentials,
                description: newCredential.description,
                product_id: newCredential.product_id,
                created_at: newCredential.created_at,
                updated_at: newCredential.updated_at || null,
              };
              collaborationEvents.addCredential(credentialPayload);
            } catch (error) {
              console.warn(
                "Failed to emit credential collaboration event:",
                error,
              );
            }
          }

          onCredentialAdded?.(newCredential.id, newCredential);
        } else {
          throw new Error("Failed to add credentials");
        }
      }

      handleOpenChange(false);
    } catch (error) {
      console.error(
        mode === "edit"
          ? "Error updating credentials:"
          : "Error adding credentials:",
        error,
      );
      Sentry.captureException(error, {
        level: "fatal",
        tags: { priority: "high" },
      });
      toast.error(
        mode === "edit"
          ? "Failed to update credentials"
          : "Failed to add credentials",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!credential?.id) return;

    try {
      setIsDeleting(true);
      const response = await fetch("/api/delete-credentials", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          credentials_id: credential.id,
          product_id: productSwitcher.product_id,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to delete credentials");
      }

      toast.success("Credentials deleted successfully");
      onCredentialAdded?.();
      handleOpenChange(false);
      setShowDeleteAlert(false);
    } catch (error) {
      console.error("Error deleting credentials:", error);
      Sentry.captureException(error, {
        level: "fatal",
        tags: { priority: "high" },
      });
      toast.error("Failed to delete credentials");
    } finally {
      setIsDeleting(false);
      if (!credential?.id) {
        setShowDeleteAlert(false);
      }
    }
  };

  const handleEditClick = () => {
    setShowPassword(false);
    onModeChange?.("edit");
  };

  const isViewMode = mode === "view";
  const isEditMode = mode === "edit";
  const dialogTitle = isViewMode
    ? "Credential Details"
    : isEditMode
      ? "Edit Credentials"
      : "Add Credentials";
  const dialogDescription = isViewMode
    ? undefined
    : `${isEditMode ? "Edit" : "Add"} credentials for ${productSwitcher.product_name}`;

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>{dialogTitle}</DialogTitle>
              {isViewMode && !isTestCaseLevel && (
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleEditClick}
                    className="text-gray-500 hover:text-gray-600 hover:bg-gray-50"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <TooltipProvider>
                    <Tooltip open={showTooltip} onOpenChange={setShowTooltip}>
                      <TooltipTrigger asChild>
                        <div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (credential?.id === defaultCredentialsId) {
                                setShowTooltip(true);
                                setTimeout(() => setShowTooltip(false), 2000);
                              } else {
                                setShowDeleteAlert(true);
                              }
                            }}
                            className="text-red-500 hover:text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TooltipTrigger>
                      {credential?.id === defaultCredentialsId && (
                        <TooltipContent>
                          <p>Default credentials cannot be deleted</p>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                </div>
              )}
            </div>
            {dialogDescription && (
              <DialogDescription>{dialogDescription}</DialogDescription>
            )}
          </DialogHeader>

          {isViewMode ? (
            <div className="py-4 space-y-4">
              <div>
                <Label className="text-sm font-medium text-gray-500">
                  Label
                </Label>
                <p className="mt-1 break-all overflow-hidden max-w-full text-wrap">
                  {description}
                </p>
              </div>
              {customCreds.length > 0 && (
                <div className="space-y-4">
                  {customCreds.map((pair) => (
                    <div key={pair.id}>
                      <Label className="text-sm font-medium text-gray-500">
                        {pair.key}
                      </Label>
                      <div className="mt-1 flex items-center max-w-full">
                        <p className="flex-1 font-mono break-all overflow-hidden text-wrap overflow-ellipsis">
                          {pair.key.toLowerCase() === "password" &&
                          !showPassword
                            ? "••••••••"
                            : pair.value}
                        </p>
                        {pair.key.toLowerCase() === "password" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setShowPassword(!showPassword)}
                            className="ml-2 flex-shrink-0"
                          >
                            {showPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="description">Label</Label>
                <Input
                  id="description"
                  placeholder="Enter label"
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    if (labelError) setLabelError("");
                  }}
                  className={cn(
                    labelError
                      ? "border-red-500 focus-visible:ring-red-500"
                      : "",
                  )}
                  disabled={isLoading}
                />
                {labelError && (
                  <p className="text-red-500 text-sm font-medium">
                    {labelError}
                  </p>
                )}
              </div>

              <div className="space-y-3">
                {customCreds.length > 0 && (
                  <div className="space-y-2">
                    {customCreds.map((pair) => {
                      const lowerKey = pair.key.toLowerCase();
                      const presetWithoutCustom = [
                        "username",
                        "email",
                        "password",
                        "pin",
                      ];
                      const selectedPreset = presetWithoutCustom.includes(
                        lowerKey,
                      )
                        ? lowerKey
                        : "Custom";
                      return (
                        <div
                          key={pair.id}
                          className="grid grid-cols-12 gap-3 items-end"
                        >
                          <div className="space-y-1 col-span-5">
                            <Label className="text-xs">Type</Label>
                            {selectedPreset === "Custom" ? (
                              <Input
                                placeholder="Enter type"
                                value={pair.key}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setCustomCreds((prev) =>
                                    prev.map((p) =>
                                      p.id === pair.id ? { ...p, key: v } : p,
                                    ),
                                  );
                                }}
                                disabled={isLoading || isEditMode}
                              />
                            ) : (
                              <Select
                                value={selectedPreset}
                                onValueChange={(val) => {
                                  setCustomCreds((prev) =>
                                    prev.map((p) =>
                                      p.id === pair.id
                                        ? {
                                            ...p,
                                            key: val === "Custom" ? "" : val,
                                          }
                                        : p,
                                    ),
                                  );
                                }}
                                disabled={isLoading || isEditMode}
                              >
                                <SelectTrigger className="h-9 w-full">
                                  <SelectValue placeholder="Type" />
                                </SelectTrigger>
                                <SelectContent>
                                  {(() => {
                                    const used = new Set(
                                      customCreds
                                        .map((p) => p.key.toLowerCase())
                                        .filter((k) =>
                                          presetWithoutCustom.includes(k),
                                        ),
                                    );
                                    const currentLower = lowerKey;
                                    const options = presetOptions.filter(
                                      (opt) => {
                                        const optLower = opt.toLowerCase();
                                        if (opt === "Custom") return true;
                                        if (optLower === currentLower)
                                          return true;
                                        return !used.has(optLower);
                                      },
                                    );
                                    return options.map((opt) => (
                                      <SelectItem key={opt} value={opt}>
                                        {opt}
                                      </SelectItem>
                                    ));
                                  })()}
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                          <div className="space-y-1 col-span-6">
                            <Label className="text-xs">Value</Label>
                            <Input
                              placeholder="Enter value"
                              value={pair.value}
                              onChange={(e) => {
                                const v = e.target.value;
                                setCustomCreds((prev) =>
                                  prev.map((p) =>
                                    p.id === pair.id ? { ...p, value: v } : p,
                                  ),
                                );
                              }}
                              disabled={isLoading}
                            />
                          </div>
                          <div className="flex items-center justify-end col-span-1">
                            {customCreds.length > 1 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setCustomCreds((prev) =>
                                    prev.filter((p) => p.id !== pair.id),
                                  );
                                }}
                                disabled={isLoading}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {!isEditMode && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const presetOrder = [
                        "username",
                        "email",
                        "password",
                        "pin",
                      ] as const;
                      const used = new Set(
                        customCreds.map((p) => p.key.toLowerCase()),
                      );
                      const next =
                        presetOrder.find((k) => !used.has(k)) || "Custom";
                      setCustomCreds((prev) => [
                        ...prev,
                        {
                          id: generateId(),
                          key: next === "Custom" ? "" : next,
                          value: "",
                        },
                      ]);
                    }}
                    disabled={isLoading}
                  >
                    + Add credential
                  </Button>
                )}
              </div>

              {!isTestCaseLevel && (
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="setAsDefault"
                    checked={isDefault}
                    onCheckedChange={(checked) => {
                      setIsDefault(checked as boolean);
                    }}
                    disabled={isLoading}
                  />
                  <label
                    htmlFor="setAsDefault"
                    className="text-sm text-gray-600 cursor-pointer"
                  >
                    Set these credentials as default
                  </label>
                </div>
              )}

              <div className="flex justify-end space-x-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (isEditMode && !isTestCaseLevel) {
                      onModeChange?.("view");
                    } else {
                      handleOpenChange(false);
                    }
                  }}
                  disabled={isLoading}
                >
                  {isEditMode && !isTestCaseLevel ? "Back" : "Cancel"}
                </Button>
                <Button
                  type="submit"
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {isEditMode ? "Updating..." : "Adding..."}
                    </>
                  ) : isEditMode ? (
                    "Update Credentials"
                  ) : (
                    "Add Credentials"
                  )}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete these credentials. This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <Button
              onClick={handleDelete}
              className="bg-red-500 hover:bg-red-600 text-white"
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
