import * as THREE from "three";
import { FlowBlock } from "../utils/FlowBlock";
import type { GraphData } from "../types/carousel";
import type { ViewerMode, CommonModeDeps } from "../types/viewerMode";

interface FlowViewerModeOptions {
  graphData: GraphData;
  onNodeChange?: (nodeIndex: number) => void;
  onContentLoaded?: () => void;
}

export class FlowViewerMode implements ViewerMode {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private mountElement: HTMLElement;
  private flowBlockInstance: FlowBlock | null = null;
  private onNodeChange?: (nodeIndex: number) => void;
  private onContentLoaded?: () => void;
  private graphData: GraphData;

  constructor(
    deps: CommonModeDeps & { mountElement: HTMLElement },
    options: FlowViewerModeOptions,
  ) {
    this.scene = deps.scene;
    this.camera = deps.camera;
    this.renderer = deps.renderer;
    this.mountElement = deps.mountElement;
    this.graphData = options.graphData;
    this.onNodeChange = options.onNodeChange;
    this.onContentLoaded = options.onContentLoaded;
  }

  public activate(): void {
    if (!this.flowBlockInstance) {
      this.flowBlockInstance = new FlowBlock(
        this.scene,
        this.camera,
        this.renderer,
        this.mountElement,
        {
          graphData: this.graphData,
          onNodeChange: this.onNodeChange,
          onContentLoaded: this.onContentLoaded,
          viewMode: "flow",
        },
      );
    } else {
      this.flowBlockInstance.handleViewModeChange("flow");
      this.flowBlockInstance.updateViewMode("flow");
    }
  }

  public deactivate(): void {
    if (this.flowBlockInstance) {
      this.flowBlockInstance.handleViewModeChange("feature");
      this.flowBlockInstance.updateViewMode("feature");
    }
  }

  public dispose(): void {
    if (this.flowBlockInstance) {
      this.flowBlockInstance.dispose();
      this.flowBlockInstance = null;
    }
  }

  public onResize(): void {
    // FlowBlock relies on camera from deps which is updated by hub
  }

  public tick(_deltaMs: number): void {
    // Flow mode currently doesn't require per-frame updates here
    void _deltaMs;
  }

  public moveToNext(): void {
    this.flowBlockInstance?.moveToNext();
  }

  public moveToPrevious(): void {
    this.flowBlockInstance?.moveToPrevious();
  }

  public resetToFirstNode(): void {
    this.flowBlockInstance?.resetToFirstNode();
  }

  public getState(): { currentNodeIndex: number; totalNodes: number } {
    if (!this.flowBlockInstance) {
      return { currentNodeIndex: 0, totalNodes: this.graphData.nodes.length };
    }
    return this.flowBlockInstance.getState();
  }

  public getCurrentNodeDescription(): string {
    if (!this.flowBlockInstance) return "";
    return this.flowBlockInstance.getCurrentNodeDescription();
  }

  public getOutgoingEdgeDescription(): string {
    if (!this.flowBlockInstance) return "Next";
    return this.flowBlockInstance.getOutgoingEdgeDescription();
  }

  public getCurrentFlowBlockPosition(): { x: number; y: number; z: number } {
    if (!this.flowBlockInstance) {
      return { x: 0, y: 0, z: 0 };
    }
    return this.flowBlockInstance.getCurrentFlowBlockPosition();
  }

  public updateFlowBlockPosition(pos: {
    x: number;
    y: number;
    z: number;
  }): void {
    this.flowBlockInstance?.updateFlowBlockPosition(pos);
  }
}
