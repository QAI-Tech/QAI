import React, { useCallback, useRef } from "react";
import { Node, Edge, MarkerType } from "@xyflow/react";
import { useToast } from "@/hooks/use-toast";
import { Flow, TestCasePlanningRequest } from "./FlowManager";
import {
  GRAPH_BUCKET_NAME,
  GRAPH_COLLABORATION_SERVER_URL,
} from "@/lib/constants";
import { compressBase64ImageToJpeg } from "@/app/(editor)/utils/imageCompressor";
import { useCommentManagement } from "../hooks/useCommentManagement";
import { Comment } from "../types/commentTypes";
import { ConsoleCollaborationEvents } from "../types/collaborationEvents";

interface FileOperationsProps {
  // State
  nodes: Node[];
  edges: Edge[];
  flows: Flow[];

  // State setters
  setNodes: (nodes: Node[] | ((nodes: Node[]) => Node[])) => void;
  setEdges: (edges: Edge[] | ((edges: Edge[]) => Edge[])) => void;
  addNewNodes: (nodes: Node[]) => void;
  setFlows: (flows: Flow[] | ((flows: Flow[]) => Flow[])) => void;
  setNodeCounter: (counter: number) => void;
  setEdgeCounter: (counter: number) => void;
  productId: string;
  featureManagement: any;
  commentManagement: ReturnType<typeof useCommentManagement>;
  path?: string;
  flowPath?: string;
  setFailedVideoToFlowRequests: (
    failedVideoToFlowRequests: TestCasePlanningRequest[],
  ) => void;
}

