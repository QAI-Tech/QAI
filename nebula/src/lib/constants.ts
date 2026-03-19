export const GCS_BUCKET_NAME =
  process.env.NEXT_PUBLIC_APP_ENV === "production"
    ? "frontend-file-uploads-prod"
    : "frontend-file-uploads";
export const PRODUCT_DESIGN_ASSETS_BUCKET_NAME =
  process.env.NEXT_PUBLIC_APP_ENV === "production"
    ? "product-design-assets-prod"
    : "product-design-assets";
export const GCS_BUCKET_NAME_FOR_TEST_CASES_DOWNLOAD = "test_cases_excel";
export const GCS_SIGNED_URL_EXPIRATION_MS = 60 * 60 * 1000;
export const FILENAME_FOR_DOWNLOAD_TEST_CASES_IN_EXCEL = "test_cases.xlsx";
export const DEVELOPMENT_API_URL = "http://127.0.0.1:8080";
export const PRODUCTION_API_URL =
  "https://europe-west3-qai-tech.cloudfunctions.net";
export const VIDEO_FILES_KEY = "videos";
export type MEDIA_TYPE = "VIDEO" | "SCREENSHOT";
export const VIDEO: MEDIA_TYPE = "VIDEO";
export const SCREENSHOT: MEDIA_TYPE = "SCREENSHOT";
export const FIELD_STEP_DESCRIPTION = "step_description";

export const GCS_BUCKET_URL = "https://storage.cloud.google.com/";
export const GCS_IMAGE_DOMAIN = "storage.googleapis.com";
export const DUMMY_TOKEN_BALANCE = 10;
export const DUMMY_ORGANISATION_ID = "123";
export const DUMMY_USER_ID = "123";
export const FIREBASE_URL = "https://firebase.google.com/";
export const TESTFLIGHT_URL = "https://testflight.apple.com/";

// GCS Bucket Paths
export const ORG_PREFIX = "Organisation_";
export const PRODUCT_PREFIX = "Product_";
export const TEST_RUN_PREFIX = "TestRun_";
export const TEST_CASE_UNDER_EXECUTION_PREFIX = "TestCaseUnderExecution_";

// QAI Organization IDs
export const PRODUCTION_ORGANISATION_ID = "5650266825162752"; // Production
export const DEVELOPMENT_ORGANISATION_ID = "5629659324612608"; // Development
export const ANALYST_ORGANISATION_ID = "5669669566414848";
export const SESSION_TOKEN_COOKIE_NAME = "session-token";

export const getBaseUrl = (): string => {
  if (typeof window !== "undefined") {
    if (window.location.hostname === "localhost") {
      return process.env.NEXT_PUBLIC_APP_ENV === "production"
        ? "app.qaitech.ai"
        : "nebula-236141506463.europe-west3.run.app";
    }
    return window.location.host;
  }
  return process.env.NEXT_PUBLIC_APP_ENV === "production"
    ? "app.qaitech.ai"
    : "nebula-236141506463.europe-west3.run.app";
};

export const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

//API ENDPOINTS
export const UPDATE_TEST_CASE_API_ENDPOINT = "/api/update-test-case";
export const GENERATE_SIGNED_URL_FOR_FRAME_API_ENDPOINT =
  "/api/generate-signed-url-for-frame?framePath=";
export const ADD_TEST_RUN_API_ENDPOINT = "/api/add-test-run";
export const ADD_TEST_CASE_API_ENDPOINT = "/api/add-test-case";
export const DEFAULT_PRODUCT_ID = "1234567890";

//HTTP Constants
export const HTTP_STATUS_OK = 200;
export const HTTP_STATUS_BAD_REQUEST = 400;
export const HTTP_STATUS_NOT_FOUND = 404;
export const HTTP_STATUS_INTERNAL_SERVER_ERROR = 500;

// QAI Default Email ID
export const AGENT_EMAIL = "agent@qaitech.ai";

export const NOVA_USER = {
  user_id: "NOVA",
  first_name: "NOVA",
  last_name: "",
  email: "",
  roles: ["Tester"],
};

export const isQaiOrgUser = (userOrgId: string | undefined): boolean => {
  return process.env.NEXT_PUBLIC_APP_ENV === "production"
    ? userOrgId === PRODUCTION_ORGANISATION_ID
    : userOrgId === DEVELOPMENT_ORGANISATION_ID; // I have added this for determining qai users even in staging
};

export const ALLOWED_STAGING_ANALYST_ORGS = [
  "5629659324612608",
  "5685332821409792",
  "5760531424083968",
  "5678198209642496",
  "5717630740594688",
  "5766487469981696",
  "5654589445505024",
  "5712408328798208",
  "6222023378337792",
  "5189973137424384",
];

export const isQaiOrgAnalystUser = (userOrgId: string | undefined): boolean => {
  if (process.env.NEXT_PUBLIC_APP_ENV === "production") {
    return userOrgId === ANALYST_ORGANISATION_ID;
  }

  return userOrgId ? ALLOWED_STAGING_ANALYST_ORGS.includes(userOrgId) : false;
};

export const GRAPH_BUCKET_NAME =
  process.env.NEXT_PUBLIC_APP_ENV === "production"
    ? "graph-editor-prod"
    : "graph-editor";

export const BROWSER_DROID_SERVER_ONE_URL = "https://34.90.11.233/";
export const BROWSER_DROID_SERVER_TWO_URL = "https://34.168.124.72/";

export const SERVER_IP_MAP: Record<string, string> = {
  server1: "https://34.90.11.233/",
  server2: "https://recordnplay.qaitech.ai/",
};

export const GRAPH_COLLABORATION_SERVER_URL =
  process.env.NEXT_PUBLIC_APP_ENV === "production"
    ? "https://graphcollab-prod.qaitech.ai"
    : "http://127.0.0.1:8001";

export const BROWSER_DROID_SERVER_URLS = [
  "https://recordnplay.qaitech.ai",
  "https://recordnplay-v2.qaitech.ai",
  "https://graph.qaitech.ai",
];
export const MAX_VIDEO_DURATION_SECONDS = 210;

export const QAI_WEB_VIDEO_URL = "https://www.youtube.com/watch?v=ABETowcoGpA";
export const QAI_MOBILE_VIDEO_URL =
  "https://www.youtube.com/watch?v=vxnyfnlW9mY";

export const UNASSIGNED_FLOWS_FEATURE_ID = "unassigned-flows";
export const UNASSIGNED_FLOWS_FEATURE_NAME = "Miscellaneous";

export const PRICE_PER_QUBIT_CENTS = 5; // 5 cents per qubit
