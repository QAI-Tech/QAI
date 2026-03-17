import { useState, useCallback, useEffect, useRef } from "react";
import { Node } from "@xyflow/react";
import { useToast } from "@/hooks/use-toast";
import { generateNodeId } from "@/app/(editor)/utils/idGenerator";
import { useProductSwitcher } from "@/providers/product-provider";
import { fileToCompressedJpegFile } from "@/app/(editor)/utils/imageCompressor";
import { CustomNodeData } from "../types/graphHandlers";
import { getNodeAutoTitleManager } from "../services/nodeAutoTitleManager";
import { findNonOverlappingPosition } from "../utils/collisionDetection";

interface UseNodeCreationProps {
  addNewNodes: (nodes: Node[]) => void;
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  nodes: Node[];
  mode:
    | "select"
    | "addNode"
    | "addEdge"
    | "planFlow"
    | "addFeature"
    | "addComment"
    | "addWildcardNode"
    | "addBugNode";
  setMode: (
    mode:
      | "select"
      | "addNode"
      | "addEdge"
      | "planFlow"
      | "addFeature"
      | "addComment"
      | "addWildcardNode"
      | "addBugNode",
  ) => void;
  screenToFlowPosition: (screenPosition: { x: number; y: number }) => {
    x: number;
    y: number;
  };
  saveState: () => void;
  onNodeCreated?: (nodeId: string, nodeData: CustomNodeData) => void;
}

