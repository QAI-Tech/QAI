"use client";

import type React from "react";
import { useState, useRef, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";

interface StepAnnotationFieldProps {
  value: string;
  onSave: (stepDescription: string) => Promise<void>;
  onCancel: () => void;
  placeholder?: string;
  disabled?: boolean;
  minHeight?: string;
  className?: string;
}

export function StepAnnotationField({
  value,
  onSave,
  onCancel,
  placeholder = "Add adhoc step description...",
  disabled = false,
  minHeight = "min-h-[80px]",
  className = "",
}: StepAnnotationFieldProps) {
  const [editValue, setEditValue] = useState(value);
  const [isSaving, setIsSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setEditValue(value);
  }, [value]);

  useEffect(() => {
    if (textareaRef.current) {
      const textarea = textareaRef.current;
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [editValue]);

  const handleSave = async () => {
    if (!editValue.trim()) {
      onCancel();
      return;
    }

    setIsSaving(true);
    try {
      await onSave(editValue);
    } catch (error) {
      console.error("Error saving annotation:", error);
      setEditValue(value);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditValue(value);
    onCancel();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      handleCancel();
    } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      handleSave();
    }
  };

  const handleBlur = () => {
    if (editValue.trim()) {
      handleSave();
    } else {
      handleCancel();
    }
  };

  useEffect(() => {
    if (textareaRef.current) {
      const textarea = textareaRef.current;
      textarea.focus();

      if (textarea.value && textarea.value.trim() !== "") {
        textarea.select();
      } else {
        const length = textarea.value.length;
        textarea.setSelectionRange(length, length);
      }
      
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, []);

  return (
    <div className={`space-y-3 ${className}`}>
      <Textarea
        ref={textareaRef}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled || isSaving}
        className={`${minHeight} w-full border border-[#F7F7F7] rounded-xl p-3 focus:ring-1 focus:ring-purple-500 focus:border-purple-500 overflow-hidden bg-white shadow-[0_1px_2px_0_rgba(0,0,0,0.1)]`}
        style={{ overflowY: 'hidden' }}
      />
      
      {isSaving && (
        <div className="flex justify-end">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
            Saving...
          </div>
        </div>
      )}
    </div>
  );
}
