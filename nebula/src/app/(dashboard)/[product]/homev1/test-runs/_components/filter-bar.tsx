// import { Button } from "@/components/ui/button"; // TO BE AGAIN UN COMMENTED WHEN THE FEATURE IS USED
// import { ChevronDown, Filter } from "lucide-react";  // TO BE AGAIN UN COMMENTED WHEN THE FEATURE IS USED
import { Button } from "@/components/ui/button";
import { useProductSwitcher } from "@/providers/product-provider";
import Link from "next/link";

export function FilterBar() {
  const { productSwitcher } = useProductSwitcher();
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-4">
        <h1 className="mb-6 text-2xl font-bold">Test Runs</h1>
        {/* TO BE AGAIN UN COMMENTED WHEN THE FEATURE IS USED  */}
        {/* <Button
          variant="outline"
          size="sm"
          className="flex items-center space-x-2"
        >
          <Filter className="h-4 w-4 text-black" />
          <span>Filters</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex items-center space-x-2"
        >
          <span>Sort by</span>
          <ChevronDown className="h-4 w-4" />
        </Button> */}
      </div>
      <Link
        href={`/${productSwitcher.product_id}/test-cases?selectionMode=true`}
      >
        <Button className="bg-purple-600 hover:bg-purple-700">
          Start a New Test Run
        </Button>
      </Link>
    </div>
  );
}
