import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { PencilIcon } from "lucide-react";
import { toast } from "sonner";
import { useDispatch } from "react-redux";
import { AppDispatch } from "@/app/store/store";
import { updateFeature } from "@/app/store/featuresSlice";
import * as Sentry from "@sentry/nextjs";

interface EditableFeatureNameProps {
  featureId: string;
  initialName: string;
  className?: string;
}

export function EditableFeatureName({
  featureId,
  initialName,
  className = "",
}: EditableFeatureNameProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [featureName, setFeatureName] = useState(initialName);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dispatch = useDispatch<AppDispatch>();

  useEffect(() => {
    setFeatureName(initialName);
  }, [initialName]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const handleSave = async (newName: string) => {
    if (newName.trim() === "") {
      toast.error("Feature name cannot be empty");
      setFeatureName(initialName);
      return;
    }

    if (newName === initialName) {
      setIsEditing(false);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/update-feature", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: featureId,
          name: newName,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update feature name");
      }

      await response.json();

      dispatch(updateFeature({ id: featureId, name: newName }));
      toast.success("Feature name updated successfully");
    } catch (error) {
      console.error("Error updating feature name:", error);
      Sentry.captureException(error, {
        level: "fatal",
        tags: { priority: "high" },
      });
      toast.error("Failed to update feature name");
      setFeatureName(initialName);
    } finally {
      setIsLoading(false);
      setIsEditing(false);
    }
  };

  const handleBlur = () => {
    if (featureName !== initialName) {
      handleSave(featureName);
    } else {
      setIsEditing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      if (featureName !== initialName) {
        handleSave(featureName);
      } else {
        setIsEditing(false);
      }
    } else if (e.key === "Escape") {
      setFeatureName(initialName);
      setIsEditing(false);
    }
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
  };

  const handleInputClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    setFeatureName(e.target.value);
  };

  return (
    <div
      className={`relative group inline-flex items-center h-6 ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={(e) => {
        if (isEditing) {
          e.stopPropagation();
        }
      }}
    >
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={featureName}
          onChange={handleInputChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onClick={handleInputClick}
          className="px-2 h-6 w-[200px] border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 leading-none"
          autoFocus
          disabled={isLoading}
        />
      ) : (
        <>
          <span className="leading-none">{featureName}</span>
          {isHovered && !isLoading && (
            <Button
              aria-label="Edit feature name"
              variant="ghost"
              size="sm"
              className="p-1 h-6 w-6 ml-2 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={handleEditClick}
            >
              <PencilIcon className="h-4 w-4" />
            </Button>
          )}
        </>
      )}
    </div>
  );
}
