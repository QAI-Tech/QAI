import { Badge } from "@/components/ui/badge";
export const StatusBadge = ({ status }: { status: string }) => {
  const badgeClass =
    {
      COMPLETED: "bg-green-500",
      FAILED: "bg-red-500",
      QUEUED: "bg-yellow-500",
    }[status] || "bg-gray-500";

  return <Badge className={`${badgeClass} text-white`}>{status}</Badge>;
};
