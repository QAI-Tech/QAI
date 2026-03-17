import { useState, useEffect, useRef, type ChangeEvent } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Eye, EyeOff, ChevronLeft, Plus, Trash, Upload, X } from "lucide-react";
import { transitions } from "@/lib/animations";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useUser } from "@clerk/nextjs";
import { toast } from "sonner";
import * as Sentry from "@sentry/nextjs";
import {
  GCS_BUCKET_URL,
  PRODUCT_DESIGN_ASSETS_BUCKET_NAME,
} from "@/lib/constants";

interface Credential {
  id: string;
  name: string;
  description?: string;
  username?: string;
  password?: string;
  isDefault: boolean;
  flowIds: string[];
  createdAt: Date;
  updatedAt: Date;
  credentials?: Record<string, string>;
}

interface Flow {
  id: string;
  name: string;
}

// Interface for credential updates
interface CredentialFormUpdate {
  name?: string;
  description?: string;
  username?: string;
  password?: string;
  isDefault?: boolean;
  credentials?: Record<string, string>;
}

interface CredentialDetailsProps {
  credential: Credential;
  onDelete: () => void;
  onBack: () => void;
  onUpdate: (updates: CredentialFormUpdate) => void;
  onSetDefault: () => void;
  flows?: Flow[];
  productId?: string;
}

interface CredentialField {
  id: string;
  key: string;
  value: string;
  fileName?: string;
}

