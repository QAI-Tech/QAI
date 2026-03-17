// @ts-nocheck
import { Node } from "@xyflow/react";
import { Flow } from "@/app/(editor)/components/FlowManager";
import { isFlowReachableFromEntryPoint } from "./flowReachability";

// Helper function to create a node
const createNode = (id: string): Node => ({
  id,
  type: "default",
  position: { x: 0, y: 0 },
  data: { label: id },
});

// Helper function to create a flow
const createFlow = (id: string, name: string, nodeIds: string[]): Flow => {
  const nodes = nodeIds.map((nodeId) => createNode(nodeId));
  return {
    id,
    name,
    startNodeId: nodes[0].id,
    endNodeId: nodes[nodes.length - 1].id,
    viaNodeIds: nodes.slice(1, -1).map((n) => n.id),
    pathNodeIds: nodes.map((n) => n.id),
    videoUrl: undefined,
  };
};

// Simple test runner
function runTests() {
  console.log("Running Flow Reachability Tests...\n");

  let passed = 0;
  let total = 0;

  function test(name: string, testFn: () => void) {
    total++;
    try {
      testFn();
      console.log(`✅ ${name}`);
      passed++;
    } catch (error) {
      console.log(`❌ ${name}: ${error}`);
    }
  }

  function expect(actual: any) {
    return {
      toBe: (expected: any) => {
        if (actual !== expected) {
          throw new Error(`Expected ${expected}, got ${actual}`);
        }
      },
      toEqual: (expected: any) => {
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
          throw new Error(
            `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
          );
        }
      },
    };
  }

  const entryPoints = ["A"];

  test("should return true for flows that start at entry points", () => {
    const flows = [createFlow("flow1", "Flow 1", ["A", "B", "C"])];

    const result = isFlowReachableFromEntryPoint(flows[0], flows, entryPoints);
    expect(result.isReachable).toBe(true);
    expect(result.flowChain).toEqual([flows[0]]);
  });

  test("should return true for flows reachable through one intermediate flow", () => {
    const flows = [
      createFlow("flow1", "Flow 1", ["A", "B"]),
      createFlow("flow2", "Flow 2", ["B", "C"]),
    ];

    const result = isFlowReachableFromEntryPoint(flows[1], flows, entryPoints);
    expect(result.isReachable).toBe(true);
    expect(result.flowChain).toEqual([flows[0], flows[1]]);
  });

  test("should return true for flows reachable through multiple intermediate flows", () => {
    const flows = [
      createFlow("flow1", "Flow 1", ["A", "B"]),
      createFlow("flow2", "Flow 2", ["B", "C"]),
      createFlow("flow3", "Flow 3", ["C", "D"]),
    ];

    const result = isFlowReachableFromEntryPoint(flows[2], flows, entryPoints);
    expect(result.isReachable).toBe(true);
    expect(result.flowChain).toEqual([flows[0], flows[1], flows[2]]);
  });

  test("should return false for flows that are not reachable from any entry point", () => {
    const flows = [
      createFlow("flow1", "Flow 1", ["A", "B"]),
      createFlow("flow2", "Flow 2", ["D", "E"]),
    ];

    const result = isFlowReachableFromEntryPoint(flows[1], flows, entryPoints);
    expect(result.isReachable).toBe(false);
    expect(result.flowChain).toEqual([]);
  });

  test("should handle circular dependencies without infinite loop", () => {
    const flows = [
      createFlow("flow1", "Flow 1", ["A", "B"]),
      createFlow("flow2", "Flow 2", ["B", "C"]),
      createFlow("flow3", "Flow 3", ["C", "B"]),
    ];

    const result = isFlowReachableFromEntryPoint(flows[2], flows, entryPoints);
    expect(result.isReachable).toBe(true);
  });

  test("should handle isolated circular dependencies", () => {
    const flows = [
      createFlow("flow1", "Flow 1", ["A", "B"]),
      createFlow("flow2", "Flow 2", ["D", "E"]),
      createFlow("flow3", "Flow 3", ["E", "D"]),
    ];

    const result = isFlowReachableFromEntryPoint(flows[2], flows, entryPoints);
    expect(result.isReachable).toBe(false);
    expect(result.flowChain).toEqual([]);
  });

  test("should handle empty flows", () => {
    const flows = [createFlow("flow1", "Flow 1", [])];

    const result = isFlowReachableFromEntryPoint(flows[0], flows, entryPoints);
    expect(result.isReachable).toBe(false);
    expect(result.flowChain).toEqual([]);
  });

  test("should handle multiple entry points", () => {
    const multipleEntryPoints = ["A", "D"];
    const flows = [
      createFlow("flow1", "Flow 1", ["A", "B"]),
      createFlow("flow2", "Flow 2", ["D", "E"]),
      createFlow("flow3", "Flow 3", ["B", "C"]),
      createFlow("flow4", "Flow 4", ["E", "C"]),
    ];

    expect(
      isFlowReachableFromEntryPoint(flows[2], flows, multipleEntryPoints)
        .isReachable,
    ).toBe(true);
    expect(
      isFlowReachableFromEntryPoint(flows[3], flows, multipleEntryPoints)
        .isReachable,
    ).toBe(true);
  });

  console.log(`\nTests completed: ${passed}/${total} passed`);

  if (passed === total) {
    console.log("🎉 All tests passed!");
  } else {
    console.log("❌ Some tests failed");
  }
}

// Uncomment to run tests in development
// runTests();
