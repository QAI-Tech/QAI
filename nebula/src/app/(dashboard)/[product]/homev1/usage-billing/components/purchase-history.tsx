"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";

const purchases = [
  {
    date: "16th Apr 2025",
    description: "9000 Qubits (Auto-reload)",
    amount: "€ 300",
  },
  {
    date: "1st Apr 2025",
    description: "4500 Qubits (Auto-reload)",
    amount: "€ 150",
  },
  {
    date: "22nd Mar 2025",
    description: "6000 Qubits (Auto-reload)",
    amount: "€ 200",
  },
];

export default function PurchaseHistory() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Purchase History</h2>

      <Card className="rounded-xl bg-white">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-gray-600">Date</TableHead>
              <TableHead className="text-gray-600">Description</TableHead>
              <TableHead className="text-gray-600">Amount</TableHead>
              <TableHead className="text-gray-600">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {purchases.map((purchase, index) => (
              <TableRow key={index} className="hover:bg-gray-50">
                <TableCell className="py-4">{purchase.date}</TableCell>
                <TableCell className="py-4">{purchase.description}</TableCell>
                <TableCell className="py-4">{purchase.amount}</TableCell>
                <TableCell className="py-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
                  >
                    Download <ChevronDown className="ml-1 h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
