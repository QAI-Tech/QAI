"use client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ValidationHelpers } from "@/lib/utils";
import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useProductSwitcher } from "@/providers/product-provider";
import { JiraCredential } from "@/lib/types";

interface JiraIntegrationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function JiraIntegrationDialog({
  open,
  onOpenChange,
}: JiraIntegrationDialogProps) {
  const { productSwitcher } = useProductSwitcher();
  const [email, setEmail] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [jiraProjectKey, setJiraProjectKey] = useState("");
  const [jiraBaseUrl, setJiraBaseUrl] = useState("");
  const [jiraBoardUrl, setJiraBoardUrl] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [boardUrlError, setBoardUrlError] = useState<string | null>(null);

  const [isFetching, setIsFetching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [existingCredentials, setExistingCredentials] =
    useState<JiraCredential | null>(null);

  // Fetch existing Jira credentials when dialog opens
  useEffect(() => {
    if (open && productSwitcher.product_id) {
      fetchJiraCredentials();
    }
  }, [open, productSwitcher.product_id]);

  const fetchJiraCredentials = async () => {
    try {
      setIsFetching(true);
      const response = await fetch(
        `/api/get-jira-credentials-for-product?product_id=${productSwitcher.product_id}`,
      );

      if (response.ok) {
        const data = await response.json();
        if (data.credentials && data.credentials.length > 0) {
          setExistingCredentials(data.credentials[0]);
        } else {
          setExistingCredentials(null);
        }
      } else {
        toast.error("Failed to retrieve Jira integration status");
      }
    } catch (error) {
      toast.error("Error checking Jira integration status");
    } finally {
      setIsFetching(false);
    }
  };

  // Handle email input change with validation
  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setEmail(value);

    // Clear error when field is empty
    if (!value.trim()) return setEmailError(null);
    // Validate email using our helper
    if (!ValidationHelpers.isValidEmail(value))
      setEmailError("Please enter a valid email address");
    else setEmailError(null);
  };

  // Function to handle Jira board URL input and extraction
  const handleJiraBoardUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setJiraBoardUrl(value);

    // Clear error when field is empty
    if (!value.trim()) {
      setBoardUrlError(null);
      setJiraBaseUrl("");
      setJiraProjectKey("");
      return;
    }

    try {
      const url = new URL(value);
      const baseUrl = url.origin;

      const projectKeyMatch = url.pathname.match(/\/projects\/([^\/]+)/i);
      if (!projectKeyMatch) {
        setBoardUrlError(
          "Could not extract project key. URL must contain '/projects/KEY/'.",
        );
        setJiraBaseUrl("");
        setJiraProjectKey("");
        return;
      }

      const projectKey = projectKeyMatch[1];

      setJiraBaseUrl(baseUrl);
      setJiraProjectKey(projectKey);
      setBoardUrlError(null);
    } catch (error) {
      setBoardUrlError("Please enter a valid Jira board URL.");
      setJiraBaseUrl("");
      setJiraProjectKey("");
    }
  };

  const handleSave = async () => {
    if (!ValidationHelpers.isValidEmail(email)) {
      setEmailError("Please enter a valid email address");
      return;
    }

    if (!jiraBaseUrl) {
      setBoardUrlError("Please enter a valid Jira board URL");
      return;
    }

    try {
      setIsSaving(true);
      const response = await fetch("/api/add-jira-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          api_token: apiToken,
          product_id: productSwitcher.product_id,
          jira_project_key: jiraProjectKey,
          jira_base_url: jiraBaseUrl,
        }),
      });

      if (response.ok) {
        toast.success("Jira credentials saved successfully");
        setEmail("");
        setApiToken("");
        setJiraProjectKey("");
        setJiraBaseUrl("");
        setJiraBoardUrl("");
        // Refresh credentials after saving
        await fetchJiraCredentials();
      } else {
        const err = await response.json();
        toast.error(err.error || "Failed to save Jira credentials");
      }
    } catch (error) {
      toast.error("An error occurred while saving credentials");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!existingCredentials) return;

    try {
      setIsDeleting(true);
      const response = await fetch("/api/delete-jira-credentials", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: existingCredentials.id }),
      });

      if (response.ok) {
        toast.success("Jira integration removed successfully");
        setExistingCredentials(null);
      } else {
        const err = await response.json();
        toast.error(err.error || "Failed to remove Jira integration");
      }
    } catch (error) {
      toast.error("An error occurred while removing Jira integration");
    } finally {
      setIsDeleting(false);
    }
  };

  // Check if form is valid
  const isFormValid =
    email.trim() !== "" &&
    apiToken.trim() !== "" &&
    jiraProjectKey.trim() !== "" &&
    jiraBaseUrl.trim() !== "" &&
    !emailError &&
    !boardUrlError &&
    ValidationHelpers.isValidEmail(email) &&
    ValidationHelpers.isValidWebUrl(jiraBaseUrl);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 gap-0">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="text-xl">Integrate QAI with Jira</DialogTitle>
        </DialogHeader>

        {isFetching ? (
          <div className="px-6 py-12 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-600"></div>
          </div>
        ) : existingCredentials ? (
          <div className="px-6 py-4">
            <p className="text-sm text-gray-500 mb-2">
              Current Jira integration:
            </p>
            <div className="p-4 border rounded-md">
              <p className="font-medium">{existingCredentials.email}</p>
              <div className="mt-2 pt-2 border-t">
                <p className="text-sm">
                  <span className="font-medium">Project Key:</span>{" "}
                  {existingCredentials.jira_project_key}
                </p>
                <p className="text-sm mt-1">
                  <span className="font-medium">Jira URL:</span>{" "}
                  {existingCredentials.jira_base_url}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="px-6 py-4">
            <p className="text-sm text-gray-500 mb-6">
              Configure your Jira integration with QAI:
            </p>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Email:</Label>
                <Input
                  value={email}
                  onChange={handleEmailChange}
                  placeholder="Enter your Jira email"
                />
                {emailError && (
                  <p className="text-sm text-red-500">{emailError}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>API Token:</Label>
                <Input
                  type="password"
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  placeholder="Enter your Jira API token"
                />
              </div>

              <div className="space-y-2">
                <Label>Jira Board URL:</Label>
                <Input
                  value={jiraBoardUrl}
                  onChange={handleJiraBoardUrlChange}
                  placeholder="e.g. https://company.atlassian.net/jira/software/projects/KEY/boards/1"
                />
                {boardUrlError && (
                  <p className="text-sm text-red-500">{boardUrlError}</p>
                )}
                {jiraBaseUrl && jiraProjectKey && !boardUrlError && (
                  <p className="text-xs text-green-600 mt-1">
                    ✓ Successfully extracted Base URL and Project Key
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end space-x-2 p-4">
          <Button
            variant="outline"
            className="border-purple-600 text-purple-600 hover:bg-purple-50"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>

          {existingCredentials ? (
            <Button
              variant="destructive"
              className="bg-red-500 hover:bg-red-600 text-white"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "Removing..." : "Delete Credentials"}
            </Button>
          ) : (
            <Button
              className="bg-purple-600 hover:bg-purple-700 text-white"
              disabled={!isFormValid || isSaving}
              onClick={handleSave}
            >
              {isSaving ? "Saving..." : "Save"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
