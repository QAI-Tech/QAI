export type TestCaseStep = {
  test_step_id: string;
  step_description: string;
  expected_results: string[];
  status?: TestCaseStepStatus;
  _renderKey?: string;
  type?: string;
  http_method?: string; // Optional HTTP method for API steps
  url?: string; // Optional URL for API steps
  request_body?: string; // Optional request body for API steps
  headers?: string; // Optional headers for API steps
};

export enum TestCaseType {
  action = "ACTION",
  ui = "UI",
  obstruction = "OBSTRUCTION",
  route = "ROUTE",
  smoke = "smoke",
}

export enum TestCaseStepStatus {
  COMPLETE = "COMPLETE",
  INCOMPLETE = "INCOMPLETE",
}

export enum Criticality {
  HIGH = "HIGH",
  LOW = "LOW",
}

export interface TestCaseParameter {
  parameter_name: string;
  parameter_value: string;
}

export type Credential = {
  id: string;
  credentials: Record<string, string>;
  description: string;
  created_at: string;
  updated_at: string | null;
  product_id: string;
};

export type Scenario = {
  id: string;
  description: string;
  params: TestCaseParameter[];
};

export enum TestCaseStatus {
  RAW = "RAW",
  VERIFIED = "VERIFIED",
  UNVERIFIED = "UNVERIFIED",
}

export type MirroredTestCase = {
  product_id: string;
  test_case_id: string;
  product_name: string;
};

export type testCaseSchema = {
  title?: string;
  request_id?: string;
  product_id?: string;
  feature_id?: string;
  planning_request_id?: string;
  test_case_id: string;
  created_at: string;
  created_by?: string;
  screenshot_url?: string;
  preconditions?: string[];
  test_case_type: TestCaseType;
  test_case_description: string;
  test_case_steps: TestCaseStep[];
  status?: TestCaseStatus;
  updated_at?: string;
  sort_index?: number;
  credentials?: string[];
  comments?: string;
  criticality: Criticality;
  scenarios?: Scenario[];
  precondition_test_case_id?: string;
  mirrored_test_cases?: MirroredTestCase[];
  flow_id?: string;
  metadata?: string;
};

export type testCaseRequestSchema = {
  request_id?: string;
  product_id?: string;
  feature_id?: string;
  planning_request_id?: string;
  created_at: string;
  screenshot_url?: string;
  preconditions?: string[];
  test_case_type: TestCaseType;
  test_case_description: string;
  test_case_steps: TestCaseStep[];
  status?: TestCaseStatus;
  updated_at?: string;
  criticality: Criticality;
  title?: string;
};

export enum TestCaseUnderExecutionStatus {
  PASSED = "PASSED",
  FAILED = "FAILED",
  UNTESTED = "UNTESTED",
  DEFAULT = "DEFAULT",
  ATTEMPT_FAILED = "ATTEMPT_FAILED",
  SKIPPED = "SKIPPED",
}

export interface FeatureIdBasedGroupedTestCase {
  [feature_id: string]: testCaseSchema[];
}

export interface FeatureIdBasedGroupedTestCaseUnderExecution {
  [feature_id: string]: TestCaseUnderExecutionSchema[];
}

export type TestSchema = {
  prd: {
    title: string;
    overview: string;
    functionalities: {
      feature: string;
      ui_elements: {
        element_name: string;
        description: string;
      }[];
    }[];
  };
  "user-story-test-cases": {
    user_story: string;
    expected_results: string;
    ui_element_details: {
      element_name: string;
      description: string;
    }[];
  }[];
  "structured-test-cases": testCaseSchema[];
};

export type UserFeedbackSchema = {
  id: string;
  description: string;
}[];

export interface RequestSchema {
  created_at: string;
  request_id: string;
  status: string;
  uri: string;
  user_id: string;
}

export interface ProductSwitcherSchema {
  apple_app_store_url: string;
  created_at: string;
  google_play_store_url: string;
  organisation_id: string;
  product_id: string;
  product_name: string;
  related_products: [];
  web_url: string;
}

