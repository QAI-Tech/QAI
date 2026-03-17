import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { transitions } from "@/lib/animations";

interface Credential {
  id: string;
  name: string;
  description?: string;
  username: string;
  password: string;
  isDefault: boolean;
  flowIds: string[];
  createdAt: Date;
  updatedAt: Date;
  credentials?: Record<string, string>;
}

interface CredentialCardProps {
  credential: Credential;
  isSelected: boolean;
  onClick: () => void;
}

export function CredentialCard({
  credential,
  isSelected,
  onClick,
}: CredentialCardProps) {
  // Get primary display value for card (username or email or first credential)
  const getPrimaryDisplayValue = () => {
    if (credential.username) {
      return credential.username;
    }

    if (credential.credentials) {
      // Try to find username or email in credentials
      if (credential.credentials.username) {
        return credential.credentials.username;
      }

      if (credential.credentials.email) {
        return credential.credentials.email;
      }

      // Otherwise, return the first non-password credential
      const firstNonPasswordKey = Object.keys(credential.credentials).find(
        (key) => !["password", "pin"].includes(key.toLowerCase()),
      );

      if (firstNonPasswordKey) {
        return `${firstNonPasswordKey}: ${credential.credentials[firstNonPasswordKey]}`;
      }
    }

    // Fallback
    return "No username specified";
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={transitions.normal}
      className={cn(
        "bg-card border-2 rounded-lg p-4 cursor-pointer transition-all duration-normal ease-default",
        isSelected
          ? "border-primary shadow-lg shadow-primary/10"
          : "border-border hover:border-primary/30 hover:shadow-md",
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3
              className={cn(
                "font-medium truncate transition-colors duration-fast ease-default",
                isSelected ? "text-primary" : "text-foreground",
              )}
            >
              {credential.name}
            </h3>
            {credential.isDefault && (
              <Badge variant="secondary" className="text-xs">
                Default
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
            {getPrimaryDisplayValue()}
          </p>
          {credential.flowIds.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              Used in {credential.flowIds.length} flow
              {credential.flowIds.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
