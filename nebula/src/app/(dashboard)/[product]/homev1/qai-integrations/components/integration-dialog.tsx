"use client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { useProductSwitcher } from "@/providers/product-provider";
import { AGENT_EMAIL } from "@/lib/constants";

interface IntegrationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  useProductId?: boolean;
}

export function IntegrationDialog({
  open,
  onOpenChange,
  title,
  description,
  useProductId = true,
}: IntegrationDialogProps) {
  const { productSwitcher } = useProductSwitcher();

  // Use either the product-specific email or the generic agent email
  const email = useProductId
    ? `agent+${productSwitcher.product_id}@qaitech.ai`
    : AGENT_EMAIL;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(email);
    toast.success("Copied");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 gap-0">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="text-xl">{title}</DialogTitle>
        </DialogHeader>
        <div className="px-6 py-4">
          <p className="text-sm text-gray-500 mb-6">{description}</p>
          <div className="flex items-center rounded-md border border-gray-200 px-4 py-1 mb-6">
            <div className="flex-1">{email}</div>
            <Button
              variant="ghost"
              size="icon"
              onClick={copyToClipboard}
              className="h-8 w-8"
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex justify-end space-x-2 p-4">
          <Button
            variant="outline"
            className="border-purple-600 text-purple-600 hover:bg-purple-50"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
          <Button className="hidden bg-purple-600 hover:bg-purple-700 text-white">
            Verify
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
