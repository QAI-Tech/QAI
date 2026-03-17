"use client";

import type React from "react";

import { useState, useRef, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import ReactMarkdown from "react-markdown";

interface EditableFieldProps {
  value: string;
  onSave: (value: string) => Promise<void>;
  placeholder?: string;
  disabled?: boolean;
  minHeight?: string;
  className?: string;
}

export function EditableField({
  value,
  onSave,
  placeholder,
  disabled = false,
  minHeight = "min-h-[80px]",
  className = "",
}: EditableFieldProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [isSaving, setIsSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setEditValue(value);
  }, [value]);

  // New effect to auto-resize the textarea when content changes
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      const textarea = textareaRef.current;
      // Reset height to measure the scrollHeight correctly
      textarea.style.height = 'auto';
      // Set the height to match content
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [editValue, isEditing]);

  const handleClick = () => {
    if (disabled) return;
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (editValue === value) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      await onSave(editValue);
      setIsEditing(false);
    } catch (error) {
      console.error("Error saving field:", error);
      setEditValue(value); // Revert on error
    } finally {
      setIsSaving(false);
    }
  };

  const handleBlur = () => {
    if (!isSaving) {
      handleSave();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setEditValue(value);
      setIsEditing(false);
    }
  };

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      const textarea = textareaRef.current;
      textarea.focus();
      const length = textarea.value.length;
      textarea.setSelectionRange(length, length);
      
      // Initialize height on first focus
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [isEditing]);

  if (isEditing) {
    return (
      <Textarea
        ref={textareaRef}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={isSaving}
        className={`${minHeight} w-full border border-[#F7F7F7] rounded-xl p-3 focus:ring-1 focus:ring-purple-500 focus:border-purple-500 overflow-hidden bg-white shadow-[0_1px_2px_0_rgba(0,0,0,0.1)] ${className}`}
        style={{ overflowY: 'hidden' }}
      />
    );
  }

  return (
    <div
      onClick={handleClick}
      className={`${minHeight} w-full border border-[#F7F7F7] rounded-xl p-3 bg-white shadow-[0_1px_2px_0_rgba(0,0,0,0.1)] cursor-${disabled ? "default" : "text"} hover:${disabled ? "" : "border-gray-300"} transition-colors ${className} overflow-auto`}
    >
      {value ? (
        <div className="prose prose-sm max-w-none">
          <ReactMarkdown components={{
            p: ({children}) => <p className="whitespace-pre-line">{children}</p>
          }}>{value}</ReactMarkdown>
        </div>
      ) : (
        <span className="text-gray-500 italic">{placeholder}</span>
      )}
    </div>
  );
}
