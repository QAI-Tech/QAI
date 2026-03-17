import QubitBalance from "./components/qubit-balance";
import UsageHistory from "./components/usage-history";
import PurchaseHistory from "./components/purchase-history";
import { Suspense } from "react";

export default function UsageBillingPage() {
  return (
    <div className="ml-8 mr-8 mt-10 mb-10">
      <div className="max-w-[1200px] space-y-6">
        <div>
          <h1 className="hidden text-3xl font-bold mb-2">Usage & Billing</h1>
          <p className="hidden text-muted-foreground">
            Manage Qubits, payments, and invoices.
          </p>
        </div>

        <div className="space-y-10">
          <div className="hidden">
            <QubitBalance />
          </div>
          <Suspense fallback={<div>Loading usage history...</div>}>
            <UsageHistory />
          </Suspense>
          <div className="hidden">
            <PurchaseHistory />
          </div>
        </div>
      </div>
    </div>
  );
}
