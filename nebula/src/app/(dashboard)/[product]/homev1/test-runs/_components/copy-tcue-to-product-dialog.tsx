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
import type { CopyTCUEToProductDialogProps, ProductOption } from "@/lib/types";
import { useSelector } from "react-redux";
import type { RootState } from "@/app/store/store";
import { useMemo } from "react";
import * as Sentry from "@sentry/nextjs";

export function CopyTCUEToProductDialog({
  isOpen,
  onOpenChange,
  selectedTestCases,
}: CopyTCUEToProductDialogProps) {
  const { productSwitcher } = useProductSwitcher();
  const products = useSelector((state: RootState) => state.products.products);
  const isLoadingProducts = useSelector(
    (state: RootState) => state.products.loading,
  );
  const allTcues = useSelector(
    (state: RootState) => state.testRunsUnderExecution.testRunUnderExecution,
  );

  const allRelatedTcues = useMemo(() => {
    const selectedTestCaseIds = selectedTestCases.map((tc) => tc.test_case_id);
    return allTcues.filter((tcue) =>
      selectedTestCaseIds.includes(tcue.test_case_id),
    );
  }, [selectedTestCases, allTcues]);

  const [isCopying, setIsCopying] = useState(false);
  const [targetProductId, setTargetProductId] = useState<string>("");
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);

  // Reset target product when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setTargetProductId("");
    }
  }, [isOpen]);

  // Process products from Redux when dialog opens or products change
  useEffect(() => {
    if (isOpen && products) {
      // Filters out the current product
      const filteredProducts = products.filter(
        (product) => product.product_id !== productSwitcher.product_id,
      );

      const options: ProductOption[] = filteredProducts.map((product) => ({
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
        tcue_ids: allRelatedTcues.map((tc) => tc.id),
      };

      console.log("Sending copy TCUE request with body:", requestBody);

      const response = await fetch(
        "/api/copy-test-case-under-execution-for-product",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Backend error:", errorText);
        throw new Error(
          `Failed to copy test cases under execution: ${errorText}`,
        );
      }

      // Find the target product name for the toast message
      const targetProduct = products?.find(
        (p) => p.product_id === targetProductId,
      );
      const productName = targetProduct?.product_name || "selected product";

      const successMessage = `${allRelatedTcues.length} test cases under execution copied successfully to '${productName}'`;

      toast.success(successMessage);
      onOpenChange(false);
    } catch (error) {
      console.error("Error copying test cases under execution:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to copy test cases under execution",
      );
      Sentry.captureException(error, {
        level: "error",
        tags: { priority: "high" },
      });
    } finally {
      setIsCopying(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Copy TCUE to Product</DialogTitle>
          <DialogDescription>
            Select a target product to copy the selected test cases under
            execution to.
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
                onChange={(value) => {
                  setTargetProductId(value);
                }}
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
            <Label>Selected Test Cases Under Execution</Label>
            <div className="p-3 border rounded-md bg-gray-50">
              <p className="text-sm text-gray-600">
                {selectedTestCases.length} test case
                {selectedTestCases.length !== 1 ? "s" : ""} under execution
                selected ({allRelatedTcues.length} total including scenarios)
              </p>
              {selectedTestCases.length > 0 && (
                <div className="mt-2 max-h-20 overflow-y-auto">
                  <p className="text-xs text-gray-500">
                    TCUE IDs (including scenarios):{" "}
                    {allRelatedTcues.map((tc) => tc.id).join(", ")}
                  </p>
                </div>
              )}
            </div>
          </div>
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
              "Copy TCUE"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
