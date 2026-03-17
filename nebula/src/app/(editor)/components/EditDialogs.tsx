// @ts-nocheck
import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Upload } from "lucide-react";

interface NodeEditDialogProps {
  isOpen: boolean;
  nodeDescription: string;
  nodeImage: string;
  onDescriptionChange: (description: string) => void;
  onImageChange: (image: string) => void;
  onImageUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onSave: () => void;
  onCancel: () => void;
  imageInputRef: React.RefObject<HTMLInputElement>;
}

export const NodeEditDialog: React.FC<NodeEditDialogProps> = ({
  isOpen,
  nodeDescription,
  nodeImage,
  onDescriptionChange,
  onImageChange,
  onImageUpload,
  onSave,
  onCancel,
  imageInputRef,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Screen</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Description</label>
            <Textarea
              value={nodeDescription}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder="Enter screen description"
              className="mt-1"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Image</label>
            <div className="mt-1 space-y-2">
              <Button
                onClick={() => imageInputRef.current?.click()}
                variant="outline"
                size="sm"
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload New Image
              </Button>
              <input
                type="file"
                ref={imageInputRef}
                onChange={onImageUpload}
                accept="image/*"
                style={{ display: "none" }}
              />
              {nodeImage && (
                <div className="mt-2">
                  <div className="w-64 h-64 overflow-hidden rounded border bg-gray-100 flex items-center justify-center">
                    <img
                      src={nodeImage}
                      alt="Preview"
                      className="max-h-full object-contain"
                      style={{ width: "auto", height: "100%" }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={onSave} className="flex-1">
              Save
            </Button>
            <Button onClick={onCancel} variant="outline" className="flex-1">
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

interface EdgeEditDialogProps {
  isOpen: boolean;
  edgeDescription: string;
  onDescriptionChange: (description: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

export const EdgeEditDialog: React.FC<EdgeEditDialogProps> = ({
  isOpen,
  edgeDescription,
  onDescriptionChange,
  onSave,
  onCancel,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Transition</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Description</label>
            <Textarea
              value={edgeDescription}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder="Enter transition description"
              className="mt-1"
            />
          </div>

          <div className="flex gap-2">
            <Button onClick={onSave} className="flex-1">
              Save
            </Button>
            <Button onClick={onCancel} variant="outline" className="flex-1">
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
