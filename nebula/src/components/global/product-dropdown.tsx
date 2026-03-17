"use client";
import * as React from "react";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "@/app/store/store";
import { useEffect, useMemo } from "react";
import { useProductSwitcher } from "@/providers/product-provider";
import { fetchTestCases } from "@/app/store/testCaseSlice";
import { fetchFeatures } from "@/app/store/featuresSlice";
import { fetchTestSuites } from "@/app/store/testSuiteSlice";
import { fetchTestRunsForProduct } from "@/app/store/testRunSlice";
import { Combobox } from "@/components/ui/combobox-pop-search";
import { useRouter } from "next/navigation";
import * as Sentry from "@sentry/nextjs";

const ProductDropDown = () => {
  const { productSwitcher, setProductSwitcher } = useProductSwitcher();
  const productData = useSelector(
    (state: RootState) => state.products.products,
  );
  // Get selected organization ID from Redux
  const selectedOrgId = useSelector(
    (state: RootState) => state.organizations.selectedOrgId,
  );
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();

  // Filter products based on selected organization
  const filteredProducts = useMemo(() => {
    if (!productData) return [];

    if (selectedOrgId === "all") {
      return productData;
    }

    return productData.filter(
      (product) => product.organisation_id === selectedOrgId,
    );
  }, [productData, selectedOrgId]);

  const productOptions = filteredProducts
    ? filteredProducts.map((product) => ({
        value: product.product_id,
        label: product.product_name,
      }))
    : [];

  const handleSelectChange = (value: string) => {
    try {
      if (productData) {
        const selected = productData.find(
          (product) => product.product_id === value,
        );
        if (selected && selected.product_id != productSwitcher.product_id) {
          localStorage.setItem("product_id", selected.product_id);
          console.log("Selected product:", selected);
          setProductSwitcher(selected);
          router.push(`/${selected.product_id}/homev1`);
        }
      }
    } catch (error) {
      console.error("Error changing product:", error);
      Sentry.captureException(error, {
        level: "error",
        tags: { action: "product_change" },
      });
    }
  };

  useEffect(() => {
    try {
      dispatch(fetchTestRunsForProduct(productSwitcher.product_id));
      dispatch(fetchTestSuites(productSwitcher.product_id));
      dispatch(fetchFeatures(productSwitcher.product_id))
        .then(() => {
          dispatch(fetchTestCases(productSwitcher.product_id));
        })
        .catch((error) => {
          console.error("Error fetching data:", error);
          Sentry.captureException(error, {
            level: "error",
            tags: { action: "fetch_product_data" },
          });
        });
      console.log("productSwitcher updated to:", productSwitcher);
    } catch (error) {
      console.error("Error in product effect:", error);
      Sentry.captureException(error, {
        level: "error",
        tags: { action: "product_effect" },
      });
    }
  }, [productSwitcher, dispatch]);

  return (
    <div className="w-full max-w-xs mx-auto">
      <p className="text-sm text-gray-500 font-semibold p-1">
        Select a product
      </p>
      <Combobox
        options={productOptions}
        value={productSwitcher.product_id || ""}
        onChange={handleSelectChange}
        placeholder="Search product..."
        emptyMessage="No Product Found"
        buttonLabel="Select a product..."
        className="bg-gray-50 font-semibold text-gray-700 w-44 truncate"
        popoverClassName="w-52 p-0"
      />
    </div>
  );
};

export default ProductDropDown;
