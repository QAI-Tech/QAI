"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface UserAvatarProps {
  firstName: string;
  lastName: string;
  email: string;
  className?: string;
}

export function UserAvatar({ firstName, lastName, email, className }: UserAvatarProps) {
  const initials = `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase();
  const colors = [
    "bg-red-100 text-red-700",
    "bg-blue-100 text-blue-700",
    "bg-green-100 text-green-700",
    "bg-purple-100 text-purple-700",
    "bg-yellow-100 text-yellow-700",
    "bg-pink-100 text-pink-700",
  ];

  const colorIndex = email.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
  const colorClass = colors[colorIndex];

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <Avatar className={className}>
            <AvatarFallback className={`${colorClass} font-medium`}>
              {initials}
            </AvatarFallback>
          </Avatar>
        </TooltipTrigger>
        <TooltipContent>
          <p>{`${firstName} ${lastName}`}</p>
          <p className="text-xs text-muted-foreground">{email}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

