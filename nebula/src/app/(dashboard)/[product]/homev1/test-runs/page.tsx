"use client";
import { useProductSwitcher } from "@/providers/product-provider";
import { FilterBar } from "./_components/filter-bar";
import { TimeSectionComponent } from "./_components/time-section";
import { useSelector } from "react-redux";
import { RootState } from "@/app/store/store";
import Loading from "@/components/global/loading";

export default function TestRuns() {
  const { productSwitcher } = useProductSwitcher();

  const { testRuns, loading } = useSelector(
    (state: RootState) => state.testRuns,
  );
  if (!productSwitcher.product_id) {
    return (
      <div className="flex justify-center items-center h-screen">
        Please select product id
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loading />
      </div>
    );
  }

  return (
    <div className="p-8 mt-5">
      {/* <h1 className="mb-6 text-2xl font-bold">Test Runs</h1> */}
      <FilterBar />
      {testRuns.length === 0 ? (
        <div className="flex justify-center items-center h-72 text-gray-500">
          Add the Test Run
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {testRuns.map((section, index) => (
            <TimeSectionComponent key={index} section={section} />
          ))}
        </div>
      )}
    </div>
  );
}
