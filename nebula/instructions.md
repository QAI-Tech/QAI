# **Product Requirements Document (PRD) - Nebula**

## **Overview**

Nebula is a frontend web application designed for testing web apps. Users can upload Figma frames/Screenshots, and execute automated tests to validate their applications.

## **Core Functionality**

- **Product Selection:** Users can select their product from the Drop-down of the side nav-bar to view the respective products in their organisation.
- **Dashboard:** Displays details like the number of test cases and test runs for the selected product, providing the flexibility to view them as well as start a new test run or plan test cases with AI.
- **AI Test Case Planning:** Users can upload Figma frames/screenshots and provide a feature name. The system will generate test cases based on the provided inputs.
- **Test Case Management:**
  - Users can view test cases generated per feature under the **Test Cases** section.
  - Flexibility to add, edit, and update test cases manually.
- **Test Run Management:**
  - Users can view details of test runs associated with their selected product.
  - Each test run consists of multiple test cases that are executed.
- **Test Case Execution Status:**
  - Users can monitor the execution status of their test cases.
  - Failed test cases provide additional insights by allowing users to view the recorded failure video as well as the flexibility to upload a video.
  - Users have the option to add notes/comments, and update the test case status accordingly.
- **Automated Test Execution:**
  - Users can execute automated tests using Figma frames.
  - The system provides detailed reports for executed tests.
  - Features automatic detection of UI elements and interactions for enhanced validation.
  - Utilizes an advanced AI-based test case validation system to improve test accuracy.
- **Error Handling & Feedback:**
  - If a test execution request fails, an error message is displayed.
  - **Sonner** is used to display alerts and notifications.

## **Tech Stack**

- **Next.js** – Server-side rendering and fast loading
- **React** – Component-based UI development
- **React-DOM** – Efficient DOM rendering for React applications
- **ShadCN** – Prebuilt UI components with Tailwind integration
- **TailwindCSS** – Utility-first styling framework
- **Tailwind Merge** – Optimized Tailwind utility merging
- **TailwindCSS Animate** – Animation utilities for TailwindCSS
- **React-Redux** – State management for global application state
- **React-Hook-Form** – Efficient form handling in React
- **@hookform/resolvers** – Schema-based form validation
- **Zod** – Data validation and schema definitions
- **Framer Motion** – Smooth animations and motion handling
- **Cmdk** – Command menu interactions
- **Vaul** – Modal and drawer interactions
- **Date-fns** – Date and time utility functions
- **React-Day-Picker** – Date picker component for user selection
- **Recharts** – Data visualization and chart rendering
- **Embla-Carousel-React** – Carousel component for slideshows
- **React-Resizable-Panels** – Resizable UI panel management
- **@clerk/nextjs** – User authentication and session handling
- **@clerk/themes** – Customizable themes for authentication UI
- **Sonner** – Toast notifications and alerts
- **React-Markdown** – Markdown rendering support
- **Clsx** – Conditional class name utility
- **Input-Otp** – OTP input UI component
- **UUID** – Unique identifier generation
- **@google-cloud/storage** – Cloud storage integration for media assets

## **Project Structure**

