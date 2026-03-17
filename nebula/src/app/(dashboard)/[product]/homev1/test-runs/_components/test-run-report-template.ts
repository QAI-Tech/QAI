import { TestCaseUnderExecutionSchema } from "@/lib/types";

interface TestRunMetrics {
  total: number;
  progress: number;
  passed: number;
  failed: number;
  untested: number;
}

export const generateTestRunReport = (
  testRunTitle: string,
  metrics: TestRunMetrics,
  failedTestCases: TestCaseUnderExecutionSchema[],
  testRunLink: string,
): string => {
  // Helper: text progress bar
  const progressBar = (progress: number): string => {
    const totalBlocks = 20;
    const filledBlocks = Math.round((progress / 100) * totalBlocks);
    const emptyBlocks = totalBlocks - filledBlocks;
    return `█`.repeat(filledBlocks) + `░`.repeat(emptyBlocks);
  };

  const caseWord = metrics.total === 1 ? "test case" : "test cases";

  let summaryMessage = `> **Summary:** ${metrics.total} ${caseWord} executed with overall progress of **${metrics.progress}%**.\n`;

  if (metrics.total > 0) {
    if (metrics.passed === metrics.total) {
      summaryMessage = `> 🎉 All **${metrics.total} ${caseWord} passed**! Excellent work.\n`;
    } else if (metrics.failed === metrics.total) {
      summaryMessage = `> 🔥 All **${metrics.total} ${caseWord} failed**. Needs immediate attention!\n`;
    } else if (metrics.untested === metrics.total) {
      summaryMessage = `> ⏳ All **${metrics.total} ${caseWord} are untested**. Execution pending.\n`;
    } else {
      summaryMessage = `> 📊 Out of **${metrics.total} ${caseWord}**, ${metrics.passed} passed, ${metrics.failed} failed, and ${metrics.untested} untested.\n`;
    }
  }

  // Failed section heading
  let failedHeading = "";
  if (metrics.failed === 0) {
    failedHeading = "## ✅ No Failures";
  } else if (metrics.failed === 1) {
    failedHeading = "## ❌ Failed Test Case";
  } else {
    failedHeading = "## ❌ Failed Test Cases";
  }

  const markdownContent = [
    `# 📊 ${testRunTitle} - Test Run Report\n`,
    summaryMessage,
    `## 🚀 Test Progress\n`,
    `\`\`\``,
    `[${progressBar(metrics.progress)}] ${metrics.progress}%`,
    `Total Test Cases: ${metrics.total}`,
    `\`\`\`\n`,
    `[🔗 View Test Run](${testRunLink})\n`,
    `## 📌 Test Results\n`,
    `| Status | Count |`,
    `|--------|-------|`,
    `| ✅ Passed | ${metrics.passed} |`,
    `| ❌ Failed | ${metrics.failed} |`,
    `| ⏳ Untested | ${metrics.untested} |\n`,
    `---\n`,
    failedHeading,
  ];

  if (failedTestCases.length > 0) {
    markdownContent.push(
      `\n### 🔍 Details\n`,
      `| Test Case ID | Description | Notes |`,
      `|--------------|-------------|-------|`,
      ...failedTestCases.map((tc) => {
        const description = tc.test_case_description
          .replace(/\|/g, "\\|")
          .replace(/\n/g, "<br>");
        const notes = (tc.notes || "")
          .replace(/\|/g, "\\|")
          .replace(/\n/g, "<br>");
        return `| ${tc.test_case_id} | ${description} | ${notes || "-"} |`;
      }),
      "\n",
      `[🔗 View Test Run](${testRunLink})\n`,
    );
  } else {
    markdownContent.push("\n✨ No failed test cases in this run. 🎉\n");
  }

  markdownContent.push(
    `---`,
    `\n_Report generated on **${new Date().toUTCString()}**_`,
  );

  return markdownContent.join("\n");
};