export const useNodeCreation = ({
  addNewNodes,
  setNodes,
  nodes,
  mode,
  setMode,
  screenToFlowPosition,
  saveState,
  onNodeCreated,
}: UseNodeCreationProps) => {
  const [nodeImages, setNodeImages] = useState<string[]>([]);
  const [nodeImageNames, setNodeImageNames] = useState<string[]>([]);
  const [nodeDescription, setNodeDescription] = useState("");
  const [nodeCounter, setNodeCounter] = useState(0);
  const { toast } = useToast();
  const { productSwitcher } = useProductSwitcher();

  // Initialize auto-title manager
  const autoTitleManagerRef = useRef<ReturnType<
    typeof getNodeAutoTitleManager
  > | null>(null);

  // Initialize the auto-title manager when component mounts
  useEffect(() => {
    const handleNodeUpdate = (
      nodeId: string,
      title: string,
      description: string,
    ) => {
      console.log(
        `[useNodeCreation] Updating node ${nodeId} with title: "${title}"`,
      );

      setNodes((nodes) =>
        nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  description: title, // Put the title into description field, discard detailed description
                },
              }
            : node,
        ),
      );

      toast({
        title: "Node updated",
        description: `Auto-generated title: "${title}"`,
        duration: 3000,
      });
    };

    try {
      autoTitleManagerRef.current = getNodeAutoTitleManager(handleNodeUpdate);
    } catch (error) {
      console.error(
        "[useNodeCreation] Failed to initialize auto-title manager:",
        error,
      );
    }

    // Cleanup on unmount
    return () => {
      if (autoTitleManagerRef.current) {
        // Note: We don't destroy the singleton here as it might be used elsewhere
        // autoTitleManagerRef.current.destroy();
      }
    };
  }, [setNodes, toast]);

  const processFiles = async (files: FileList) => {
    const fileArray = Array.from(files);

    // Compress each file to JPEG asynchronously
    const compressedFiles = await Promise.all(
      fileArray.map((file) => fileToCompressedJpegFile(file, 0.8, 800)),
    );

    // Convert each compressed JPEG file to base64 dataURL (for preview/storage)
    const imagePromises = compressedFiles.map(
      (file) =>
        new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            resolve(e.target?.result as string);
          };
          reader.readAsDataURL(file);
        }),
    );

    const images = await Promise.all(imagePromises);
    const names = compressedFiles.map((file) =>
      file.name.replace(/\.[^/.]+$/, ""),
    );

    return { images, names };
  };

  const createNodesFromImages = useCallback(
    (
      images: string[],
      imageNames: string[],
      flowPosition: { x: number; y: number },
    ) => {
      saveState();

      const defaultNodeWidth = 300;
      const defaultNodeHeight = 200;

      const newNodes = images.reduce((acc: Node[], image, index) => {
        const preferredPosition = {
          x: flowPosition.x + index * 160 - 75,
          y: flowPosition.y - 100,
        };

        const adjustedPosition = findNonOverlappingPosition(
          preferredPosition,
          defaultNodeWidth,
          defaultNodeHeight,
          [...nodes, ...acc],
          {
            margin: 20,
            spacing: 50,
          },
        );

        const defaultDescription =
          imageNames[index] || `Node ${nodeCounter + index + 1}`;

        const nodeData: CustomNodeData = {
          image,
          description: nodeDescription || defaultDescription,
        };

        return [
          ...acc,
          {
            id: generateNodeId(undefined, productSwitcher.product_id),
            type: "customNode",
            position: adjustedPosition,
            data: nodeData as unknown as Record<string, unknown>,
            deletable: true,
          } as Node,
        ];
      }, []);

      addNewNodes(newNodes);
      setNodeCounter((c) => c + images.length);

      // Trigger auto-title generation for each new node with an image
      if (autoTitleManagerRef.current) {
        newNodes.forEach((node) => {
          const nodeData = node.data as CustomNodeData;
          if (nodeData.image) {
            console.log(
              `[useNodeCreation] Triggering auto-title for node: ${node.id}`,
            );
            autoTitleManagerRef.current!.generateTitleForNode(
              node.id,
              nodeData.image,
            );
          }
        });
      }

      // Trigger edit mode for the first newly created node using callback
      if (newNodes.length > 0 && onNodeCreated) {
        const firstNode = newNodes[0];
        onNodeCreated(
          firstNode.id,
          firstNode.data as unknown as CustomNodeData,
        );
      }

      toast({
        title: "Screens added",
        description: `${images.length} screen(s) have been successfully added to the canvas.`,
      });
    },
    [
      nodes,
      addNewNodes,
      saveState,
      toast,
      onNodeCreated,
      productSwitcher.product_id,
      nodeCounter,
      nodeDescription,
      autoTitleManagerRef,
    ],
  );

  const handleImageUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (files) {
        const { images, names } = await processFiles(files);
        setNodeImages(images);
        setNodeImageNames(names);
      }
    },
    [],
  );

  const onCanvasClick = useCallback(
    async (event: React.MouseEvent) => {
      const shouldHandle =
        (mode === "addNode" && nodeImages.length > 0) ||
        mode === "addWildcardNode" ||
        mode === "addBugNode";

      if (!shouldHandle) return;

      const flowPosition = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      // Determine images to use for creation
      let imagesToCreate: string[] = [];
      let imageNamesToUse: string[] = [];

      if (mode === "addWildcardNode" || mode === "addBugNode") {
        // Fetch template image from public folder and compress it, then convert to data URL
        const templatePath =
          mode === "addWildcardNode"
            ? "/wildcard_node_template.png"
            : "/bug_node_template.jpg";

        try {
          const resp = await fetch(templatePath);
          const blob = await resp.blob();

          // Create a File from the fetched blob so we can reuse the existing compressor
          const filename = templatePath.split("/").pop() || "template.png";
          const file = new File([blob], filename, {
            type: blob.type || "image/png",
          });

          // Compress the template file using the same compressor used for uploads
          const compressedFile = await fileToCompressedJpegFile(file, 0.8, 800);

          // Convert compressed file to base64 data URL
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = (e) => reject(e);
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(compressedFile as Blob);
          });

          imagesToCreate = [dataUrl];
          imageNamesToUse = [mode === "addWildcardNode" ? "Wildcard" : "Bug"];
        } catch (err) {
          console.error("Failed to load or compress template image:", err);
          toast({
            title: "Failed to add node",
            description: "Could not load or compress template image.",
            variant: "destructive",
          });
          return;
        }
      } else {
        imagesToCreate = nodeImages;
        imageNamesToUse = nodeImageNames;
      }

      createNodesFromImages(imagesToCreate, imageNamesToUse, flowPosition);

      // Reset form for addNode case; keep nodeImages empty for templates as well
      setNodeImages([]);
      setNodeImageNames([]);
      setNodeDescription("");
      setMode("select");
    },
    [
      mode,
      nodeImages,
      nodeImageNames,
      setMode,
      screenToFlowPosition,
      createNodesFromImages,
      toast,
    ],
  );

  const addNodesAtPosition = useCallback(
    async (
      files: FileList | null,
      screenPosition: { x: number; y: number },
    ) => {
      if (!files || files.length === 0) return;

      const { images, names } = await processFiles(files);
      const flowPosition = screenToFlowPosition(screenPosition);
      createNodesFromImages(images, names, flowPosition);
    },
    [createNodesFromImages, screenToFlowPosition],
  );

  return {
    nodeImages,
    nodeDescription,
    nodeCounter,
    setNodeCounter,
    setNodeDescription,
    handleImageUpload,
    onCanvasClick,
    addNodesAtPosition,
  };
};
