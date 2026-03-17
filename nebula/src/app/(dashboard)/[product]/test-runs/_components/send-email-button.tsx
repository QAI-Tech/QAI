"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { toast } from "sonner";
import { ConfirmationDialog } from "@/components/global/delete-confirmation-dialog";

interface SendEmailButtonProps {
  testRunId: string;
  showLabel?: boolean;
  onEmailClick?: () => void;
}

export function SendEmailButton({
  testRunId,
  showLabel = false,
}: SendEmailButtonProps) {
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [showEmailConfirmation, setShowEmailConfirmation] = useState(false);

  const handleSendEmailClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setShowEmailConfirmation(true);
  };

  const handleSendEmail = async () => {
    if (isSendingEmail || !testRunId) return;

    try {
      setIsSendingEmail(true);
      const response = await fetch("/api/send-test-run-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ test_run_id: testRunId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const errorMessage = errorData?.error || "Failed to send email";
        throw new Error(errorMessage);
      }

      toast.success("Test run email sent successfully");
      setShowEmailConfirmation(false);
    } catch (error) {
      console.error("Error sending test run email:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to send test run email",
      );
    } finally {
      setIsSendingEmail(false);
    }
  };

  return (
    <>
      <button
        onClick={handleSendEmailClick}
        disabled={isSendingEmail}
        className={
          showLabel
            ? "flex items-center gap-2 px-1.5 py-1.5 w-full rounded-md hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-foreground text-sm"
            : "relative group h-4 w-4 flex items-center justify-center rounded-md hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
        }
        title="Send Email"
      >
        <Mail className="h-4 w-4 text-foreground flex-shrink-0" />
        {showLabel && <span>Send Email</span>}
      </button>
      <ConfirmationDialog
        isOpen={showEmailConfirmation}
        onOpenChange={setShowEmailConfirmation}
        title="Send Test Run Email"
        description="Are you sure you want to send this test run email to all organization members assigned to this product?"
        confirmText="Send"
        onConfirm={handleSendEmail}
        isLoading={isSendingEmail}
        loadingText="Sending..."
      />
    </>
  );
}
