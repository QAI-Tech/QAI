"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CreditCard, Pencil } from "lucide-react";

export default function QubitBalance() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Qubit Balance</h2>
      <p className="text-sm text-muted-foreground max-w-[800px]">
        You consume a Qubit for each test case executed and reported. You can
        buy Qubits directly, or set-up an automatic top up when your Qubit
        balance goes below your threshold.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6 flex flex-col items-center justify-center rounded-xl bg-white">
          <div className="text-5xl font-bold">3100</div>
          <div className="text-sm text-muted-foreground mt-2">
            Qubits remaining
          </div>
        </Card>

        <Card className="p-6 rounded-xl bg-white">
          <div className="text-sm text-muted-foreground">Charged to:</div>
          <div className="flex items-center gap-3 my-3 bg-gray-50 p-3 rounded-2xl">
            <CreditCard className="h-4 w-4" />
            <span className="text-gray-900">Mastercard **** 1234</span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto p-0 h-auto hover:bg-transparent"
            >
              <Pencil className="h-5 w-5 text-gray-500 hover:text-gray-700" />
            </Button>
          </div>
          <Button className="bg-purple-600 hover:bg-purple-700 text-white w-full rounded-lg mt-auto">
            + Buy Qubits
          </Button>
        </Card>

        <Card className="p-6 rounded-xl bg-white flex flex-col">
          <div className="text-sm text-muted-foreground flex-grow">
            Avoid disruption of service due to insufficient Qubit balance with
            auto-reload.
          </div>
          <Button
            variant="outline"
            className="w-full border-purple-600 text-purple-600 hover:bg-purple-50 rounded-lg mt-4"
          >
            Enable Auto-reload
          </Button>
        </Card>
      </div>
    </div>
  );
}
