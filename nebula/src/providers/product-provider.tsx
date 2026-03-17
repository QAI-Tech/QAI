"use client";

import { ProductSwitcherContext } from "@/app/context/product-context";
import { ProductSwitcherSchema } from "@/lib/types";
import { useContext, useState } from "react";

export default function ProductProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [productSwitcher, setProductSwitcher] = useState<ProductSwitcherSchema>(
    {} as ProductSwitcherSchema,
  );

  return (
    <ProductSwitcherContext.Provider
      value={{ productSwitcher, setProductSwitcher }}
    >
      {children}
    </ProductSwitcherContext.Provider>
  );
}

export const useProductSwitcher = () => {
  const context = useContext(ProductSwitcherContext);
  if (!context) {
    throw new Error("useProductSwitcher must be used within a ProductProvider");
  }
  return context;
};
