"use client"; // Mark this as a Client Component
import { useEffect } from "react";
import { useDispatch } from "react-redux";
import { AppDispatch } from "../app/store/store";
import { fetchProducts } from "../app/store/productSlice";
import { fetchUsers } from "../app/store/userSlice";
import { useProductSwitcher } from "@/providers/product-provider";
import { ProductSwitcherSchema } from "@/lib/types";
import { useUser } from "@clerk/nextjs";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import * as Sentry from "@sentry/nextjs";

export default function useInitialDataFetch() {
  const dispatch = useDispatch<AppDispatch>();
  const { setProductSwitcher } = useProductSwitcher();
  const { user } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const isLocalMode = process.env.NEXT_PUBLIC_APP_ENV === "development";
  const isMockAuthUser = user?.id === "dummy-user-123";

  const organisationId = user?.publicMetadata?.organisation_id as
    | string
    | undefined;
  const isValidOrganisationId =
    typeof organisationId === "string" &&
    organisationId !== "preventGetProductCall" &&
    organisationId !== "";

  useEffect(() => {
    console.log("[useInitialDataFetch] bootstrap check", {
      userId: user?.id,
      organisationId,
      isValidOrganisationId,
      isLocalMode,
      isMockAuthUser,
      pathname,
    });

    if (!isValidOrganisationId) {
      console.log("[useInitialDataFetch] skipping fetch due to invalid organisation id");
      return;
    }

    const fetchInitialData = async () => {
      try {
        // Fetch users
        dispatch(fetchUsers(organisationId as string)).unwrap();

        // Fetch and set products
        const preExistingProductId = await localStorage.getItem("product_id");
        const productList = await dispatch(
          fetchProducts(organisationId as string),
        ).unwrap();

        console.log("[useInitialDataFetch] fetched products", {
          count: Array.isArray(productList) ? productList.length : -1,
          isLocalMode,
          isMockAuthUser,
          organisationId,
        });

        if (!productList || productList.length === 0) {
          if (!isLocalMode && !isMockAuthUser) {
            console.log("[useInitialDataFetch] redirecting to onboarding step 3");
            router.push("/onboarding?step=3");
          } else {
            console.log(
              "[useInitialDataFetch] empty products but skipping onboarding redirect due to local/mock mode",
            );
          }
          return;
        }

        const segments = pathname.split("/").filter(Boolean);
        const productIdFromUrl = segments.length > 0 ? segments[0] : undefined;

        const productFromUrl = productList.find(
          (product: ProductSwitcherSchema) =>
            !!productIdFromUrl && product.product_id === productIdFromUrl,
        );

        if (productFromUrl) {
          setProductSwitcher(productFromUrl);
          localStorage.setItem("product_id", productFromUrl.product_id);
          return;
        }

        const existingProduct = productList.find(
          (product: ProductSwitcherSchema) =>
            product.product_id === preExistingProductId,
        );

        if (existingProduct) {
          setProductSwitcher(existingProduct);
          return;
        }

        const latestProduct = productList.reduce(
          (latest: ProductSwitcherSchema, product: ProductSwitcherSchema) =>
            new Date(product.created_at) > new Date(latest.created_at)
              ? product
              : latest,
          productList[0],
        );

        setProductSwitcher(latestProduct);
        localStorage.setItem("product_id", latestProduct.product_id);
      } catch (error) {
        console.error("Error fetching initial data:", error);
        Sentry.captureException(error, {
          level: "fatal",
          tags: { priority: "high" },
        });
        toast.error("Failed to load initial data. Please refresh the page.");
      }
    };

    fetchInitialData();
  }, [
    dispatch,
    organisationId,
    router,
    setProductSwitcher,
    isValidOrganisationId,
    isLocalMode,
    isMockAuthUser,
  ]);
}
