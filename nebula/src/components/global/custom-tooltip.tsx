import { ReactNode } from "react";

interface CustomTooltipProps<T> {
  active?: boolean;
  payload?: Array<{ payload: T }>;
  renderContent: (data: T) => ReactNode;
  className?: string;
}

export function CustomTooltip<T>({
  active,
  payload,
  renderContent,
  className = "bg-white p-3 border rounded-lg shadow-lg",
}: CustomTooltipProps<T>) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return <div className={className}>{renderContent(data)}</div>;
  }
  return null;
}
