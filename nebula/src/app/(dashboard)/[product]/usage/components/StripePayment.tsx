"use client";

import { useState, useMemo, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getStripePublishableKey } from "@/app/actions/stripe-actions";

const PaymentForm = ({
  onCancel,
  onSuccess,
}: {
  onCancel: () => void;
  onSuccess: () => void;
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(undefined);

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/usage`,
      },
      redirect: "if_required",
    });

    if (error) {
      setErrorMessage(error.message);
      toast.error("Payment failed: " + error.message);
    } else if (paymentIntent && paymentIntent.status === "succeeded") {
      toast.success(
        "Payment successful! Qubits have been added to your account.",
      );
      onSuccess();
    } else {
      toast.success("Payment processing. Your qubits will be added shortly.");
      onSuccess();
    }

    setIsLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement />

      {errorMessage && (
        <div className="text-destructive text-sm">{errorMessage}</div>
      )}

      <div className="flex justify-end gap-3 mt-6">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isLoading}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading || !stripe || !elements}>
          {isLoading ? "Processing..." : "Pay Now"}
        </Button>
      </div>
    </form>
  );
};

export default function StripePayment({
  clientSecret,
  onCancel,
  onSuccess,
}: {
  clientSecret: string;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const [publishableKey, setPublishableKey] = useState<string | undefined>();
  const [isKeyLoading, setIsKeyLoading] = useState(true);

  useEffect(() => {
    async function fetchKey() {
      try {
        const key = await getStripePublishableKey();
        setPublishableKey(key);
      } catch (error) {
        console.error("Failed to fetch Stripe key:", error);
      } finally {
        setIsKeyLoading(false);
      }
    }
    fetchKey();
  }, []);

  const stripePromise = useMemo(() => {
    if (publishableKey) {
      return loadStripe(publishableKey);
    }
    return null;
  }, [publishableKey]);

  if (!clientSecret || isKeyLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-muted-foreground">Loading payment form...</div>
      </div>
    );
  }

  if (!stripePromise) {
    return (
      <div className="text-destructive p-4 text-center">
        Error: Stripe configuration is missing. Please contact support.
      </div>
    );
  }

  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <PaymentForm onCancel={onCancel} onSuccess={onSuccess} />
    </Elements>
  );
}