export type ProductListSchema = ProductSwitcherSchema[];

export interface TestRunTestMetricSchema {
  passed: number;
  failed: number;
  blocked: number;
}

export interface TestRunSchema {
  created_at: string;
  created_by_user_id: string;
  platform: string;
  product_id: string;
  status: string;
  test_run_id: string;
  test_run_name: string;
  updated_at: string;
  device_name?: string;
  test_build_id?: string;
  build_number?: string;
  test_run_type?: string;
  tcue_count?: number;
  status_counts?: Record<string, string>;
}

export interface categorizeTestRunSchema {
  created_at: string;
  platform: string;
  product_id: string;
  updated_at: string;
  created_by_user_id: string;
  test_run_id: string;
  title: string;
  metrics: TestRunTestMetricSchema;
  build_number?: string;
  test_run_type?: string;
  tcue_count?: number;
  status_counts?: Record<string, string>;
  status?: string;
}

export interface TimeSectionSchema {
  title: string;
  runs: categorizeTestRunSchema[];
}

export interface Feature {
  id: string;
  name: string;
  product_id: string;
  description: string;
  created_at: string;
  updated_at: string;
  sort_index?: number;
}

export type Features = Feature[];

export interface FeaturesById {
  [key: string]: Feature;
}

export type TestCaseUnderExecutionSchema = {
  id: string;
  assignee_user_id: string;
  device_id: string;
  execution_completed_at: string;
  execution_started_at: string;
  execution_video_url: string;
  functionality_id: string;
  notes: string;
  comments?: string;
  rationale: string;
  test_run_id: string;
  criticality: Criticality;
  status?: TestCaseUnderExecutionStatus;
  title?: string;
  annotations: string[];
  scenario_parameters?: Record<string, string>;
} & Omit<testCaseSchema, "status">;

export type UpdateTestCaseUnderExecutionSchema = {
  test_case_under_execution_id: string;
  status?: TestCaseUnderExecutionStatus;
  notes?: string;
  comments?: string;
  execution_video_url?: string;
  screenshot_url?: string;
  criticality?: Criticality;
  test_case_id?: string;
  test_case_description?: string;
  test_case_steps?: TestCaseStep[];
  preconditions?: string[];
  feature_id?: string;
  is_synced?: boolean;
  scenario_parameters?: Record<string, string>;
  annotations?: string[];
};

export interface User {
  auth_provider: string;
  auth_provider_user_id: string;
  created_at: string;
  email: string;
  first_name: string;
  last_name: string;
  organisation_id: string;
  organisation_ids: string[];
  roles: string[];
  user_id: string;
}

export interface OnboardingData {
  firstName: string;
  lastName: string;
  email: string;
  roles?: string[];
  organisation_id?: string;
  organization_name?: string;
  product_name?: string;
  apple_app_store_url?: string;
  google_play_store_url?: string;
  web_url?: string;
  default_credentials?: {
    credentials: Record<string, string>;
    description: string;
    is_default: boolean;
  };
}

export interface UsersResponse {
  organisation_id: string;
  users: User[];
}

export interface CommentType {
  id: string;
  userId: string;
  userName: string;
  userImageUrl?: string;
  text: string;
  createdAt: string;
}

export interface UsageDataPoint {
  date: string;
  usage: number[];
}

export interface MonthlyUsageData {
  month: string;
  year: number;
  daily_usage: UsageDataPoint[];
}

export interface ProductUsageData {
  product_id: string;
  product_name: string;
  monthly_usage: MonthlyUsageData[];
}

export interface UsageResponse {
  status: string;
  message: string;
  data: ProductUsageData[];
  qubit_balance?: number;
}

export interface ChartDataPoint {
  date: string;
  totalUsage: number;
  testRunCount: number;
}

export enum UserRole {
  OWNER = "Owner",
  ADMIN = "Admin",
  BILLING = "Billing",
  TESTER = "Tester",
}

