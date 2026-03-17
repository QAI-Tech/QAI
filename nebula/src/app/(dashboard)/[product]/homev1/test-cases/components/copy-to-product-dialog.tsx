"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useProductSwitcher } from "@/providers/product-provider";
import { Combobox } from "@/components/ui/combobox-pop-search";
import type { testCaseSchema } from "@/lib/types";
import { useSelector } from "react-redux";
import type { RootState } from "@/app/store/store";
import { useRouter } from "next/navigation";
import { Checkbox } from "@/components/ui/checkbox";
import * as Sentry from "@sentry/nextjs";

interface CopyToProductDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  selectedTestCases: testCaseSchema[];
  exitSelectionMode: () => void; // Added this to exit from the selection mode after the task is completed.
}

interface ProductOption {
  value: string;
  label: string;
}

export function CopyToProductDialog({
  isOpen,
  onOpenChange,
  selectedTestCases,
  exitSelectionMode,
}: CopyToProductDialogProps) {
  const { productSwitcher } = useProductSwitcher();
  const products = useSelector((state: RootState) => state.products.products);
  const isLoadingProducts = useSelector(
    (state: RootState) => state.products.loading,
  );
  const [isCopying, setIsCopying] = useState(false);
  const [targetProductId, setTargetProductId] = useState<string>("");
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  const [shouldEstablishTestCaseLinks, setShouldEstablishTestCaseLinks] =
    useState(false);
  const router = useRouter();

  // Resets target product when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setTargetProductId("");
    }
  }, [isOpen]);

  // Process products from Redux when dialog opens or products change
  useEffect(() => {
    if (isOpen && products) {
      const options: ProductOption[] = products.map((product) => ({
        value: product.product_id,
        label: product.product_name,
      }));

      setProductOptions(options);
    }
  }, [isOpen, products, productSwitcher.product_id]);

  const handleCopyTestCases = async () => {
    if (!targetProductId) {
      toast.error("Please select a target product");
      return;
    }

    setIsCopying(true);
    try {
      const requestBody = {
        from_product_id: productSwitcher.product_id,
        to_product_id: targetProductId,
        test_case_ids: selectedTestCases.map((tc) => String(tc.test_case_id)),
        should_establish_test_case_links: shouldEstablishTestCaseLinks,
      };

      console.log("Sending copy request with body:", requestBody);

      const response = await fetch("/api/copy-test-cases-for-product", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Backend error:", errorText);
        throw new Error(`Failed to copy test cases: ${errorText}`);
      }

      // Finds the target product name for the toast message
      const targetProduct = products?.find(
        (p) => p.product_id === targetProductId,
      );
      const productName = targetProduct?.product_name || "selected product";

      console.log("Target Product ID:", targetProductId);
      console.log("Found Target Product:", targetProduct);
      console.log("Product Name:", productName);

      toast.success(
        `${selectedTestCases.length} test cases copied successfully to '${productName}'`,
      );

      onOpenChange(false);
      exitSelectionMode(); // Exit selection mode after successful copy

      // Redirect to the target product's test-cases page
      if (productSwitcher.product_id !== targetProductId) {
        console.log("Redirecting to:", `/${targetProductId}/test-cases`);
        router.push(`/${targetProductId}/test-cases`);
      }
    } catch (error) {
      console.error("Error copying test cases:", error);
      Sentry.captureException(error, {
        level: "fatal",
        tags: { priority: "high" },
      });
      toast.error(
        error instanceof Error ? error.message : "Failed to copy test cases",
      );
    } finally {
      setIsCopying(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Copy Test Cases to Another Product</DialogTitle>
          <DialogDescription>
            Select a target product to copy the selected test cases to.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="product">Target Product</Label>
            {isLoadingProducts ? (
              <div className="flex items-center justify-center p-4">
                <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
                <span className="ml-2 text-sm text-gray-500">
                  Loading products...
                </span>
              </div>
            ) : (
              <Combobox
                options={productOptions}
                value={targetProductId}
                onChange={setTargetProductId}
                placeholder="Search products..."
                emptyMessage="No products found."
                buttonLabel="Select target product..."
                disabled={isCopying}
                className="bg-gray-50 font-semibold text-gray-700 w-full truncate"
                popoverClassName="w-52 p-0"
              />
            )}
          </div>

          <div className="space-y-2">
            <Label>Selected Test Cases</Label>
            <div className="p-3 border rounded-md bg-gray-50">
              <p className="text-sm text-gray-600">
                {selectedTestCases.length} test case
                {selectedTestCases.length !== 1 ? "s" : ""} selected
              </p>
              {selectedTestCases.length > 0 && (
                <div className="mt-2 max-h-20 overflow-y-auto">
                  <p className="text-xs text-gray-500">
                    Test cases:{" "}
                    {selectedTestCases.map((tc) => tc.test_case_id).join(", ")}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            checked={shouldEstablishTestCaseLinks}
            className="h-4 w-4 rounded border border-gray-300 focus:outline-none data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
            onCheckedChange={(check) =>
              setShouldEstablishTestCaseLinks(!!check)
            }
          />
          <span className="text-sm text-gray-600">Link Test Cases</span>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isCopying}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCopyTestCases}
            className="bg-purple-600 hover:bg-purple-700 text-white"
            disabled={
              !targetProductId || isCopying || selectedTestCases.length === 0
            }
          >
            {isCopying ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Copying...
              </>
            ) : (
              "Copy Test Cases"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
