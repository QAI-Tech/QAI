"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { UserRole } from "@/lib/types";
import { Input } from "@/components/ui/input";
import * as Sentry from "@sentry/nextjs";

interface InviteMemberDialogProps {
  currentUserRole: UserRole;
}

interface EmailRolePair {
  email: string;
  role: UserRole;
}

interface EmailRolePairWithValidation extends EmailRolePair {
  error?: string;
  touched?: boolean;
}

const validateEmail = (email: string): string | undefined => {
  if (!email.trim()) {
    return "Email is required";
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return "Please enter a valid email address";
  }
  return undefined;
};

export function InviteMemberDialog({
  currentUserRole,
}: InviteMemberDialogProps) {
  const [emailRolePairs, setEmailRolePairs] = useState<
    EmailRolePairWithValidation[]
  >([{ email: "", role: UserRole.TESTER }]);
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showValidation, setShowValidation] = useState(false);

  const resetForm = () => {
    setEmailRolePairs([{ email: "", role: UserRole.TESTER }]);
    setShowValidation(false);
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      resetForm();
    }
  };

  const addEmailRolePair = () => {
    if (emailRolePairs.length >= 50) {
      toast.error("You can only invite up to 50 members at once");
      return;
    }
    setEmailRolePairs([
      ...emailRolePairs,
      { email: "", role: UserRole.TESTER },
    ]);
  };

  const removeEmailRolePair = (index: number) => {
    setEmailRolePairs(emailRolePairs.filter((_, i) => i !== index));
  };

  const updateEmail = (index: number, email: string) => {
    const newPairs = [...emailRolePairs];
    const error = validateEmail(email);
    newPairs[index] = { ...newPairs[index], email, error };
    setEmailRolePairs(newPairs);
  };

  const updateRole = (index: number, role: UserRole) => {
    const newPairs = [...emailRolePairs];
    newPairs[index] = { ...newPairs[index], role };
    setEmailRolePairs(newPairs);
  };

  const handleSendInvites = async () => {
    setShowValidation(true);

    const validatedPairs = emailRolePairs.map((pair) => ({
      ...pair,
      error: validateEmail(pair.email),
    }));
    setEmailRolePairs(validatedPairs);

    if (validatedPairs.some((pair) => pair.error)) {
      toast.error("Please fix the email validation errors");
      return;
    }

    const validPairs = validatedPairs.filter((pair) => pair.email.trim());

    if (validPairs.length === 0) {
      toast.error("Please enter at least one email address");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/send-email-invites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          invites: validPairs.map(({ email, role }) => ({
            email: email.trim(),
            role,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to send invites");
      }

      const result = await response.json();
      console.log("result", result);
      toast.success("Invites sent successfully!");
      setEmailRolePairs([{ email: "", role: UserRole.TESTER }]);
      setShowValidation(false);
      setOpen(false);
    } catch (error) {
      console.error("Error sending invites:", error);
      Sentry.captureException(error, {
        level: "fatal",
        tags: { priority: "high" },
      });
      toast.error("Failed to send invites. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const isAdmin =
    currentUserRole === UserRole.OWNER || currentUserRole === UserRole.ADMIN;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="default"
          className="bg-purple-600 hover:bg-purple-700"
          title="Invite New Members"
          disabled={!isAdmin}
        >
          + Invite
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[625px]">
        <DialogHeader>
          <DialogTitle className="text-2xl">Invite New Members</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-4">
            <div className="flex items-center justify-end">
              <Button
                onClick={addEmailRolePair}
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
                disabled={emailRolePairs.length >= 50}
              >
                <Plus className="h-4 w-4" /> Add Email
              </Button>
            </div>

            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
              {emailRolePairs.map((pair, index) => (
                <div key={index} className="space-y-1">
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <Input
                        type="email"
                        placeholder="Enter email address"
                        value={pair.email}
                        onChange={(e) => updateEmail(index, e.target.value)}
                        className={`focus:outline-none focus:ring-0 focus:ring-offset-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 ${showValidation && pair.error ? "border-red-500" : ""}`}
                      />
                      {showValidation && pair.error && (
                        <p className="text-sm text-red-500 mt-1">
                          {pair.error}
                        </p>
                      )}
                    </div>
                    <Select
                      value={pair.role}
                      onValueChange={(value: UserRole) =>
                        updateRole(index, value)
                      }
                      disabled={!isAdmin}
                    >
                      <SelectTrigger className="w-[140px] focus:outline-none focus:ring-0">
                        <SelectValue>{pair.role}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {(currentUserRole === UserRole.OWNER ||
                          currentUserRole === UserRole.ADMIN) && (
                          <SelectItem value={UserRole.ADMIN}>
                            {UserRole.ADMIN}
                          </SelectItem>
                        )}
                        <SelectItem value={UserRole.BILLING}>
                          {UserRole.BILLING}
                        </SelectItem>
                        <SelectItem value={UserRole.TESTER}>
                          {UserRole.TESTER}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {emailRolePairs.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeEmailRolePair(index)}
                        className="h-8 w-8"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isLoading}
          >
            Close
          </Button>

          <Button
            onClick={handleSendInvites}
            className="bg-purple-600 hover:bg-purple-700"
            disabled={
              isLoading || !emailRolePairs.some((pair) => pair.email.trim())
            }
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              "Send Invites"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
