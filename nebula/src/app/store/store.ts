import { configureStore } from "@reduxjs/toolkit";
import productsReducer from "./productSlice";
import testCasesReducer from "./testCaseSlice";
import featuresReducer from "./featuresSlice";
import graphFeaturesReducer from "./graphFeaturesSlice";
import testRunsUnderExecutionReducer from "./testRunUnderExecutionSlice";
import testRunsReducer from "./testRunSlice";
import usersReducer from "./userSlice";
import credentialsReducer from "./credentialsSlice";
import testSuitesReducer from "./testSuiteSlice";
import videoUploadsReducer from "./videoUploadSlice";
import videoFlowQueueReducer from "./videoFlowQueueSlice";
import organizationsReducer from "./organizationSlice";
import jiraIntegrationReducer from "./jiraIntegrationSlice";
import tutorialReducer from "./tutorialSlice";

// Create the store
export const store = configureStore({
  reducer: {
    products: productsReducer,
    testCases: testCasesReducer,
    features: featuresReducer,
    graphFeatures: graphFeaturesReducer,
    testRunsUnderExecution: testRunsUnderExecutionReducer,
    testRuns: testRunsReducer,
    users: usersReducer,
    credentials: credentialsReducer,
    testSuites: testSuitesReducer,
    videoUploads: videoUploadsReducer,
    videoFlowQueue: videoFlowQueueReducer,
    organizations: organizationsReducer,
    jiraIntegration: jiraIntegrationReducer,
    tutorial: tutorialReducer,
  },
});

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
