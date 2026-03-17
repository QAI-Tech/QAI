"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import StripePayment from "./StripePayment";
import * as Sentry from "@sentry/nextjs";
import { PRICE_PER_QUBIT_CENTS } from "@/lib/constants";

interface BuyQubitsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organisationId: string;
  onSuccess: () => void;
}

export default function BuyQubitsDialog({
  open,
  onOpenChange,
  organisationId,
  onSuccess,
}: BuyQubitsDialogProps) {
  const [qubitAmount, setQubitAmount] = useState<number>(100);
  const [isCreatingIntent, setIsCreatingIntent] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [amountCents, setAmountCents] = useState<number>(0);
  const [showPaymentForm, setShowPaymentForm] = useState(false);

  const resetDialog = () => {
    setQubitAmount(100);
    setClientSecret(null);
    setAmountCents(0);
    setShowPaymentForm(false);
  };

  const handleClose = () => {
    resetDialog();
    onOpenChange(false);
  };

  const handleQubitAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    if (!isNaN(value) && value > 0) {
      setQubitAmount(value);
    } else {
      setQubitAmount(0);
    }
  };

  const createPaymentIntent = async () => {
    if (qubitAmount <= 0) {
      toast.error("Please enter a valid qubit amount");
      return;
    }

    try {
      setIsCreatingIntent(true);

      const response = await fetch("/api/buy-qubits", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organisation_id: organisationId,
          qubit_amount: qubitAmount,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create payment intent");
      }

      const data = await response.json();
      setClientSecret(data.client_secret);
      setAmountCents(data.amount_cents || qubitAmount * PRICE_PER_QUBIT_CENTS);
      setShowPaymentForm(true);
    } catch (error) {
      console.error("Error creating payment intent:", error);
      Sentry.captureException(error, {
        level: "fatal",
        tags: { priority: "high" },
      });
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to create payment intent",
      );
    } finally {
      setIsCreatingIntent(false);
    }
  };

  const handlePaymentSuccess = () => {
    onSuccess();
    handleClose();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Buy Qubits</DialogTitle>
          <DialogDescription>
            Purchase qubits to execute and report test cases.
          </DialogDescription>
        </DialogHeader>

        {!showPaymentForm ? (
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <label htmlFor="qubitAmount" className="text-sm font-medium">
                Number of Qubits
              </label>
              <Input
                id="qubitAmount"
                type="number"
                min="1"
                value={qubitAmount}
                onChange={handleQubitAmountChange}
              />
              <p className="text-sm text-muted-foreground">
                Cost: €
                {((qubitAmount * PRICE_PER_QUBIT_CENTS) / 100).toFixed(2)}{" "}
                (€0.05 per qubit)
              </p>
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={createPaymentIntent}
                disabled={isCreatingIntent || qubitAmount <= 0}
              >
                {isCreatingIntent ? "Processing..." : "Continue to Payment"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="py-4">
            <div className="mb-6">
              <div className="flex justify-between items-center text-sm mb-1">
                <span>Qubits:</span>
                <span className="font-medium">{qubitAmount}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span>Total:</span>
                <span className="font-medium">
                  €{(amountCents / 100).toFixed(2)}
                </span>
              </div>
            </div>

            {clientSecret && (
              <StripePayment
                clientSecret={clientSecret}
                onCancel={() => setShowPaymentForm(false)}
                onSuccess={handlePaymentSuccess}
              />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
