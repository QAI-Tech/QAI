import { ProductSwitcherSchema } from "@/lib/types";
import { createContext } from "react";

type ProductSwitcherContextType = {
  productSwitcher: ProductSwitcherSchema;
  setProductSwitcher: React.Dispatch<
    React.SetStateAction<ProductSwitcherSchema>
  >;
};

export const ProductSwitcherContext = createContext<
  ProductSwitcherContextType | undefined
>(undefined);