export const useFileOperations = (props: FileOperationsProps) => {
  const { toast } = useToast();
  const importInputRef = useRef<HTMLInputElement>(null);

  const {
    nodes,
    edges,
    flows,
    setNodes,
    setEdges,
    addNewNodes,
    setFlows,
    setNodeCounter,
    setEdgeCounter,
    productId,
    featureManagement,
    commentManagement,
    path,
    flowPath,
    setFailedVideoToFlowRequests,
  } = props;

  const importFailedVideoToFlowRequests = useCallback(async () => {
    if (!productId) {
      console.log("Btw i am also triggered");
      return;
    }
    console.log("Logging productId from here: ", productId);
    try {
      const response = await fetch(
        `/api/get-test-case-planning-requests-by-product-id?productId=${productId}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        throw new Error("Failed to fetch test cases");
      }

      if (response.status === 401) {
        console.warn(
          "Session token expired, logging out the user to regenerate token",
        );
      }

      const result = await response.json();
      if (result?.test_case_planning_requests) {
        const failedRequests = result.test_case_planning_requests.filter(
          (req: any) => req.status === "FAILED",
        );
        setFailedVideoToFlowRequests(failedRequests);
      }
    } catch (error) {
      console.error("Failed to import failed video to flow requests", error);
    }
  }, [productId, setFailedVideoToFlowRequests]);

  const importGraphFromData = useCallback(
    async (graphData: any) => {
      if (graphData.nodes && graphData.edges) {
        const importedNodes = graphData.nodes.map((node: any) => ({
          ...node,
          type: "customNode",
          deletable: true,
          position: node.originalPosition || node.position,
          data: {
            ...node.data,
            ...(node.originalPosition && {
              originalPosition: node.originalPosition,
            }),
            ...(node.isCollapsed !== undefined && {
              isCollapsed: node.isCollapsed,
            }),
          },
        }));

        const importedEdges = graphData.edges.map((edge: any) => ({
          ...edge,
          type: "customEdge",
          // Map source_anchor and target_anchor to sourceHandle and targetHandle
          sourceHandle:
            edge.data?.source_anchor || edge.sourceHandle || "right-source",
          targetHandle:
            edge.data?.target_anchor || edge.targetHandle || "left-target",
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 20,
            height: 20,
          },
        }));

        setNodes(importedNodes);
        setEdges(importedEdges);

        // Emit collaboration events for imported nodes and edges
        // const collaborationEvents =
        //   ConsoleCollaborationEvents.initializeForProduct(productId);

        // Emit node creation events

        const maxNodeId = Math.max(
          ...importedNodes.map((n: any) => {
            const match = n.id.match(/node-(\d+)/);
            return match ? parseInt(match[1]) : 0;
          }),
          0,
        );
        const maxEdgeId = Math.max(
          ...importedEdges.map((e: any) => {
            const match = e.id.match(/edge-(\d+)/);
            return match ? parseInt(match[1]) : 0;
          }),
          0,
        );

        setNodeCounter(maxNodeId + 1);
        setEdgeCounter(maxEdgeId + 1);
        return importedNodes;
      } else {
        throw new Error("Invalid file format");
      }
    },
    [setNodes, setEdges, setNodeCounter, setEdgeCounter],
  );

  const importFlowsFromData = useCallback(
    async (importedFlows: any[], currentNodes: Node[]) => {
      if (!importedFlows || !Array.isArray(importedFlows)) return;

      const newFlows = importedFlows
        .map((flowData: any) => {
          // Handle both old and new export formats
          const startNodeId = flowData.startNodeId || flowData.startNode?.id;
          const endNodeId = flowData.endNodeId || flowData.endNode?.id;
          const precondition = flowData?.precondition || "";
          const viaNodeIds =
            flowData.viaNodeIds ||
            flowData.viaNodes?.map((vn: any) => vn.id) ||
            [];
          const pathNodeIds =
            flowData.pathNodeIds ||
            flowData.nodeSequence?.map((ns: any) => ns.id) ||
            [];

          // Validate that referenced nodes exist
          const startNodeExists = currentNodes.some(
            (n) => n.id === startNodeId,
          );
          const endNodeExists = currentNodes.some((n) => n.id === endNodeId);
          const allViaNodesExist = viaNodeIds.every((id: string) =>
            currentNodes.some((n) => n.id === id),
          );
          const allPathNodesExist = pathNodeIds.every((id: string) =>
            currentNodes.some((n) => n.id === id),
          );

          if (
            !startNodeExists ||
            !endNodeExists ||
            !allViaNodesExist ||
            !allPathNodesExist
          ) {
            console.log(`startNodeExists: ${startNodeExists}`);
            console.log(`endNodeExists: ${endNodeExists}`);
            console.log(`allViaNodesExist: ${allViaNodesExist}`);
            console.log(`allPathNodesExist: ${allPathNodesExist}`);
            console.warn(
              `Flow "${flowData.name}" references nodes that don't exist in the current graph.`,
            );
            return null;
          }

          return {
            id: flowData.id,
            name: flowData.name,
            startNodeId,
            endNodeId,
            viaNodeIds,
            pathNodeIds,
            precondition,
            description: flowData.description || "",
            scenarios: flowData.scenarios,
            credentials: flowData.credentials || [],
            ...(flowData.videoUrl && { videoUrl: flowData.videoUrl }),
            // Preserve autoPlan if it exists in imported data
            ...(flowData.autoPlan !== undefined && {
              autoPlan: flowData.autoPlan,
            }),
            // Preserve videoUrl if it exists in imported data
            ...(flowData.videoUrl !== undefined && {
              videoUrl: flowData.videoUrl,
            }),
            ...(flowData.feature_id !== undefined && {
              feature_id: flowData.feature_id,
            }),
          };
        })
        .filter((flow: any) => flow !== null);

      setFlows(newFlows);
    },
    [setFlows],
  );

  const importCommentsFromData = useCallback(
    async (commentsData: any) => {
      if (commentsData.comments && Array.isArray(commentsData.comments)) {
        // Import comments into state
        commentManagement.importComments(JSON.stringify(commentsData.comments));

        // Create comment nodes on the canvas
        const commentNodes = commentsData.comments.map(
          (comment: Comment & { position?: { x: number; y: number } }) => ({
            id: `comment-${comment.id}`,
            type: "commentNode",
            position: comment.position || { x: 0, y: 0 },
            data: {
              content: comment.content,
              commentId: comment.id,
            },
          }),
        );

        // Add comment nodes to existing nodes
        setNodes((currentNodes) => [
          ...currentNodes.filter((node) => node.type !== "commentNode"), // Remove existing comment nodes to avoid duplicates
          ...commentNodes,
        ]);

        console.log(
          "Comments imported successfully:",
          commentsData.comments.length,
        );
      }
    },
    [commentManagement, setNodes],
  );

  const importFeaturesFromData = useCallback(
    async (featuresData: any) => {
      if (featuresData.features && Array.isArray(featuresData.features)) {
        featureManagement.setAllFeatures(featuresData.features);
        toast({
          title: "Successfully imported graph",
          description: `Successfully imported graph feature(s) from GCMS.`,
        });
      }
    },
    [featureManagement, toast],
  );

  const importGraphFromGcms = useCallback(async () => {
    if (!productId) return;
    try {
      const response = await fetch(
        `${GRAPH_COLLABORATION_SERVER_URL}/api/graph-events/graph?product_id=${productId}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        throw new Error("Failed to fetch graph data from GCMS");
      }

      const graph = await response.json();
      const graphData = graph.graph;
      const flowsData = graph.flows;
      const commentsData = graph.comments;
      const featureData = graph.features;
      const importedNodes = await importGraphFromData(graphData);
      if (importedNodes) {
        await importFlowsFromData(flowsData, importedNodes);
      }
      await importCommentsFromData(commentsData);
      await importFeaturesFromData(featureData);
    } catch (error: any) {
      toast({
        title: "Import failed",
        description: error.message || "Failed to import graph from GCMS.",
        variant: "destructive",
      });
    }
  }, [
    productId,
    setNodes,
    setEdges,
    setNodeCounter,
    setEdgeCounter,
    toast,
    importGraphFromData,
    importFlowsFromData,
    importCommentsFromData,
    importFeaturesFromData,
  ]);
  // Helper function to extract exportable nodes (duplicate code extraction)
  const getExportableNodes = useCallback((nodes: Node[]) => {
    return nodes
      .filter((node) => node.type === "customNode")
      .map((node) => ({
        id: node.id,
        type: node.type,
        position: node.position,
        data: node.data,
        // Preserve all node properties including originalPosition
        ...(node.data &&
          typeof node.data === "object" &&
          "originalPosition" in node.data && {
            originalPosition: (node.data as any).originalPosition,
          }),
        ...(node.data &&
          typeof node.data === "object" &&
          "isCollapsed" in node.data && {
            isCollapsed: (node.data as any).isCollapsed,
          }),
      }));
  }, []);

  const safeMin = (arr?: number[]) => {
    if (!Array.isArray(arr) || arr.length === 0) {
      console.warn("safeMin called with empty or non-array input");
      return 0;
    }
    const val = Math.min(...arr);
    return val === Infinity || val === -Infinity ? 0 : val;
  };

  const safeMax = (arr?: number[]) => {
    if (!Array.isArray(arr) || arr.length === 0) {
      console.warn("safeMin called with empty or non-array input");
      return 0;
    }
    const val = Math.max(...arr);
    return val === Infinity || val === -Infinity ? 0 : val;
  };

  const exportFeaturesAutomatically = useCallback(
    async (request_id?: string) => {
      if (!productId) {
        return;
      }
      const data = {
        features: featureManagement.features,
        exportedAt: new Date().toISOString(),
      };
      const name =
        typeof request_id === "string"
          ? `${request_id}/features-export.json`
          : "features-export.json";
      const uploadPath = `productId_${productId}/${name}`;
      console.log("Exporting graph to:", uploadPath);
      const signedUrlResponse = await fetch(
        `/api/generate-instructions?getSignedUrl=true&bucketName=${GRAPH_BUCKET_NAME}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: uploadPath,
            contentType: "application/json",
          }),
        },
      );
      if (!signedUrlResponse.ok) {
        throw new Error("Failed to get signed URL for export");
      }
      const { signedUrl, fileName: jsonFileName } =
        await signedUrlResponse.json();
      console.log("SignedURL:", { signedUrl });
      const fileName = jsonFileName.replace("gs://", "");
      console.log("File Name:", fileName);
      const uploadResponse = await fetch(signedUrl, {
        method: "PUT",
        body: JSON.stringify(data),
        headers: {
          "Content-Type": "application/json",
        },
        mode: "cors",
      });
      console.log("Upload Response:", uploadResponse);
      if (!request_id) {
        toast({
          title: "Graph exported successfully",
          description: "All your graph has been exported.",
        });
      }
    },
    [featureManagement, productId],
  );

  const importFeaturesAutomatically = useCallback(async () => {
    if (!productId) {
      return;
    }
    if (path && flowPath) {
      return;
    }
    try {
      const gcsFilePath = `${GRAPH_BUCKET_NAME}/qai-upload-temporary/productId_${productId}/features-export.json`;

      const response = await fetch(
        `/api/generate-signed-url-for-frame?framePath=${gcsFilePath}`,
      );
      if (!response.ok) {
        throw new Error("Failed to get signed URL for import");
      }

      const { signedUrl } = await response.json();
      let flowsResponse: Response;
      try {
        flowsResponse = await fetch(signedUrl);
        if (flowsResponse.status === 404) {
          toast({
            title: "Fresh start",
            description:
              "No features found. Go ahead and build your first graph.",
          });
          return; // ✅ Exit early to avoid triggering "Import failed"
        }

        if (!flowsResponse.ok) {
          throw new Error("Failed to fetch flows data from GCS");
        }

        const data = await flowsResponse.json();

        if (data.features && Array.isArray(data.features)) {
          featureManagement.setAllFeatures(data.features);

          // Emit collaboration events for imported features
          // const collaborationEvents =
          //   ConsoleCollaborationEvents.initializeForProduct(productId);
          // collaborationEvents.createFeatures(data.features, "IMPORT_USER");

          toast({
            title: "Successfully imported graph",
            description: `Successfully imported graph feature(s) from GCS.`,
          });
        }
      } catch (innerError: any) {
        // Only handles fetch or JSON parse failures from signed URL
        toast({
          title: "Import failed",
          description:
            innerError?.message || "Failed to fetch features from GCS.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Import failed",
        description: error.message || "Failed to import features from GCS.",
        variant: "destructive",
      });
    }
  }, [featureManagement, toast, productId, path, flowPath]);

  const exportFlowsAutomatically = useCallback(
    async (request_id?: string) => {
      if (!productId) {
        return;
      }
      const flowsData = flows.map((flow) => ({
        id: flow.id,
        name: flow.name,
        startNodeId: flow.startNodeId,
        endNodeId: flow.endNodeId,
        viaNodeIds: flow.viaNodeIds,
        pathNodeIds: flow.pathNodeIds,
        precondition: flow.precondition,
        description: flow.description || "",
        scenarios: flow.scenarios,
        credentials: flow.credentials,
        ...(flow.autoPlan !== undefined && { autoPlan: flow.autoPlan }),
        ...(flow.videoUrl !== undefined && { videoUrl: flow.videoUrl }),
        ...(flow.feature_id !== undefined && { feature_id: flow.feature_id }),
      }));
      let uploadPath;
      if (flowPath) {
        uploadPath = `${flowPath?.slice(21)}`;
      } else {
        const name =
          typeof request_id === "string"
            ? `${request_id}/flows-export.json`
            : "flows-export.json";
        uploadPath = `productId_${productId}/${name}`;
      }
      console.log("Exporting graph to:", uploadPath);
      const signedUrlResponse = await fetch(
        `/api/generate-instructions?getSignedUrl=true&bucketName=${GRAPH_BUCKET_NAME}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: uploadPath,
            contentType: "application/json",
          }),
        },
      );
      if (!signedUrlResponse.ok) {
        throw new Error("Failed to get signed URL for export");
      }
      const { signedUrl, fileName: jsonFileName } =
        await signedUrlResponse.json();
      console.log("SignedURL:", { signedUrl });
      const fileName = jsonFileName.replace("gs://", "");
      console.log("File Name:", fileName);
      const uploadResponse = await fetch(signedUrl, {
        method: "PUT",
        body: JSON.stringify(flowsData),
        headers: {
          "Content-Type": "application/json",
        },
        mode: "cors",
      });
      console.log("Upload Response:", uploadResponse);
    },
    [flows, toast, productId, path, flowPath],
  );

  const importFlowsAutomatically = useCallback(async () => {
    if (!productId) return;

    try {
      let gcsFilePath;
      if (flowPath) {
        gcsFilePath = `${GRAPH_BUCKET_NAME}/${flowPath}`;
      } else {
        gcsFilePath = `${GRAPH_BUCKET_NAME}/qai-upload-temporary/productId_${productId}/flows-export.json`;
      }

      const response = await fetch(
        `/api/generate-signed-url-for-frame?framePath=${gcsFilePath}`,
      );
      if (!response.ok) {
        throw new Error("Failed to get signed URL for import");
      }

      const { signedUrl } = await response.json();

      let flowsResponse: Response;
      try {
        flowsResponse = await fetch(signedUrl);

        if (flowsResponse.status === 404) {
          toast({
            title: "Fresh start",
            description: "No flows found. Go ahead and build your first graph.",
          });
          return;
        }

        if (!flowsResponse.ok) {
          throw new Error("Failed to fetch flows data from GCS");
        }

        const importedFlows = await flowsResponse.json();

        const newFlows = importedFlows
          .map((flowData: any) => {
            // Handle both old and new export formats
            const startNodeId = flowData.startNodeId || flowData.startNode?.id;
            const endNodeId = flowData.endNodeId || flowData.endNode?.id;
            const precondition = flowData?.precondition || "";
            const viaNodeIds =
              flowData.viaNodeIds ||
              flowData.viaNodes?.map((vn: any) => vn.id) ||
              [];
            const pathNodeIds =
              flowData.pathNodeIds ||
              flowData.nodeSequence?.map((ns: any) => ns.id) ||
              [];

            // Validate that referenced nodes exist
            const startNodeExists = nodes.some((n) => n.id === startNodeId);
            const endNodeExists = nodes.some((n) => n.id === endNodeId);
            const allViaNodesExist = viaNodeIds.every((id: string) =>
              nodes.some((n) => n.id === id),
            );
            const allPathNodesExist = pathNodeIds.every((id: string) =>
              nodes.some((n) => n.id === id),
            );

            if (
              !startNodeExists ||
              !endNodeExists ||
              !allViaNodesExist ||
              !allPathNodesExist
            ) {
              console.warn(
                `Flow "${flowData.name}" references nodes that don't exist in the current graph.`,
              );
              return null;
            }

            return {
              id: flowData.id,
              name: flowData.name,
              startNodeId,
              endNodeId,
              viaNodeIds,
              pathNodeIds,
              precondition,
              ...(flowData.description && {
                description: flowData.description,
              }),
              scenarios: flowData.scenarios,
              credentials: flowData.credentials || [],
              ...(flowData.videoUrl && { videoUrl: flowData.videoUrl }),
              // Preserve autoPlan if it exists in imported data
              ...(flowData.autoPlan !== undefined && {
                autoPlan: flowData.autoPlan,
              }),
              // Preserve videoUrl if it exists in imported data
              ...(flowData.videoUrl !== undefined && {
                videoUrl: flowData.videoUrl,
              }),
              ...(flowData.feature_id !== undefined && {
                feature_id: flowData.feature_id,
              }),
            };
          })
          .filter((flow: any) => flow !== null);

        setFlows((existingFlows) => [...existingFlows, ...newFlows]);

        // Emit collaboration events for imported flows
        // const collaborationEvents =
        //   ConsoleCollaborationEvents.initializeForProduct(productId);
        // collaborationEvents.createFlows(newFlows, "IMPORT_USER");
      } catch (innerError: any) {
        console.log("Import failed:", innerError);
        toast({
          title: "Import failed here",
          description: innerError?.message || "Failed to fetch flows from GCS.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Import failed no here",
        description: error.message || "Failed to get signed URL.",
        variant: "destructive",
      });
    }
  }, [nodes, setFlows, toast, productId, path, flowPath]);

  const exportGraphAutomatically = useCallback(
    async (request_id?: string) => {
      if (!productId) {
        return;
      }
      const graphData = {
        nodes: getExportableNodes(nodes),
        edges: edges.map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle,
          type: edge.type,
          data: edge.data,
        })),
      };

      const dataStr = JSON.stringify(graphData, null, 2);
      const dataUri =
        "data:application/json;charset=utf-8," + encodeURIComponent(dataStr);

      let uploadPath;
      if (path) {
        uploadPath = `${path.slice(21)}`;
      } else {
        const exportFileDefaultName =
          typeof request_id === "string"
            ? `${request_id}/graph-export.json`
            : "graph-export.json";
        uploadPath = `productId_${productId}/${exportFileDefaultName}`;
      }
      console.log("Exporting graph to:", uploadPath);
      const signedUrlResponse = await fetch(
        `/api/generate-instructions?getSignedUrl=true&bucketName=${GRAPH_BUCKET_NAME}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: uploadPath,
            contentType: "application/json",
          }),
        },
      );
      if (!signedUrlResponse.ok) {
        throw new Error("Failed to get signed URL for export");
      }
      const { signedUrl, fileName: jsonFileName } =
        await signedUrlResponse.json();
      console.log("SignedURL:", { signedUrl });
      const fileName = jsonFileName.replace("gs://", "");
      console.log("File Name:", fileName);
      const uploadResponse = await fetch(signedUrl, {
        method: "PUT",
        body: JSON.stringify(graphData),
        headers: {
          "Content-Type": "application/json",
        },
        mode: "cors",
      });
      console.log("Upload Response:", uploadResponse);
    },
    [nodes, edges, toast, productId, path, getExportableNodes],
  );

  const exportCommentsAutomatically = useCallback(
    async (request_id?: string) => {
      if (!productId) {
        return;
      }

      // Get comment nodes from ReactFlow to extract current positions
      const commentNodes = nodes.filter((node) => node.type === "commentNode");

      // Only export comments that have corresponding ReactFlow nodes
      // This ensures deleted comments don't get saved
      const commentsWithPositions = commentManagement.comments
        .filter((comment) => {
          const hasCorrespondingNode = commentNodes.some(
            (node) => node.data?.commentId === comment.id,
          );
          return hasCorrespondingNode;
        })
        .map((comment) => {
          const correspondingNode = commentNodes.find(
            (node) => node.data?.commentId === comment.id,
          );
          return {
            ...comment,
            // Use the content from the ReactFlow node data (which is updated when user edits)
            content: correspondingNode?.data?.content || comment.content,
            position: correspondingNode?.position || { x: 0, y: 0 }, // fallback position
          };
        });

      const commentsData = {
        comments: commentsWithPositions,
        exportedAt: new Date().toISOString(),
      };

      console.log("Exporting comments with data:", commentsWithPositions);
      const fileName =
        typeof request_id === "string"
          ? `${request_id}/comments.json`
          : "comments.json";
      const uploadPath = `productId_${productId}/${fileName}`;
      console.log("Exporting comments to:", uploadPath);

      try {
        const signedUrlResponse = await fetch(
          `/api/generate-instructions?getSignedUrl=true&bucketName=${GRAPH_BUCKET_NAME}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileName: uploadPath,
              contentType: "application/json",
            }),
          },
        );

        if (!signedUrlResponse.ok) {
          throw new Error("Failed to get signed URL for comment export");
        }

        const { signedUrl, fileName: jsonFileName } =
          await signedUrlResponse.json();
        console.log("Comments SignedURL:", { signedUrl });

        const uploadResponse = await fetch(signedUrl, {
          method: "PUT",
          body: JSON.stringify(commentsData),
          headers: {
            "Content-Type": "application/json",
          },
          mode: "cors",
        });

        console.log("Comments Upload Response:", uploadResponse);
      } catch (error) {
        console.error("Error exporting comments:", error);
        toast({
          title: "Comment export failed",
          description:
            error instanceof Error
              ? error.message
              : "Failed to export comments",
          variant: "destructive",
        });
      }
    },
    [nodes, commentManagement.comments, toast, productId, path, flowPath],
  );

  const importGraphAutomatically = useCallback(async () => {
    if (!productId) return;

    try {
      let gcsFilePath;
      if (path) {
        gcsFilePath = `${GRAPH_BUCKET_NAME}/${path}`;
      } else {
        gcsFilePath = `${GRAPH_BUCKET_NAME}/qai-upload-temporary/productId_${productId}/graph-export.json`;
      }

      const response = await fetch(
        `/api/generate-signed-url-for-frame?framePath=${gcsFilePath}`,
      );
      if (!response.ok) {
        throw new Error("Failed to get signed URL for import");
      }

      const { signedUrl } = await response.json();

      let graphResponse: Response;
      try {
        graphResponse = await fetch(signedUrl);

        if (graphResponse.status === 404) {
          toast({
            title: "Fresh start",
            description: "No graph found. Go ahead and build your first graph.",
          });
          return;
        }

        if (!graphResponse.ok) {
          throw new Error("Failed to fetch graph data from GCS");
        }

        const graphData = await graphResponse.json();

        if (graphData.nodes && graphData.edges) {
          const importedNodes = graphData.nodes.map((node: any) => ({
            ...node,
            type: "customNode",
            deletable: true,
            position: node.originalPosition || node.position,
            data: {
              ...node.data,
              ...(node.originalPosition && {
                originalPosition: node.originalPosition,
              }),
              ...(node.isCollapsed !== undefined && {
                isCollapsed: node.isCollapsed,
              }),
            },
          }));

          const importedEdges = graphData.edges.map((edge: any) => ({
            ...edge,
            type: "customEdge",
            // Map source_anchor and target_anchor to sourceHandle and targetHandle
            sourceHandle:
              edge.data?.source_anchor || edge.sourceHandle || "right-source",
            targetHandle:
              edge.data?.target_anchor || edge.targetHandle || "left-target",
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 20,
              height: 20,
            },
          }));

          setNodes(importedNodes);
          setEdges(importedEdges);

          // Emit collaboration events for imported nodes and edges
          // const collaborationEvents =
          //   ConsoleCollaborationEvents.initializeForProduct(productId);

          // Emit node creation events

          const maxNodeId = Math.max(
            ...importedNodes.map((n: any) => {
              const match = n.id.match(/node-(\d+)/);
              return match ? parseInt(match[1]) : 0;
            }),
            0,
          );
          const maxEdgeId = Math.max(
            ...importedEdges.map((e: any) => {
              const match = e.id.match(/edge-(\d+)/);
              return match ? parseInt(match[1]) : 0;
            }),
            0,
          );

          setNodeCounter(maxNodeId + 1);
          setEdgeCounter(maxEdgeId + 1);
        } else {
          throw new Error("Invalid file format");
        }
      } catch (innerError: any) {
        toast({
          title: "Import failed",
          description: innerError?.message || "Failed to fetch graph from GCS.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Import failed",
        description: error.message || "Failed to get signed URL.",
        variant: "destructive",
      });
    }
  }, [
    setNodes,
    setEdges,
    toast,
    setNodeCounter,
    setEdgeCounter,
    productId,
    path,
  ]);

  const importCommentsAutomatically = useCallback(async () => {
    if (!productId) return;
    if (path && flowPath) {
      return;
    }

    try {
      const gcsFilePath = `${GRAPH_BUCKET_NAME}/qai-upload-temporary/productId_${productId}/comments.json`;

      const response = await fetch(
        `/api/generate-signed-url-for-frame?framePath=${gcsFilePath}`,
      );
      if (!response.ok) {
        throw new Error("Failed to get signed URL for comment import");
      }

      const { signedUrl } = await response.json();

      let commentsResponse: Response;
      try {
        commentsResponse = await fetch(signedUrl);

        if (commentsResponse.status === 404) {
          // No comments file exists yet, this is normal for new products
          console.log("No comments file found, starting fresh");
          return;
        }

        if (!commentsResponse.ok) {
          throw new Error("Failed to fetch comments from storage");
        }

        const commentsData = await commentsResponse.json();

        if (commentsData.comments && Array.isArray(commentsData.comments)) {
          // Import comments into state
          commentManagement.importComments(
            JSON.stringify(commentsData.comments),
          );

          // Create comment nodes on the canvas
          const commentNodes = commentsData.comments.map(
            (comment: Comment & { position?: { x: number; y: number } }) => ({
              id: `comment-${comment.id}`,
              type: "commentNode",
              position: comment.position,
              data: {
                content: comment.content,
                commentId: comment.id,
              },
            }),
          );

          // Add comment nodes to existing nodes
          setNodes((currentNodes) => [
            ...currentNodes.filter((node) => node.type !== "commentNode"), // Remove existing comment nodes to avoid duplicates
            ...commentNodes,
          ]);

          console.log(
            "Comments imported successfully:",
            commentsData.comments.length,
          );
        }
      } catch (fetchError) {
        console.error("Error fetching comments:", fetchError);
        throw fetchError;
      }
    } catch (error: any) {
      console.error("Error importing comments:", error);
      // Don't show error toast for 404s or missing files - this is normal
      if (
        !error.message?.includes("404") &&
        !error.message?.includes("Failed to get signed URL")
      ) {
        toast({
          title: "Comment import failed",
          description: error.message || "Failed to import comments",
          variant: "destructive",
        });
      }
    }
  }, [commentManagement, setNodes, toast, productId, path, flowPath]);

  const exportFlows = useCallback(() => {
    const flowsData = flows.map((flow) => ({
      id: flow.id,
      name: flow.name,
      startNodeId: flow.startNodeId,
      endNodeId: flow.endNodeId,
      viaNodeIds: flow.viaNodeIds,
      pathNodeIds: flow.pathNodeIds,
      precondition: flow.precondition,
      description: flow.description || "",
      scenarios: flow.scenarios,
      credentials: flow.credentials,
      ...(flow.autoPlan !== undefined && { autoPlan: flow.autoPlan }),
      ...(flow.videoUrl !== undefined && { videoUrl: flow.videoUrl }),
      ...(flow.feature_id !== undefined && { feature_id: flow.feature_id }),
    }));

    const dataStr = JSON.stringify(flowsData, null, 2);
    const dataUri =
      "data:application/json;charset=utf-8," + encodeURIComponent(dataStr);

    const exportFileDefaultName = "flows-export.json";

    const linkElement = document.createElement("a");
    linkElement.setAttribute("href", dataUri);
    linkElement.setAttribute("download", exportFileDefaultName);
    linkElement.click();

    toast({
      title: "Flows exported",
      description: "Your flows have been exported as a JSON file.",
    });
  }, [flows, toast]);

  const importFlows = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const importedFlows = JSON.parse(e.target?.result as string);

            // Validate and reconstruct flows
            const newFlows = importedFlows
              .map((flowData: any) => {
                // Handle both old and new export formats
                const startNodeId =
                  flowData.startNodeId || flowData.startNode?.id;
                const precondition = flowData?.precondition || "";
                const endNodeId = flowData.endNodeId || flowData.endNode?.id;
                const viaNodeIds =
                  flowData.viaNodeIds ||
                  flowData.viaNodes?.map((vn: any) => vn.id) ||
                  [];
                const pathNodeIds =
                  flowData.pathNodeIds ||
                  flowData.nodeSequence?.map((ns: any) => ns.id) ||
                  [];

                // Validate that referenced nodes exist
                const startNodeExists = nodes.some((n) => n.id === startNodeId);
                const endNodeExists = nodes.some((n) => n.id === endNodeId);
                const allViaNodesExist = viaNodeIds.every((id: string) =>
                  nodes.some((n) => n.id === id),
                );
                const allPathNodesExist = pathNodeIds.every((id: string) =>
                  nodes.some((n) => n.id === id),
                );

                if (
                  !startNodeExists ||
                  !endNodeExists ||
                  !allViaNodesExist ||
                  !allPathNodesExist
                ) {
                  console.warn(
                    `Flow "${flowData.name}" references nodes that don't exist in the current graph.`,
                  );
                  return null;
                }

                return {
                  id: flowData.id,
                  name: flowData.name,
                  startNodeId,
                  endNodeId,
                  viaNodeIds,
                  pathNodeIds,
                  precondition,
                  description: flowData.description || "",
                  scenarios: flowData.scenarios,
                  credentials: flowData.credentials || [],
                  // Preserve autoPlan if it exists in imported data
                  ...(flowData.autoPlan !== undefined && {
                    autoPlan: flowData.autoPlan,
                  }),
                  // Preserve videoUrl if it exists in imported data
                  ...(flowData.videoUrl !== undefined && {
                    videoUrl: flowData.videoUrl,
                  }),
                  ...(flowData.feature_id !== undefined && {
                    feature_id: flowData.feature_id,
                  }),
                };
              })
              .filter((flow: any) => flow !== null);
            setFlows((existingFlows) => {
              const allFlows = [...existingFlows, ...newFlows];
              // Emit the event with the correct, up-to-date flows
              const collaborationEvents = new ConsoleCollaborationEvents();
              collaborationEvents.createAiPlannedFlows(allFlows);
              return allFlows;
            });
            toast({
              title: "Flows imported",
              description: `Successfully imported ${newFlows.length} flow(s).`,
            });
          } catch (error) {
            toast({
              title: "Import failed",
              description:
                "Invalid file format or referenced screens don't exist.",
              variant: "destructive",
            });
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  }, [nodes, toast, setFlows]);

  const exportGraph = useCallback(() => {
    const graphData = {
      nodes: getExportableNodes(nodes),
      edges: edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
        type: edge.type,
        data: edge.data,
      })),
    };

    const dataStr = JSON.stringify(graphData, null, 2);
    const dataUri =
      "data:application/json;charset=utf-8," + encodeURIComponent(dataStr);

    const exportFileDefaultName = "graph-export.json";

    const linkElement = document.createElement("a");
    linkElement.setAttribute("href", dataUri);
    linkElement.setAttribute("download", exportFileDefaultName);
    linkElement.click();

    toast({
      title: "Graph exported",
      description: "Your graph has been exported as a JSON file.",
    });
  }, [nodes, edges, toast]);

  const importGraph = useCallback(() => {
    importInputRef.current?.click();
  }, []);

  const handleFileImport = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const graphData = JSON.parse(e.target?.result as string);

            if (graphData.nodes && graphData.edges) {
              if (graphData.nodes && graphData.edges) {
                // Create new nodes with proper types
                const importedNodes = await Promise.all(
                  graphData.nodes.map(async (node: any) => {
                    let compressedImage = node.data?.image;
                    if (compressedImage) {
                      try {
                        compressedImage =
                          await compressBase64ImageToJpeg(compressedImage);
                      } catch (err) {
                        // Fallback to original image if compression fails
                        compressedImage = node.data.image;
                      }
                    }
                    return {
                      ...node,
                      type: "customNode",
                      deletable: true,
                      position: node.originalPosition || node.position,
                      data: {
                        ...node.data,
                        image: compressedImage,
                        ...(node.originalPosition && {
                          originalPosition: node.originalPosition,
                        }),
                        ...(node.isCollapsed !== undefined && {
                          isCollapsed: node.isCollapsed,
                        }),
                      },
                    };
                  }),
                );

                const importedEdges = graphData.edges.map((edge: any) => ({
                  ...edge,
                  type: "customEdge",
                  markerEnd: {
                    type: MarkerType.ArrowClosed,
                    width: 20,
                    height: 20,
                  },
                }));

                // Duplicate checking and positioning logic
                const existingNodeIds = new Set(nodes.map((n) => n.id));

                // 1. Check for duplicates
                for (const node of importedNodes) {
                  if (existingNodeIds.has(node.id)) {
                    toast({
                      title: "Duplicate node ID found",
                      description: `Duplicate node IDs ${node.id} were found in the imported graph. Please ensure all nodes have unique IDs. Aborting import.`,
                      variant: "destructive",
                    });
                    return; // Abort import if duplicates found
                  }
                }

                // 2. Find existing bounding box
                const existingXs = nodes.map((n) => n.position?.x ?? 0);
                const existingYs = nodes.map((n) => n.position?.y ?? 0);
                console.log("Existing node positions:", {
                  existingXs,
                  existingYs,
                });
                const minXExisting = safeMin(existingXs);
                const maxXExisting = safeMax(existingXs);
                const minYExisting = safeMin(existingYs);
                const maxYExisting = safeMax(existingYs);

                console.log("Existing bounding box:", {
                  minX: minXExisting,
                  maxX: maxXExisting,
                  minY: minYExisting,
                  maxY: maxYExisting,
                });

                // 3. Find imported bounding box
                const importedXs = importedNodes.map((n) => n.position?.x ?? 0);
                const importedYs = importedNodes.map((n) => n.position?.y ?? 0);

                const minXImported = safeMin(importedXs);
                const minYImported = safeMin(importedYs);

                // 4. Calculate offset → place imported right after existing's maxX
                const gap = 1000; // pixels between graphs
                const offsetX = maxXExisting - minXImported + gap;
                const offsetY = minYExisting - minYImported; // keep aligned vertically

                // 5. Shift imported nodes
                const shiftedNodes = importedNodes.map((n) => ({
                  ...n,
                  position: {
                    x: n.position.x + offsetX,
                    y: n.position.y + offsetY,
                  },
                }));

                // 6. Add nodes using centralized function with events
                addNewNodes(shiftedNodes);

                setEdges((prevEdges: any[]) => {
                  const existingEdgeIds = new Set(prevEdges.map((e) => e.id));

                  for (const edge of importedEdges) {
                    if (existingEdgeIds.has(edge.id)) {
                      toast({
                        title: "Duplicate edge ID found",
                        description: `Duplicate edge IDs ${edge.id} were found in the imported graph. Please ensure all edges have unique IDs. Aborting import.`,
                        variant: "destructive",
                      });
                      return prevEdges; // Abort import if duplicates found
                    }
                  }

                  return [...prevEdges, ...importedEdges];
                });

                // Emit collaboration events for imported edges

                const edgeCreateData = importedEdges.map((edge: any) => ({
                  edgeId: edge.id,
                  sourceNodeId: edge.source,
                  targetNodeId: edge.target,
                  sourceHandle: edge.sourceHandle,
                  targetHandle: edge.targetHandle,
                  data: edge.data,
                }));
                const collaborationEvents = new ConsoleCollaborationEvents();
                collaborationEvents.createEdges(edgeCreateData, "IMPORT_USER");

                // Use a callback to run after both setNodes and setEdges
                setTimeout(() => {
                  // Update counters to avoid ID conflicts
                  const allNodes = nodes;
                  const allEdges = edges;
                  const maxNodeId = Math.max(
                    ...allNodes.map((n: any) => {
                      const match = n.id.match(/node-(\d+)/);
                      return match ? parseInt(match[1]) : 0;
                    }),
                    0,
                  );
                  const maxEdgeId = Math.max(
                    ...allEdges.map((e: any) => {
                      const match = e.id.match(/edge-(\d+)/);
                      return match ? parseInt(match[1]) : 0;
                    }),
                    0,
                  );
                  console.log("Max Node ID:", maxNodeId);
                  console.log("Max Edge ID:", maxEdgeId);
                  setNodeCounter(maxNodeId + 1);
                  setEdgeCounter(maxEdgeId + 1);

                  toast({
                    title: "Graph imported",
                    description: `Imported ${importedNodes.length} Screens and ${importedEdges.length} Transitions.`,
                  });
                }, 0);
              }
            } else {
              throw new Error("Invalid file format");
            }
          } catch (error) {
            console.log("Import failed:", error);
            toast({
              title: "Import failed",
              description:
                "Failed to import graph. Please check the file format.",
              variant: "destructive",
            });
          }
        };
        reader.readAsText(file);
      }

      // Reset the input
      event.target.value = "";
    },
    [
      nodes,
      addNewNodes,
      setNodes,
      setEdges,
      toast,
      setNodeCounter,
      setEdgeCounter,
    ],
  );

  const FileInputComponent = () => (
    <input
      type="file"
      ref={importInputRef}
      onChange={handleFileImport}
      accept="application/json"
      style={{ display: "none" }}
    />
  );

  return {
    exportFlows,
    importFlows,
    exportGraph,
    importGraph,
    handleFileImport,
    importInputRef,
    FileInputComponent,
    exportFlowsAutomatically,
    importFlowsAutomatically,
    exportGraphAutomatically,
    importGraphAutomatically,
    exportFeaturesAutomatically,
    importFeaturesAutomatically,
    exportCommentsAutomatically,
    importCommentsAutomatically,
    importGraphFromGcms,
    importFailedVideoToFlowRequests,
  };
};
