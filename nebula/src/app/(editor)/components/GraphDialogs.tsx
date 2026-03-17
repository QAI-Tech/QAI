// @ts-nocheck
import React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { NodeEditDialog, EdgeEditDialog } from "./EditDialogs";

interface GraphDialogsProps {
  // Node edit dialog props
  editingNode: { id: string; data: any } | null;
  editNodeDescription: string;
  editNodeImage: string;
  onEditNodeDescriptionChange: (description: string) => void;
  onEditNodeImageChange: (image: string) => void;
  onEditNodeImageUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onSaveNodeEdit: () => void;
  onCancelNodeEdit: () => void;
  editImageInputRef: React.RefObject<HTMLInputElement>;

  // Edge edit dialog props
  editingEdge: { id: string; data: any } | null;
  editEdgeDescription: string;
  onEditEdgeDescriptionChange: (description: string) => void;
  onSaveEdgeEdit: () => void;
  onCancelEdgeEdit: () => void;

  // Delete confirmation dialog props
  showDeleteConfirm: boolean;
  onShowDeleteConfirmChange: (show: boolean) => void;
  pendingDeletion: {
    nodes: any[];
    edges: any[];
    affectedFlows: Array<{ id: string; name: string }>;
  } | null;
  onConfirmDeletion: () => void;
  onCancelDeletion: () => void;
}

export const GraphDialogs: React.FC<GraphDialogsProps> = ({
  editingNode,
  editNodeDescription,
  editNodeImage,
  onEditNodeDescriptionChange,
  onEditNodeImageChange,
  onEditNodeImageUpload,
  onSaveNodeEdit,
  onCancelNodeEdit,
  editImageInputRef,
  editingEdge,
  editEdgeDescription,
  onEditEdgeDescriptionChange,
  onSaveEdgeEdit,
  onCancelEdgeEdit,
  showDeleteConfirm,
  onShowDeleteConfirmChange,
  pendingDeletion,
  onConfirmDeletion,
  onCancelDeletion,
}) => {
  return (
    <>
      <NodeEditDialog
        isOpen={!!editingNode}
        nodeDescription={editNodeDescription}
        nodeImage={editNodeImage}
        onDescriptionChange={onEditNodeDescriptionChange}
        onImageChange={onEditNodeImageChange}
        onImageUpload={onEditNodeImageUpload}
        onSave={onSaveNodeEdit}
        onCancel={onCancelNodeEdit}
        imageInputRef={editImageInputRef}
      />

      <EdgeEditDialog
        isOpen={!!editingEdge}
        edgeDescription={editEdgeDescription}
        onDescriptionChange={onEditEdgeDescriptionChange}
        onSave={onSaveEdgeEdit}
        onCancel={onCancelEdgeEdit}
      />

      <AlertDialog
        open={showDeleteConfirm}
        onOpenChange={onShowDeleteConfirmChange}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeletion && (
                <>
                  You are about to delete {pendingDeletion.nodes.length}{" "}
                  screen(s) and {pendingDeletion.edges.length} transition(s).
                  {pendingDeletion.affectedFlows.length > 0 && (
                    <>
                      <br />
                      <br />
                      This will also delete the following flows:
                      <ul className="list-disc list-inside mt-2">
                        {pendingDeletion.affectedFlows.map((flow) => (
                          <li key={flow.id}>{flow.name}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  <br />
                  <br />
                  This action cannot be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onCancelDeletion}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmDeletion}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
