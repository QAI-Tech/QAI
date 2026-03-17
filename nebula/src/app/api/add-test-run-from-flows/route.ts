import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import {
  HTTP_STATUS_OK,
  SESSION_TOKEN_COOKIE_NAME,
  HTTP_STATUS_BAD_REQUEST,
  HTTP_STATUS_INTERNAL_SERVER_ERROR,
} from "@/lib/constants";
import { handleExpiredSessionToken } from "@/lib/handleExpiredSessionToken";
import { constructUrl } from "@/lib/urlUtlis";

// Defined an interface for the request body structure
interface TestRunFromFlowsRequestBody {
  product_id: string;
  platform: string;
  test_run_name: string;
  build_number: string;
  executable_url?: string;
  flow_ids?: string[];
  device_ids?: string;
  acceptance_criteria?: string;
  test_run_type?: string;
  send_to_nova?: boolean;
}

export async function POST(req: NextRequest) {
  try {
    const { addTestRunData } = await req.json();
    const {
      platform,
      testRunName,
      buildNumber,
      productId,
      executable_url,
      flow_ids,
      deviceIds,
      acceptance_criteria,
      test_run_type,
      send_to_nova,
    } = addTestRunData;

    if (!addTestRunData) {
      console.log("Test Run data is missing");
      Sentry.captureMessage("Test Run data is missing", {
        level: "fatal", // or "error"
        tags: { priority: "high" },
      });
      return NextResponse.json(
        { error: "Test Run data is missing" },
        { status: HTTP_STATUS_BAD_REQUEST },
      );
    }

    // Created request body using the interface
    const requestBody: TestRunFromFlowsRequestBody = {
      product_id: productId,
      platform: platform.toUpperCase(),
      test_run_name: testRunName,
      build_number: buildNumber,
      send_to_nova: send_to_nova || false, // Default to false if not provided
    };

    // Only add executable_url if it exists
    if (executable_url) {
      requestBody.executable_url = executable_url;
    }

    // Add flow IDs if they exist
    if (flow_ids && flow_ids.length > 0) {
      requestBody.flow_ids = flow_ids.map((id: string | number) =>
        id.toString(),
      );
    }

    if (deviceIds) {
      requestBody.device_ids = deviceIds;
    }

    if (acceptance_criteria) {
      requestBody.acceptance_criteria = acceptance_criteria;
    }

    if (test_run_type) {
      requestBody.test_run_type = test_run_type;
    }

    const backendResponse = await fetch(constructUrl("AddTestRunFromFlows"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `${req.cookies.get(SESSION_TOKEN_COOKIE_NAME)?.value}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (backendResponse.status === 401) {
      return await handleExpiredSessionToken(req);
    }

    // Handle backend response
    if (!backendResponse.ok) {
      const errorData = await backendResponse.json();
      Sentry.captureMessage(JSON.stringify(errorData), {
        level: "fatal",
        tags: { priority: "high" },
      });
      return NextResponse.json(
        { error: errorData.error || "Backend request failed" },
        { status: backendResponse.status },
      );
    }

    const result = await backendResponse.json();
    console.log("Test Run Added Successfully from Flows", result);
    return NextResponse.json(result, { status: HTTP_STATUS_OK });
  } catch (error) {
    Sentry.captureException(error, {
      level: "fatal",
      tags: { priority: "high" },
    });
    console.error("Error in POST /api/add-test-run-from-flows:", error);
    return NextResponse.json(
      { error: "Failed to add new test run from flows" },
      { status: HTTP_STATUS_INTERNAL_SERVER_ERROR },
    );
  }
}
