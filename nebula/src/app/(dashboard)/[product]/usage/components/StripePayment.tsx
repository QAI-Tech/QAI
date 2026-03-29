"use client";

import { Button } from "@/components/ui/button";

export default function StripePayment({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  clientSecret,
  onCancel,
  onSuccess,
}: {
  clientSecret: string;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="text-muted-foreground p-4 text-center border rounded-md">
        Stripe integration has been bypassed. Payments are disabled in this environment.
      </div>
      <div className="flex justify-end gap-3 mt-6">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={onSuccess}
        >
          Mock Success
        </Button>
      </div>
    </div>
  );
}
