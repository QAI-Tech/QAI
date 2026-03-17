"use client";
import React, { useEffect } from "react";
import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import TestCard from "./TestCard";
import { RequestSchema, TestSchema } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import Loading from "@/components/global/loading";
import { FILENAME_FOR_DOWNLOAD_TEST_CASES_IN_EXCEL } from "@/lib/constants";
const RequestCard = () => {
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [data, setData] = useState<{ result: TestSchema } | null>(null);
  const [queuedRequests, setQueuedRequests] = useState<RequestSchema[]>([]);
  const [loading, setLoading] = useState(false);

  const getAllRequests = async () => {
    try {
      const response = await fetch("/api/get-queued-request", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
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
      toast.success("Queued Requests fetched successfully");
      setQueuedRequests(result.requests);
    } catch (error) {
      toast.error("Error fetching all queued requests.");
      console.error("Error fetching all queued requests:", error);
    }
  };

  const fetchTestCases = async (requestId: string) => {
    try {
      const response = await fetch(`/api/generate-test-cases/${requestId}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch process test case instructions.`);
      }

      if (response.status === 401) {
        toast.error(
          "Session token expired, logging out the user to regenerate token",
        );
      }

      const testCasesResponse = await response.json();
      toast.success("Successfully fetched process test case instructions");
      setData(testCasesResponse);
      console.log("Data", testCasesResponse?.result["structured-test-cases"]);
    } catch (err) {
      console.error("Error processing request:", err);
    }
  };

  const downloadTestCaseInExcel = async () => {
    setLoading(true);
    const testCaseIds = data?.result["structured-test-cases"]?.map((testCase) =>
      testCase.test_case_id.toString(),
    );

    if (testCaseIds) {
      try {
        const response = await fetch(`/api/export-testcases-to-excel-sheet`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ testCaseIds: testCaseIds }),
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch process test case instructions.`);
        }

        if (response.status === 401) {
          toast.error(
            "Session token expired, logging out the user to regenerate token",
          );
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = FILENAME_FOR_DOWNLOAD_TEST_CASES_IN_EXCEL;
        a.click();
        URL.revokeObjectURL(url);
        setLoading(false);
      } catch (error) {
        setLoading(false);
        console.error("Error processing request:", error);
      }
    }
  };

  const toggleRowExpansion = async (requestId: string, status: string) => {
    if (status !== "COMPLETED") return;

    if (expandedRowId === requestId) {
      setExpandedRowId(null);
    } else {
      await fetchTestCases(requestId);
      setExpandedRowId(requestId);
    }
  };
  useEffect(() => {
    getAllRequests();
  }, []);

  return (
    <div className="flex justify-center items-center min-h-screen p-4">
      {queuedRequests?.length > 0 ? (
        <Card className="w-full max-w-4xl">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-2xl font-bold">Request Table</CardTitle>
            <Button
              onClick={getAllRequests}
              className="bg-muted-foreground hover:bg-primary"
            >
              Refresh Status
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">Request ID</TableHead>
                    <TableHead className="w-[100px]">Status</TableHead>
                    <TableHead className="w-[200px]">Created At</TableHead>
                    <TableHead className="w-[200px]">URI</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queuedRequests.map((request) => (
                    <React.Fragment key={request.request_id}>
                      <TableRow
                        className={
                          request.status === "COMPLETED"
                            ? "cursor-pointer"
                            : "cursor-not-allowed"
                        }
                        onClick={() =>
                          toggleRowExpansion(request.request_id, request.status)
                        }
                      >
                        <TableCell className="font-medium">
                          {request.request_id}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={request.status} />
                        </TableCell>
                        <TableCell>
                          {new Date(request.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell
                          className="max-w-xs truncate"
                          title={request.uri}
                        >
                          {request.uri}
                        </TableCell>
                      </TableRow>

                      {expandedRowId === request.request_id && data && (
                        <TableRow>
                          <TableCell colSpan={4} className="px-6 py-4">
                            <div className="flex justify-between">
                              <h3 className="text-lg font-semibold mb-2">
                                Test Cases
                              </h3>
                              <Button
                                onClick={downloadTestCaseInExcel}
                                className="bg-muted-foreground hover:bg-primary"
                                disabled={
                                  !data?.result["structured-test-cases"]?.length
                                }
                              >
                                {!loading ? "Download Test Cases" : <Loading />}
                              </Button>
                            </div>

                            {data.result["structured-test-cases"]?.map(
                              (testCase, key) => (
                                <TestCard
                                  key={key}
                                  testCase={testCase}
                                  requestId={request.request_id}
                                />
                              ),
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
};

export default RequestCard;