export function CredentialDetails({
  credential,
  onDelete,
  onBack,
  onUpdate,
  onSetDefault,
  flows = [],
  productId,
}: CredentialDetailsProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState(credential.name);
  const [hoveredFlowId, setHoveredFlowId] = useState<string | null>(null);
  const [uploadingFieldId, setUploadingFieldId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useUser();

  // Credential fields array
  const [credentialFields, setCredentialFields] = useState<CredentialField[]>(
    [],
  );

  // Track if this is a new credential (starts with 'temp-')
  const isNewCredential = credential.id.startsWith("temp-");

  const [isSettingDefault, setIsSettingDefault] = useState(false);

  // Preset credential types
  const presetOptions = [
    "username",
    "email",
    "password",
    "pin",
    "file",
    "Custom",
  ] as const;

  const isFileCredential = (key: string, value: string) => {
    const isGcsUrl =
      value.startsWith(GCS_BUCKET_URL) ||
      value.startsWith("https://storage.googleapis.com/") ||
      value.includes("storage.googleapis.com");

    if (isGcsUrl) return true;
  };

  // Helper to generate unique IDs for credential fields
  const generateId = () =>
    `cred-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

  // Reset local state when credential changes
  useEffect(() => {
    setName(credential.name);
    setShowPassword(false);
    setIsSettingDefault(false);

    // Initialize credential fields
    const initialFields: CredentialField[] = [];

    // Handle existing credentials
    if (!isNewCredential) {
      if (credential.credentials) {
        // Use credentials object if available
        Object.entries(credential.credentials).forEach(([key, value]) => {
          if (isFileCredential(key, value)) {
            initialFields.push({
              id: generateId(),
              key: "file",
              value,
              fileName: key,
            });
            return;
          }
          initialFields.push({
            id: generateId(),
            key,
            value,
          });
        });
      } else {
        // Fallback to username/password fields
        if (credential.username) {
          initialFields.push({
            id: generateId(),
            key: "username",
            value: credential.username,
          });
        }

        if (credential.password) {
          initialFields.push({
            id: generateId(),
            key: "password",
            value: credential.password,
          });
        }
      }
    }

    // For new credentials, start with an empty username field
    if (initialFields.length === 0) {
      initialFields.push({
        id: generateId(),
        key: "username",
        value: "",
      });
    }

    setCredentialFields(initialFields);
  }, [credential.id]);

  // Handle flow card hover to highlight flow in canvas
  const handleFlowMouseEnter = (flowId: string) => {
    setHoveredFlowId(flowId);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("graphFlowHover", {
          detail: { flowId },
        }),
      );
    }
  };

  const handleFlowMouseLeave = () => {
    setHoveredFlowId(null);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("graphFlowHover", {
          detail: { flowId: null },
        }),
      );
    }
  };

  // For existing credentials, update on blur
  const handleNameBlur = () => {
    if (!isNewCredential && name !== credential.name) {
      onUpdate({ name });
    }
  };

  const handleCredentialsUpdate = (
    updatedFields: CredentialField[] = credentialFields,
  ) => {
    if (isNewCredential) return;

    const credentialsObject: Record<string, string> = {};
    updatedFields.forEach((field) => {
      if (field.key.toLowerCase() === "file") {
        if (field.fileName && field.value) {
          credentialsObject[field.fileName] = field.value;
        }
        return;
      }

      if (field.key && field.value) {
        credentialsObject[field.key] = field.value;
      }
    });

    onUpdate({
      name,
      credentials: credentialsObject,
      isDefault: credential.isDefault,
    });
  };

  // For new credentials, collect all fields and save at once
  const handleSaveCredential = () => {
    const credentialsObject: Record<string, string> = {};

    // Convert credential fields to object
    credentialFields.forEach((field) => {
      if (field.key.toLowerCase() === "file") {
        if (field.fileName && field.value) {
          credentialsObject[field.fileName] = field.value;
        }
        return;
      }

      if (field.key && field.value) {
        credentialsObject[field.key] = field.value;
      }
    });
    onUpdate({
      name,
      credentials: credentialsObject,
      isDefault: credential.isDefault,
    });
  };

  const handleAddCredentialField = () => {
    const presetOrder = ["username", "email", "password", "pin"] as const;
    const used = new Set(credentialFields.map((p) => p.key.toLowerCase()));
    const next = presetOrder.find((k) => !used.has(k)) || "Custom";

    setCredentialFields((prev) => [
      ...prev,
      {
        id: generateId(),
        key: next === "Custom" ? "" : next,
        value: "",
      },
    ]);
  };

  // Remove a credential field
  const handleRemoveCredentialField = (id: string) => {
    const newFields = credentialFields.filter((field) => field.id !== id);
    setCredentialFields(newFields);
    handleCredentialsUpdate(newFields);
  };

  const handleCredentialFileUpload = async (
    event: ChangeEvent<HTMLInputElement>,
    fieldId: string,
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const organisationId =
      (user?.publicMetadata?.organisation_id as string | undefined) || "";

    if (!organisationId || !productId) {
      toast.error("Missing organisation or product details");
      return;
    }

    setUploadingFieldId(fieldId);
    try {
      const safeFileName = file.name.replace(/\s+/g, "_");
      const uploadPath = `${organisationId}/${productId}/credentials/${Date.now()}-${safeFileName}`;

      const signedUrlResponse = await fetch(
        `/api/generate-instructions?getSignedUrl=true&bucketName=${PRODUCT_DESIGN_ASSETS_BUCKET_NAME}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: uploadPath,
            contentType: file.type || "application/octet-stream",
          }),
        },
      );

      if (!signedUrlResponse.ok) {
        throw new Error("Failed to get signed URL");
      }

      const { signedUrl, fileName } = await signedUrlResponse.json();

      const uploadResponse = await fetch(signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error("Failed to upload credential file");
      }

      const fileNameWithoutPrefix = fileName.replace("gs://", "");
      const fileUrl = `${GCS_BUCKET_URL}${fileNameWithoutPrefix}`;

      setCredentialFields((prev) =>
        prev.map((field) => {
          if (field.id !== fieldId) return field;
          const finalName = field.fileName || file.name;
          return {
            ...field,
            fileName: finalName,
            value: fileUrl,
          };
        }),
      );

      toast.success("File uploaded and added to credentials");
    } catch (error) {
      console.error("Credential file upload failed:", error);
      Sentry.captureException(error, {
        level: "error",
        tags: { priority: "high" },
      });
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to upload credential file",
      );
    } finally {
      setUploadingFieldId(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // Check if save button should be enabled
  const isSaveEnabled =
    name.trim() !== "" &&
    credentialFields.some((field) => {
      if (field.key.toLowerCase() === "file") {
        return Boolean(field.fileName && field.value);
      }
      return Boolean(field.key && field.value);
    }) &&
    !uploadingFieldId;

  // Check if a field value is a password
  const isPasswordField = (key: string) =>
    key.toLowerCase() === "password" || key.toLowerCase() === "pin";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={transitions.normal}
      className="h-full flex flex-col overflow-y-auto"
    >
      <div className="p-4 space-y-4">
        {/* Header with back button, title and actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-muted-foreground hover:text-foreground transition-colors duration-fast"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleNameBlur}
            className="flex-1 !text-lg font-semibold h-auto bg-transparent border border-transparent p-1 -m-1 rounded transition-colors hover:border-border focus:border-primary focus-visible:ring-0 focus-visible:ring-offset-0"
            placeholder="Credential name"
          />
          <div className="flex items-center gap-3">
            {!isNewCredential && (
              <>
                {!credential.isDefault && (
                  <Button
                    onClick={() => {
                      setIsSettingDefault(true);
                      onSetDefault();
                    }}
                    variant="ghost"
                    size="sm"
                    disabled={isSettingDefault}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-fast"
                  >
                    {isSettingDefault ? (
                      <span>Setting default...</span>
                    ) : (
                      <span>Set as Default</span>
                    )}
                  </Button>
                )}
                {credential.isDefault && (
                  <Badge variant="secondary" className="px-2 py-1">
                    Default
                  </Badge>
                )}
                <button
                  onClick={onDelete}
                  className="text-sm text-muted-foreground hover:text-destructive transition-colors duration-fast"
                >
                  Delete
                </button>
              </>
            )}
          </div>
        </div>

        <Separator />

        {/* Credentials */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-muted-foreground">
            Credentials
          </h4>

          <div className="space-y-3">
            {/* Credential fields */}
            {credentialFields.map((field) => (
              <div key={field.id} className="grid grid-cols-12 gap-3 items-end">
                <div className="space-y-1 col-span-5">
                  <Label className="text-xs">Type</Label>
                  {field.key.toLowerCase() !== "username" &&
                  field.key.toLowerCase() !== "email" &&
                  field.key.toLowerCase() !== "password" &&
                  field.key.toLowerCase() !== "pin" &&
                  field.key.toLowerCase() !== "file" ? (
                    <Input
                      placeholder="Enter type"
                      value={field.key}
                      onChange={(e) => {
                        const v = e.target.value;
                        setCredentialFields((prev) =>
                          prev.map((p) =>
                            p.id === field.id ? { ...p, key: v } : p,
                          ),
                        );
                      }}
                      onBlur={() => handleCredentialsUpdate()}
                    />
                  ) : (
                    <Select
                      value={field.key}
                      onValueChange={(val) => {
                        const newVal = val === "Custom" ? "" : val;
                        const newFields = credentialFields.map((p) =>
                          p.id === field.id ? { ...p, key: newVal } : p,
                        );
                        setCredentialFields(newFields);
                        if (val !== "Custom") {
                          handleCredentialsUpdate(newFields);
                        }
                      }}
                    >
                      <SelectTrigger className="h-9 w-full">
                        <SelectValue placeholder="Type" />
                      </SelectTrigger>
                      <SelectContent>
                        {(() => {
                          const used = new Set(
                            credentialFields
                              .filter((f) => f.id !== field.id)
                              .map((f) => f.key.toLowerCase()),
                          );

                          return presetOptions.map((opt) => {
                            const optLower = opt.toLowerCase();
                            const disabled =
                              opt !== "Custom" &&
                              optLower !== "file" &&
                              used.has(optLower);

                            return (
                              <SelectItem
                                key={opt}
                                value={opt}
                                disabled={disabled}
                              >
                                {opt}
                              </SelectItem>
                            );
                          });
                        })()}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="space-y-1 col-span-6">
                  {field.key.toLowerCase() === "file" ? (
                    <div className="grid grid-cols-2 gap-3 items-end">
                      <div className="space-y-1">
                        <Label className="text-xs">Name</Label>
                        <Input
                          placeholder="Enter name"
                          value={field.fileName || ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            setCredentialFields((prev) =>
                              prev.map((p) =>
                                p.id === field.id ? { ...p, fileName: v } : p,
                              ),
                            );
                          }}
                          onBlur={() => handleCredentialsUpdate()}
                        />
                      </div>
                      {field.value ? (
                        <div className="flex items-center gap-2 justify-center px-3 py-2 rounded-md border border-border bg-muted/50">
                          <a
                            href={field.value}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm text-primary hover:underline"
                          >
                            Preview
                          </a>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 hover:bg-destructive/10"
                            onClick={() => {
                              const updatedFields = credentialFields.map((p) =>
                                p.id === field.id
                                  ? { ...p, value: "", fileName: "" }
                                  : p,
                              );
                              setCredentialFields(updatedFields);
                              handleCredentialsUpdate(updatedFields);
                            }}
                          >
                            <X className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            fileInputRef.current?.setAttribute(
                              "data-field-id",
                              field.id,
                            );
                            fileInputRef.current?.click();
                          }}
                          disabled={uploadingFieldId === field.id}
                          className="w-full justify-center"
                        >
                          <Upload className="h-4 w-4 mr-1" />
                          {uploadingFieldId === field.id
                            ? "Uploading..."
                            : "Upload file"}
                        </Button>
                      )}
                    </div>
                  ) : (
                    <>
                      <Label className="text-xs">Value</Label>
                      <div className="relative">
                        <Input
                          type={
                            isPasswordField(field.key) && !showPassword
                              ? "password"
                              : "text"
                          }
                          placeholder="Enter value"
                          value={field.value}
                          onChange={(e) => {
                            const v = e.target.value;
                            setCredentialFields((prev) =>
                              prev.map((p) =>
                                p.id === field.id ? { ...p, value: v } : p,
                              ),
                            );
                          }}
                          onBlur={() => handleCredentialsUpdate()}
                        />
                        {isPasswordField(field.key) && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                            onClick={() => setShowPassword(!showPassword)}
                          >
                            {showPassword ? (
                              <EyeOff className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <Eye className="h-4 w-4 text-muted-foreground" />
                            )}
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </div>
                <div className="flex items-center justify-end col-span-1">
                  {credentialFields.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveCredentialField(field.id)}
                    >
                      <Trash className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}

            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const fieldId = e.target.getAttribute("data-field-id");
                if (fieldId) {
                  handleCredentialFileUpload(e, fieldId);
                }
              }}
              disabled={!!uploadingFieldId}
            />

            {/* Add credential button */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddCredentialField}
              className="mt-2"
            >
              <Plus className="h-4 w-4 mr-1" /> Add credential
            </Button>
          </div>
        </div>

        {/* Only show flows section for existing credentials */}
        {!isNewCredential && (
          <>
            <Separator />
            {/* Flows using this credential */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">
                Used in {flows.length} flow{flows.length !== 1 ? "s" : ""}
              </h4>

              {flows.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  This credential is not currently used in any flows
                </p>
              ) : (
                <div className="space-y-2">
                  {flows.map((flow) => (
                    <div
                      key={flow.id}
                      className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all duration-200 ${
                        hoveredFlowId === flow.id
                          ? "border-primary bg-accent/70"
                          : "border-border hover:border-primary/30 hover:bg-accent/50"
                      }`}
                      onMouseEnter={() => handleFlowMouseEnter(flow.id)}
                      onMouseLeave={handleFlowMouseLeave}
                    >
                      <span className="text-sm font-medium text-foreground truncate flex-1">
                        {flow.name}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Save button for new credentials */}
        {isNewCredential && (
          <>
            <Separator />
            <div className="flex justify-end">
              <Button
                onClick={handleSaveCredential}
                disabled={!isSaveEnabled}
                className="px-6"
              >
                Save Credential
              </Button>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}