```
.
├── components.json
├── Dockerfile
├── gcp-service-account.json
├── instructions.md
├── next.config.mjs
├── next-env.d.ts
├── package.json
├── package-lock.json
├── postcss.config.mjs
├── README.md
├── src
│   ├── app
│   │   ├── api
│   │   │   ├── add-product
│   │   │   │   └── route.ts
│   │   │   ├── add-test-case
│   │   │   │   └── route.ts
│   │   │   ├── add-test-run
│   │   │   │   └── route.ts
│   │   │   ├── generate-instructions
│   │   │   │   └── route.ts
│   │   │   ├── generate-signed-url-for-frame
│   │   │   │   └── route.ts
│   │   │   ├── generate-test-run
│   │   │   │   └── route.ts
│   │   │   ├── get-features-using-product-id
│   │   │   │   └── route.ts
│   │   │   ├── get-products
│   │   │   │   └── route.ts
│   │   │   ├── get-queued-request
│   │   │   │   └── route.ts
│   │   │   ├── get-test-cases-for-product
│   │   │   │   └── route.ts
│   │   │   ├── get-test-runs
│   │   │   │   └── route.ts
│   │   │   ├── get-test-case-under-execution
│   │   │   │   └── route.ts
│   │   │   ├── update-test-case
│   │   │   │   └── route.ts
│   │   │   └── update-test-case-under-execution
│   │   │       └── route.ts
│   │   ├── context
│   │   │   └── product-context.ts
│   │   ├── (dashboard)
│   │   │   ├── access-denied
│   │   │   │   └── page.tsx
│   │   │   ├── (auth)
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── sign-in
│   │   │   │   │   └── [[...sign-in]]
│   │   │   │   │       └── page.tsx
│   │   │   │   └── sign-up
│   │   │   │       └── [[...sign-up]]
│   │   │   │           └── page.tsx
│   │   │   ├── _components
│   │   │   │   └── start-test-run-dialog.tsx
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx
│   │   │   ├── test-case-generator
│   │   │   │   ├── _components
│   │   │   │   │   ├── functionality.tsx
│   │   │   │   │   ├── RequestCard.tsx
│   │   │   │   │   ├── StatusBadge.tsx
│   │   │   │   │   ├── TestCard.tsx
│   │   │   │   │   └── TestCaseFrame.tsx
│   │   │   │   ├── layout.tsx
│   │   │   │   └── page.tsx
│   │   │   ├── test-case-history
│   │   │   │   └── page.tsx
│   │   │   ├── test-case-planning
│   │   │   │   └── page.tsx
│   │   │   ├── test-cases
│   │   │   │   ├── components
│   │   │   │   │   ├── add-test-case-dailog.tsx
│   │   │   │   │   ├── add-test-case-manually.tsx
│   │   │   │   │   ├── history-item.tsx
│   │   │   │   │   ├── screen-preview.tsx
│   │   │   │   │   ├── select-field.tsx
│   │   │   │   │   ├── test-case-card.tsx
│   │   │   │   │   ├── test-case-details-modal.tsx
│   │   │   │   │   └── test-case-frame.tsx
│   │   │   │   ├── [id]
│   │   │   │   │   └── page.tsx
│   │   │   │   └── page.tsx
│   │   │   ├── test-runs
│   │   │   │   ├── _components
│   │   │   │   │   ├── collapsible-section.tsx
│   │   │   │   │   ├── filter-bar.tsx
│   │   │   │   │   ├── header.tsx
│   │   │   │   │   ├── metrics-bar.tsx
│   │   │   │   │   ├── screen-preview.tsx
│   │   │   │   │   ├── test-case-card.tsx
│   │   │   │   │   ├── test-case-form.tsx
│   │   │   │   │   ├── test-history.tsx
│   │   │   │   │   ├── test-run-card.tsx
│   │   │   │   │   ├── test-section.tsx
│   │   │   │   │   └── time-section.tsx
│   │   │   │   ├── [id]
│   │   │   │   │   ├── detail
│   │   │   │   │   │   └── [detailId]
│   │   │   │   │   │       └── page.tsx
│   │   │   │   │   └── page.tsx
│   │   │   │   └── page.tsx
│   │   │   └── user-feedback
│   │   │       ├── _components
│   │   │       │   └── UserFeedbackCard.tsx
│   │   │       ├── layout.tsx
│   │   │       └── page.tsx
│   │   ├── globals.css
│   │   └── store
│   │       ├── featuresSlice.ts
│   │       ├── productSlice.ts
│   │       ├── store.ts
│   │       ├── testCaseSlice.ts
│   │       ├── testRunSlice.ts
│   │       └── testRunUnderExecutionSlice.ts
│   ├── components
│   │   ├── global
│   │   │   ├── AddProductDialog.tsx
│   │   │   ├── loading.tsx
│   │   │   ├── mode-toggle.tsx
│   │   │   └── product-dropdown.tsx
│   │   └── navigation
│   │       ├── index.tsx
│   │       ├── nav-item.tsx
│   │       └── side-nav-bar.tsx
│   ├── hooks
│   │   ├── use-backend.ts
│   │   ├── use-initial-data-fetch.ts
│   │   └── use-toast.ts
│   ├── lib
│   │   ├── constants.ts
│   │   ├── handleExpiredSessionToken.ts
│   │   ├── ProductList.ts
│   │   ├── types.ts
│   │   ├── urlUtlis.ts
│   │   └── utils.ts
│   ├── middleware.ts
│   └── providers
│       ├── data-provider.tsx
│       ├── product-provider.tsx
│       ├── redux-provider.tsx
│       └── theme-provider.tsx
├── tailwind.config.ts
├── tsconfig.json
└── tsconfig.tsbuildinfo
```

## **Test Case Generation Page**

The **AI TestCase Planning page** allows users to upload Figma frames, and execute automated tests.

## **Dashboard Page**

The **Dashboard** provides an overview of the selected product's testing information, including test cases and test runs.

## **Test Cases Page**

The **Test Cases** section allows users to view, manage, and update test cases associated with their selected product.

## **Test Runs Page**

The **Test Runs** page enables users to track and manage test runs, displaying execution results for each test case.

## **Test Cases Under Execution Page**

The **Test Cases Under Execution** page allows users to monitor execution status, review failures, and upload failure videos.

### **Features**

- **Product Selection:** Users can select a product from the side nav-bar to view relevant test cases and test runs.
- **Dashboard Overview:** Displays key testing metrics, including test case and test run counts.
- **AI Test Case Generation:** Users can upload Figma frames or screenshots to generate test cases automatically.
- **Test Case Management:** View, add, edit, and update test cases for each feature.
- **Test Run Management:** Monitor test runs, view details, and track execution progress.
- **Test Execution Status Tracking:** View test case execution results, including failures and success rates.
- **Failure Analysis:** Users can review failure videos, add notes, and update test statuses.
- **Automated Test Execution:** Run AI-powered tests using Figma frames with automatic UI detection.
- **Error Handling & Notifications:** Displays alerts and error messages using **Sonner** for better feedback.

## **Key Instructions**

- **Test Execution Mode:** Allows users to upload assets and execute tests.
- **API Endpoint:** A dedicated API will handle automated test execution.
- **Loading State:** Display a **spinner** or loading animation while waiting for test results.
- **Error Handling:** Use **Sonner** for displaying errors when the test execution fails.
