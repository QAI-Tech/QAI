import { ProductSwitcherSchema } from "@/lib/types";
import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";
import { toast } from "sonner";

interface ProductsState {
  products: ProductSwitcherSchema[];
  loading: boolean;
  error: string | null;
}

const initialState: ProductsState = {
  products: [],
  loading: true, // Set initial loading state to true
  error: null,
};

export const fetchProducts = createAsyncThunk(
  "products/fetchProducts",
  async (organisation_id: string) => {
    console.log("org is: " + organisation_id);
    try {
      const response = await fetch("/api/get-products", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        // hard coded now because frontend do no have organisation id
        body: JSON.stringify({ organisationId: organisation_id }),
      });

      if (!response.ok) {
        throw new Error("Failed to fetch queued requests");
      }

      if (response.status === 401) {
        toast.error(
          "Session token expired, logging out the user to regenerate token",
        );
      }

      const result = await response.json();
      console.log("PRODUCT LIST :", result);
      return result;
    } catch (error) {
      console.error("Error while gettting products:", error);
      throw error;
    }
  },
);

// Create the slice
const productsSlice = createSlice({
  name: "products",
  initialState,
  reducers: {
    setProducts: (state, action: PayloadAction<ProductSwitcherSchema[]>) => {
      state.products = action.payload;
      state.loading = false;
    },
    addProduct: (state, action: PayloadAction<ProductSwitcherSchema>) => {
      console.log("Adding product to redux: " + action.payload);
      state.products = state.products
        ? [...state.products, action.payload]
        : [action.payload];
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    updateProduct: (
      state,
      action: PayloadAction<{ id: string; name: string }>,
    ) => {
      if (Array.isArray(state.products)) {
        state.products = state.products.map((product) =>
          product.product_id === action.payload.id
            ? { ...product, product_name: action.payload.name }
            : product,
        );
      }
    },
    deleteProduct: (state, action: PayloadAction<string>) => {
      if (Array.isArray(state.products)) {
        state.products = state.products.filter(
          (product) => product.product_id !== action.payload,
        );
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchProducts.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchProducts.fulfilled, (state, action) => {
        state.loading = false;
        state.products = action.payload;
      })
      .addCase(fetchProducts.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || "Failed to fetch products";
      });
  },
});

// Export actions and reducer
export const {
  setProducts,
  addProduct,
  setLoading,
  updateProduct,
  deleteProduct,
} = productsSlice.actions;
export default productsSlice.reducer;