// Copu TCUE interfaces

export interface CopyTCUEToProductDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  selectedTestCases: TestCaseUnderExecutionSchema[];
}

export interface ProductOption {
  value: string;
  label: string;
}

// Save function type for tcue components
export type SaveTestCaseUnderExecutionFunction = (
  data: Partial<{
    notes: string;
    status: TestCaseUnderExecutionStatus;
    criticality: Criticality;
    execution_video_url: string;
    screenshot_url: string;
    comments: CommentType[];
    test_case_description: string;
    preconditions: string[];
    test_case_steps: TestCaseStep[];
  }>,
) => Promise<boolean>;

export interface TCUEDetailsSectionProps {
  testCase: TestCaseUnderExecutionSchema;
  onStatusChange: (status: TestCaseUnderExecutionStatus) => Promise<void>;
  onFieldUpdate: (
    field: string,
    value: string | string[] | TestCaseStep[],
  ) => Promise<void>;
  isLoading: {
    status: boolean;
    action?: string | null;
  };
  // Flags for collapsible sections
  preconditionsCollapsed?: boolean;
  stepsCollapsed?: boolean;
  onSaveTestCase: SaveTestCaseUnderExecutionFunction;
}

export interface CommentsSectionProps {
  comments: CommentType[];
  onAddComment?: (text: string) => Promise<void>;
  onEditComment?: (commentId: string, text: string) => Promise<void>;
  onDeleteComment?: (commentId: string) => Promise<void>;
  isLoading: {
    status: boolean;
    action?: string | null;
  };
  onSaveTestCase: SaveTestCaseUnderExecutionFunction;
}

export interface GenericFieldProps {
  label?: string;
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
  minHeight?: string;
}

export interface CollapsiblePreconditionsProps {
  preconditions: string[] | string;
  isCollapsed: boolean;
  onToggle: () => void;
  onSave?: (value: string) => Promise<void>;
  disabled?: boolean;
}

export interface CollapsibleStepsProps {
  steps: TestCaseStep[];
  isCollapsed: boolean;
  onToggle: () => void;
  onSave?: (steps: TestCaseStep[]) => Promise<void>;
  disabled?: boolean;
  readOnly?: boolean;
  isQaiUser?: boolean;
}

// Save function type for test case components
export type SaveTestCaseFunction = (
  data: Partial<{
    test_case_description: string;
    preconditions: string[];
    test_case_steps: TestCaseStep[];
    credentials: string[];
    criticality: Criticality;
    status: TestCaseStatus;
    screenshot_url: string;
    comments: string;
    title: string;
    scenarios: Scenario[];
    precondition_test_case_id: string;
    mirrored_test_cases: MirroredTestCase[];
  }>,
) => Promise<boolean>;

export interface CollapsibleCredentialsProps {
  productId: string | undefined;
  credentialIds: string[] | undefined;
  testCaseId: string | undefined;
  isCollapsed: boolean;
  onToggle: () => void;
  onCredentialChange: (credentialId: string) => void;
  isEditing: boolean;
  isSaving: boolean;
}
export interface TestSuite {
  test_suite_id: string;
  product_id: string;
  name: string;
  test_case_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface GetTestSuitesResponse {
  product_id: string;
  test_suites: TestSuite[];
}

export interface MetaGraphNode {
  data?: {
    image?: string;
    frame_url?: string;
    screenshot_url?: string;
  };
}

export interface MetaGraphEdge {
  source?: string;
  target?: string;
}

export interface MetaGraphs {
  nodesById: Record<string, MetaGraphNode> | null;
  edgesById: Record<string, MetaGraphEdge> | null;
}

export interface JiraCredential {
  id: string;
  email: string;
  product_id: string;
  jira_project_key: string;
  jira_base_url: string;
}

export type TimeGroup =
  | "Today"
  | "This Week"
  | "This Month"
  | "Last Month"
  | "Earlier";
export type StatusLabel = "running" | "passed" | "failed" | "pending";
