"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import { ChevronDown } from "lucide-react";
import { transitions } from "@/lib/animations";
import { useProductSwitcher } from "@/providers/product-provider";
import { Checkbox } from "@/components/ui/checkbox";
import BuyQubitsDialog from "./components/BuyQubitsDialog";
import type {
  MonthlyUsageData,
  UsageResponse,
  ProductUsageData,
} from "@/lib/types";

interface ChartDataPoint {
  date: string;
  [key: string]: number | string; // product_id: usage count
}

interface ProductInfo {
  id: string;
  name: string;
  color: string;
}

const productColors = [
  "hsl(var(--primary) / 0.7)",
  "hsl(var(--primary) / 0.5)",
  "hsl(280, 70%, 70%)",
  "hsl(200, 70%, 60%)",
  "hsl(45, 70%, 65%)",
  "hsl(160, 70%, 60%)",
  "hsl(320, 70%, 65%)",
  "hsl(180, 70%, 55%)",
];

export default function UsagePage() {
  const { productSwitcher } = useProductSwitcher();
  const organisationId = productSwitcher?.organisation_id;

  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [monthlyData, setMonthlyData] = useState<MonthlyUsageData[]>([]);
  const [productData, setProductData] = useState<ProductUsageData[]>([]);
  const [loadingData, setLoadingData] = useState<boolean>(true);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [products, setProducts] = useState<ProductInfo[]>([]);
  const [qubitBalance, setQubitBalance] = useState<number>(0);
  const [buyQubitsDialogOpen, setBuyQubitsDialogOpen] = useState(false);

  // Fetch all usage data for the organisation
  useEffect(() => {
    if (organisationId) {
      fetchUsageData();
    }
  }, [organisationId]);

  // Update chart data when month or product selection changes
  useEffect(() => {
    if (selectedMonth && productData.length > 0) {
      updateChartData();
    }
  }, [selectedMonth, productData, selectedProducts]);

  const fetchUsageData = async () => {
    setLoadingData(true);
    setError("");
    setMonthlyData([]);
    setProductData([]);
    setChartData([]);
    setSelectedMonth("");
    setSelectedProducts([]);

    console.log(`Fetching usage data for organisation: ${organisationId}`);

    try {
      const response = await fetch(
        `/api/get-usage-data-for-organisation?organisation_id=${organisationId}`,
      );

      console.log(`Frontend API response status: ${response.status}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch usage data");
      }

      const data: UsageResponse = await response.json();
      console.log("Received usage data:", data);

      if (typeof data.qubit_balance === "number") {
        setQubitBalance(data.qubit_balance);
      }

      if (data.data && Array.isArray(data.data)) {
        setProductData(data.data);

        // Extract unique products with colors
        const uniqueProducts: ProductInfo[] = data.data.map(
          (product, index) => ({
            id: product.product_id,
            name: product.product_name,
            color: productColors[index % productColors.length],
          }),
        );
        setProducts(uniqueProducts);
        setSelectedProducts(uniqueProducts.map((p) => p.id));

        // Flatten to get all unique months
        const monthlyUsageData: MonthlyUsageData[] = [];
        data.data.forEach((product) => {
          if (product.monthly_usage && Array.isArray(product.monthly_usage)) {
            product.monthly_usage.forEach((monthData) => {
              const existingMonth = monthlyUsageData.find(
                (m) => m.month === monthData.month && m.year === monthData.year,
              );
              if (!existingMonth) {
                monthlyUsageData.push({
                  month: monthData.month,
                  year: monthData.year,
                  daily_usage: [],
                });
              }
            });
          }
        });

        setMonthlyData(monthlyUsageData);

        // Set default to most recent month
        if (monthlyUsageData.length > 0) {
          const firstMonth = monthlyUsageData[0];
          setSelectedMonth(`${firstMonth.month}-${firstMonth.year}`);
          console.log(
            `Default month selected: ${firstMonth.month}-${firstMonth.year}`,
          );
        }
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to fetch usage data";
      console.error("Error fetching usage data:", errorMessage);
      setError(errorMessage);
    } finally {
      setLoadingData(false);
    }
  };

  const updateChartData = () => {
    setLoading(true);
    setError("");

    try {
      const [monthName, year] = selectedMonth.split("-");

      // Collect all dates and usage per product for the selected month
      const dateMap: Map<
        string,
        { date: string; [productId: string]: number | string }
      > = new Map();

      productData.forEach((product) => {
        const monthData = product.monthly_usage?.find(
          (m) => m.month === monthName && m.year.toString() === year,
        );

        if (monthData && selectedProducts.includes(product.product_id)) {
          monthData.daily_usage.forEach((dailyData) => {
            const formattedDate = formatDateForChart(dailyData.date);
            const existing = dateMap.get(dailyData.date);

            if (existing) {
              existing[product.product_id] = dailyData.usage.reduce(
                (sum, count) => sum + count,
                0,
              );
            } else {
              dateMap.set(dailyData.date, {
                date: formattedDate,
                [product.product_id]: dailyData.usage.reduce(
                  (sum, count) => sum + count,
                  0,
                ),
              });
            }
          });
        }
      });

      // Convert map to array and sort by date
      const chartDataArray = Array.from(dateMap.values()).sort((a, b) => {
        const dateA = new Date(
          dateMap.get(a.date as string)?.date as string,
        ).getTime();
        const dateB = new Date(
          dateMap.get(b.date as string)?.date as string,
        ).getTime();
        return dateA - dateB;
      });

      console.log("Chart data:", chartDataArray);
      setChartData(chartDataArray);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "An error occurred";
      console.error("Error updating chart data:", errorMessage);
      setError(errorMessage);
      setChartData([]);
    } finally {
      setLoading(false);
    }
  };

  const formatDateForChart = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const toggleProduct = (productId: string) => {
    setSelectedProducts((prev) => {
      if (prev.includes(productId)) {
        if (prev.length === 1) return prev;
        return prev.filter((id) => id !== productId);
      }
      return [...prev, productId];
    });
  };

  const getProductLabel = () => {
    if (selectedProducts.length === products.length) return "All Products";
    if (selectedProducts.length === 1) {
      return products.find((p) => p.id === selectedProducts[0])?.name;
    }
    return `${selectedProducts.length} Products`;
  };

  const handleBuyQubitsSuccess = () => {
    fetchUsageData();
  };

  if (!organisationId) {
    return (
      <div className="absolute inset-0 bg-white pointer-events-auto z-10">
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold text-foreground mb-6">
              Usage & Billing
            </h1>
            <Card className="p-6">
              <div className="h-[300px] flex items-center justify-center">
                <p className="text-muted-foreground">
                  No organisation selected
                </p>
              </div>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (loadingData) {
    return (
      <div className="absolute inset-0 bg-white pointer-events-auto z-10">
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold text-foreground mb-6">
              Usage & Billing
            </h1>
            <Card className="p-6">
              <div className="h-[300px] flex items-center justify-center">
                <p className="text-muted-foreground">Loading usage data...</p>
              </div>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 bg-white pointer-events-auto z-10 overflow-y-auto">
      <div className="flex-1 overflow-y-auto p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={transitions.normal}
          className="max-w-4xl mx-auto space-y-6"
        >
          {/* Header */}
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-2">
              Usage & Billing
            </h1>
            <p className="text-muted-foreground">
              Manage Qubits, payments, and view your usage statistics.
            </p>
          </div>

          {/* Qubit Balance Section */}
          <div>
            <h2 className="text-base font-semibold text-foreground mb-1">
              Qubit Balance
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              You consume a Qubit for each test case executed and reported. You
              can buy Qubits directly, or set-up an automatic top up when your
              Qubit balance goes below your threshold.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Balance Card */}
              <Card className="p-6 flex flex-col items-center justify-center">
                <span className="text-4xl font-bold text-foreground">
                  {qubitBalance}
                </span>
                <span className="text-sm text-muted-foreground">
                  Qubits remaining
                </span>
              </Card>

              {/* Buy Qubits Card */}
              <Card className="p-6 flex flex-col items-center justify-center gap-3">
                <div className="text-sm text-muted-foreground">
                  Need more qubits?
                </div>
                <Button onClick={() => setBuyQubitsDialogOpen(true)}>
                  Buy Qubits
                </Button>
              </Card>

              {/* Auto-reload - Kept Hidden for now */}
              <Card className="p-6 flex flex-col items-center justify-center text-center border-dashed hidden">
                <p className="text-sm text-muted-foreground mb-3">
                  Avoid disruption of service due to insufficient Qubit balance
                  with auto-reload.
                </p>
                <Button variant="outline" size="sm">
                  Enable Auto-reload
                </Button>
              </Card>
            </div>
          </div>

          {/* Usage History Section */}
          <div>
            <h2 className="text-base font-semibold text-foreground mb-4">
              Usage History
            </h2>

            {monthlyData.length > 0 && (
              <div className="flex items-center gap-3 mb-4">
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="Select month" />
                  </SelectTrigger>
                  <SelectContent>
                    {monthlyData.map((monthData) => (
                      <SelectItem
                        key={`${monthData.month}-${monthData.year}`}
                        value={`${monthData.month}-${monthData.year}`}
                      >
                        {monthData.month} {monthData.year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {products.length > 0 && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="flex h-9 w-44 items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50">
                        <span>{getProductLabel()}</span>
                        <ChevronDown className="h-4 w-4 opacity-50" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-2" align="start">
                      <div className="space-y-1">
                        {products.map((product) => (
                          <div
                            key={product.id}
                            className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer"
                            onClick={() => toggleProduct(product.id)}
                          >
                            <Checkbox
                              checked={selectedProducts.includes(product.id)}
                              onCheckedChange={() => toggleProduct(product.id)}
                            />
                            <div
                              className="w-3 h-3 rounded-sm"
                              style={{ backgroundColor: product.color }}
                            />
                            <span className="text-sm">{product.name}</span>
                          </div>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            )}

            <Card className="p-6">
              {loading ? (
                <div className="h-[300px] flex items-center justify-center">
                  <p className="text-muted-foreground">Loading chart data...</p>
                </div>
              ) : error ? (
                <div className="h-[300px] flex items-center justify-center flex-col space-y-2">
                  <p className="text-destructive">Error: {error}</p>
                  <button
                    onClick={fetchUsageData}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                  >
                    Retry
                  </button>
                </div>
              ) : monthlyData.length === 0 || productData.length === 0 ? (
                <div className="h-[300px] flex items-center justify-center flex-col space-y-2">
                  <p className="text-muted-foreground">
                    No usage data available for this organisation
                  </p>
                  <button
                    onClick={fetchUsageData}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                  >
                    Refresh
                  </button>
                </div>
              ) : chartData.length === 0 ? (
                <div className="h-[300px] flex items-center justify-center">
                  <p className="text-muted-foreground">
                    No usage data available for {selectedMonth}
                  </p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={chartData}
                    margin={{ top: 10, right: 10, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="hsl(var(--border))"
                    />
                    <XAxis
                      dataKey="date"
                      axisLine={false}
                      tickLine={false}
                      tick={{
                        fill: "hsl(var(--muted-foreground))",
                        fontSize: 12,
                      }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{
                        fill: "hsl(var(--muted-foreground))",
                        fontSize: 12,
                      }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                    <Legend />
                    {products
                      .filter((p) => selectedProducts.includes(p.id))
                      .map((product) => (
                        <Bar
                          key={product.id}
                          dataKey={product.id}
                          name={product.name}
                          stackId="usage"
                          fill={product.color}
                          radius={[0, 0, 0, 0]}
                        />
                      ))}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>
          <BuyQubitsDialog
            open={buyQubitsDialogOpen}
            onOpenChange={setBuyQubitsDialogOpen}
            organisationId={organisationId}
            onSuccess={handleBuyQubitsSuccess}
          />
        </motion.div>
      </div>
    </div>
  );
}
