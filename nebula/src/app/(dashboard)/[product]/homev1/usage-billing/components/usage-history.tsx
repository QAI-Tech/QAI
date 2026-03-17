"use client";

import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  LabelList,
} from "recharts";
import type {
  MonthlyUsageData,
  UsageResponse,
  ChartDataPoint,
  ProductUsageData,
} from "@/lib/types";
import { CustomTooltip } from "@/components/global/custom-tooltip";
import { useState, useEffect } from "react";
import { useProductSwitcher } from "@/providers/product-provider";

export default function UsageHistory() {
  const { productSwitcher } = useProductSwitcher();
  const organisationId = productSwitcher?.organisation_id;

  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [usageData, setUsageData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [monthlyData, setMonthlyData] = useState<MonthlyUsageData[]>([]);
  const [loadingData, setLoadingData] = useState<boolean>(true);

  // Fetch all usage data for the organisation
  useEffect(() => {
    if (organisationId) {
      fetchUsageData();
    }
  }, [organisationId]);

  // Update chart data when month selection changes
  useEffect(() => {
    if (selectedMonth && monthlyData.length > 0) {
      updateChartData();
    }
  }, [selectedMonth, monthlyData]);

  const fetchUsageData = async () => {
    setLoadingData(true);
    setError("");
    setMonthlyData([]);
    setUsageData([]);
    setSelectedMonth("");

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

      // Flatten product data into monthly data (combining all products)
      const monthlyUsageData: MonthlyUsageData[] = [];

      if (data.data && Array.isArray(data.data)) {
        data.data.forEach((product: ProductUsageData) => {
          if (product.monthly_usage && Array.isArray(product.monthly_usage)) {
            product.monthly_usage.forEach((monthData) => {
              // Check if this month already exists in our flattened data
              const existingMonth = monthlyUsageData.find(
                (m) => m.month === monthData.month && m.year === monthData.year,
              );

              if (existingMonth) {
                // Merge daily usage data
                monthData.daily_usage.forEach((dailyData) => {
                  const existingDay = existingMonth.daily_usage.find(
                    (d) => d.date === dailyData.date,
                  );
                  if (existingDay) {
                    existingDay.usage.push(...dailyData.usage);
                  } else {
                    existingMonth.daily_usage.push({ ...dailyData });
                  }
                });
              } else {
                // Add new month with deep copy of data
                monthlyUsageData.push({
                  month: monthData.month,
                  year: monthData.year,
                  daily_usage: monthData.daily_usage.map((d) => ({
                    date: d.date,
                    usage: [...d.usage],
                  })),
                });
              }
            });
          }
        });
      }

      setMonthlyData(monthlyUsageData);

      // Set default to most recent month (first in the list) only if data exists
      if (monthlyUsageData.length > 0) {
        const firstMonth = monthlyUsageData[0];
        setSelectedMonth(`${firstMonth.month}-${firstMonth.year}`);
        console.log(
          `Default month selected: ${firstMonth.month}-${firstMonth.year}`,
        );
      } else {
        console.log("No monthly data available for this organisation");
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
      const selectedMonthData = monthlyData.find(
        (data) => data.month === monthName && data.year.toString() === year,
      );

      if (!selectedMonthData) {
        console.log(`No data found for selected month: ${selectedMonth}`);
        setUsageData([]);
        return;
      }

      console.log(`Processing data for ${selectedMonth}:`, selectedMonthData);

      // Transform data for chart - sum all usage for each date
      const chartData: ChartDataPoint[] = selectedMonthData.daily_usage.map(
        (item) => ({
          date: formatDateForChart(item.date),
          totalUsage: item.usage.reduce((sum, count) => sum + count, 0), // Sum all TCUE counts for the day
          testRunCount: item.usage.length, // Number of test runs for this date
        }),
      );

      console.log("Chart data:", chartData);
      setUsageData(chartData);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "An error occurred";
      console.error("Error updating chart data:", errorMessage);
      setError(errorMessage);
      setUsageData([]);
    } finally {
      setLoading(false);
    }
  };

  const formatDateForChart = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  // Custom label component to show total usage on top of bars
  const TcueCountLabel = (props: {
    x?: number;
    y?: number;
    width?: number;
    value?: number;
  }) => {
    const { x, y, width, value } = props;
    if (
      typeof x === "number" &&
      typeof y === "number" &&
      typeof width === "number" &&
      typeof value === "number"
    ) {
      return (
        <text
          x={x + width / 2}
          y={y - 5}
          fill="#6B7280"
          textAnchor="middle"
          fontSize="12"
          fontWeight="500"
        >
          {value}
        </text>
      );
    }
    return null;
  };

  if (!organisationId) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Usage History</h2>
        <Card className="p-6 rounded-xl bg-white">
          <div className="h-[300px] flex items-center justify-center">
            <p className="text-gray-500">No organisation selected</p>
          </div>
        </Card>
      </div>
    );
  }

  if (loadingData) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Usage History</h2>
        <Card className="p-6 rounded-xl bg-white">
          <div className="h-[300px] flex items-center justify-center">
            <p className="text-gray-500">Loading usage data...</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <h2 className="text-xl font-semibold">Organisation Usage History</h2>

        {monthlyData.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Select Month:</p>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-[200px]">
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
          </div>
        )}
      </div>

      <Card className="p-6 rounded-xl bg-white">
        {loading ? (
          <div className="h-[300px] flex items-center justify-center">
            <p className="text-gray-500">Loading chart data...</p>
          </div>
        ) : error ? (
          <div className="h-[300px] flex items-center justify-center flex-col space-y-2">
            <p className="text-red-500">Error: {error}</p>
            <button
              onClick={fetchUsageData}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Retry
            </button>
          </div>
        ) : monthlyData.length === 0 ? (
          <div className="h-[300px] flex items-center justify-center flex-col space-y-2">
            <p className="text-gray-500">
              No usage data available for this organisation
            </p>
            <p className="text-sm text-gray-400">
              Organisation ID: {organisationId}
            </p>
            <button
              onClick={fetchUsageData}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Refresh
            </button>
          </div>
        ) : usageData.length === 0 ? (
          <div className="h-[300px] flex items-center justify-center">
            <p className="text-gray-500">
              No usage data available for {selectedMonth}
            </p>
          </div>
        ) : (
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={usageData}
                margin={{ top: 30, right: 30, left: 20, bottom: 20 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#E5E7EB"
                />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#6B7280", fontSize: 12 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#6B7280", fontSize: 12 }}
                />
                <Tooltip
                  content={
                    <CustomTooltip<ChartDataPoint>
                      renderContent={(data) => (
                        <p className="text-gray-600">
                          {`${data.testRunCount} Test Run${data.testRunCount !== 1 ? "s" : ""}`}
                        </p>
                      )}
                    />
                  }
                  cursor={{ fill: "transparent" }}
                  allowEscapeViewBox={{ x: false, y: true }}
                />
                <Bar
                  dataKey="totalUsage"
                  fill="#E9D5FF"
                  radius={[4, 4, 0, 0]}
                  barSize={30}
                >
                  <LabelList content={<TcueCountLabel />} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    </div>
  );
}
