"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InviteMemberDialog } from "@/components/team/InviteMemberDialog";
import { toast } from "sonner";
import { Trash2, Loader2 } from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { isQaiOrgUser, isQaiOrgAnalystUser } from "@/lib/constants";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "@/app/store/store";
import { removeUser, fetchUsers, updateUserRole } from "@/app/store/userSlice";
import Loading from "@/components/global/loading";
import { UserRole } from "@/lib/types";
import { DeleteConfirmationDialog } from "@/app/(dashboard)/[product]/homev1/test-cases/components/delete-confirmation-dialog";
import * as Sentry from "@sentry/nextjs";
import { transitions } from "@/lib/animations";

export default function TeamPageV2() {
  const [organizationName, setOrganizationName] = useState("QAI Internal");
  const [isRoleUpdateLoading, setIsRoleUpdateLoading] = useState(false);
  const [isDeleteLoading, setIsDeleteLoading] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [userToDelete, setUserToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const dispatch = useDispatch<AppDispatch>();
  const { users, loading } = useSelector((state: RootState) => state.users);

  const { user } = useUser();
  const userOrgId = user?.publicMetadata?.organisation_id as string | undefined;
  const isUserFromQaiOrg =
    isQaiOrgUser(userOrgId) || isQaiOrgAnalystUser(userOrgId);

  useEffect(() => {
    if (userOrgId) {
      dispatch(fetchUsers(userOrgId));
    }
  }, [dispatch, userOrgId]);

  const currentUser = users.find(
    (u) => u.email === user?.primaryEmailAddress?.emailAddress,
  );
  const currentUserRole = currentUser?.roles?.[0] ?? UserRole.TESTER;

  const handleDeleteClick = (
    userId: string,
    memberRole: UserRole,
    memberName: string,
  ) => {
    const isOwner = users.some(
      (u) => u.user_id === userId && u.roles?.includes(UserRole.OWNER),
    );

    if (isOwner) {
      toast.error("Owner account cannot be deleted");
      return;
    }

    if (!canDeleteUser(memberRole)) {
      toast.error("You don't have permission to delete this user");
      return;
    }
    setUserToDelete({ id: userId, name: memberName });
    setShowDeleteConfirmation(true);
  };

  const handleConfirmDelete = async () => {
    if (!userToDelete || isDeleteLoading) return;

    try {
      setIsDeleteLoading(true);
      const response = await fetch("/api/delete-user", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: userToDelete.id,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const error = new Error(errorData?.error || "Failed to delete user");
        Sentry.captureException(error, {
          level: "fatal",
          tags: { priority: "high" },
        });
        throw error;
      }

      dispatch(removeUser(userToDelete.id));
      toast.success("Team member removed successfully");
      setShowDeleteConfirmation(false);
      setUserToDelete(null);
    } catch (error) {
      console.error("Error removing member:", error);
      Sentry.captureException(error, {
        level: "fatal",
        tags: { priority: "high" },
      });
      toast.error(
        error instanceof Error ? error.message : "Failed to remove team member",
      );
    } finally {
      setIsDeleteLoading(false);
    }
  };

  const handleCancelDelete = () => {
    setShowDeleteConfirmation(false);
    setUserToDelete(null);
  };

  const handleRoleChange = async (memberId: string, newRole: UserRole) => {
    try {
      if (users.length === 1) {
        toast.error("Cannot change role when you're the only team member");
        return;
      }

      const member = users.find((u) => u.user_id === memberId);
      if (
        member?.roles?.includes(UserRole.OWNER) ||
        newRole === UserRole.OWNER
      ) {
        toast.error("Owner role cannot be changed");
        return;
      }

      setIsRoleUpdateLoading(true);
      const response = await fetch("/api/update-user-role", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: memberId,
          roles: [newRole],
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update user role");
      }

      dispatch(updateUserRole({ userId: memberId, roles: [newRole] }));
      toast.success(`Role updated to ${newRole}`);
    } catch (error) {
      console.error("Error updating role:", error);
      Sentry.captureException(error, {
        level: "fatal",
        tags: { priority: "high" },
      });
      toast.error("Failed to update user role");
    } finally {
      setIsRoleUpdateLoading(false);
    }
  };

  const canEditRole = (memberRole: UserRole, memberId: string) => {
    if (users.length === 1) {
      return false;
    }

    const member = users.find((u) => u.user_id === memberId);
    if (member?.roles?.includes(UserRole.OWNER)) {
      return false;
    }

    if (currentUserRole === UserRole.OWNER) {
      return true;
    }

    if (currentUserRole === UserRole.ADMIN) {
      return memberRole !== UserRole.OWNER;
    }
    return false;
  };

  const canDeleteUser = (memberRole: UserRole) => {
    const isOwner = users.some(
      (u) => u.roles?.includes(UserRole.OWNER) && u.roles?.[0] === memberRole,
    );

    if (isOwner) {
      return false;
    }

    if (currentUserRole === UserRole.OWNER) {
      return true;
    }

    if (currentUserRole === UserRole.ADMIN) {
      return memberRole !== UserRole.OWNER;
    }
    return false;
  };

  return (
    <div className="absolute inset-0 bg-white pointer-events-auto z-10 overflow-auto">
      <div className="p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={transitions.normal}
          className="max-w-4xl space-y-8 pb-10 mx-auto"
        >
          <DeleteConfirmationDialog
            isOpen={showDeleteConfirmation}
            isDeleting={isDeleteLoading}
            title="Delete Team Member"
            description={`Are you sure you want to delete ${userToDelete?.name || "this user"}? This action cannot be undone.`}
            onConfirm={handleConfirmDelete}
            onCancel={handleCancelDelete}
          />

          <div>
            <h1 className="text-2xl font-bold text-foreground mb-2">
              Team & Organization
            </h1>
            <p className="text-muted-foreground">
              Manage your organization settings and team members.
            </p>
          </div>

          {/* Organization Section - Only displayed for QAI internal users for now as there is no api for get org name*/}
          {isUserFromQaiOrg && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">
                Organization
              </h2>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground w-32">
                  Organization Name
                </span>
                <Input
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                  className="max-w-md"
                  disabled={true}
                />
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Members</h2>
              <InviteMemberDialog
                currentUserRole={currentUserRole as UserRole}
              />
            </div>

            {loading ? (
              <div className="flex justify-center items-center min-h-[200px]">
                <Loading />
              </div>
            ) : (
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left p-4 text-sm font-medium text-muted-foreground">
                        Name
                      </th>
                      <th className="text-left p-4 text-sm font-medium text-muted-foreground">
                        Email
                      </th>
                      <th className="text-left p-4 text-sm font-medium text-muted-foreground">
                        Role
                      </th>
                      <th className="text-left p-4 text-sm font-medium text-muted-foreground">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((member) => (
                      <tr
                        key={member.user_id}
                        className="border-b border-border last:border-b-0"
                      >
                        <td className="p-4 text-sm text-foreground">{`${member.first_name} ${member.last_name}`}</td>
                        <td className="p-4 text-sm text-foreground">
                          {member.email}
                        </td>
                        <td className="p-4">
                          <Select
                            value={member.roles?.[0] || UserRole.TESTER}
                            onValueChange={(newRole: UserRole) =>
                              handleRoleChange(member.user_id, newRole)
                            }
                            disabled={
                              !canEditRole(
                                (member.roles?.[0] as UserRole) ||
                                  UserRole.TESTER,
                                member.user_id,
                              ) || isRoleUpdateLoading
                            }
                          >
                            <SelectTrigger className="w-28">
                              <SelectValue>
                                {member.roles?.[0] || UserRole.TESTER}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {currentUserRole === UserRole.OWNER && (
                                <SelectItem value={UserRole.ADMIN}>
                                  {UserRole.ADMIN}
                                </SelectItem>
                              )}
                              {currentUserRole === UserRole.ADMIN && (
                                <SelectItem value={UserRole.ADMIN}>
                                  {UserRole.ADMIN}
                                </SelectItem>
                              )}
                              <SelectItem value={UserRole.BILLING}>
                                {UserRole.BILLING}
                              </SelectItem>
                              <SelectItem value={UserRole.TESTER}>
                                {UserRole.TESTER}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-4">
                          <button
                            onClick={() =>
                              handleDeleteClick(
                                member.user_id,
                                (member.roles?.[0] as UserRole) ??
                                  UserRole.TESTER,
                                `${member.first_name} ${member.last_name}`,
                              )
                            }
                            disabled={
                              !canDeleteUser(
                                (member.roles?.[0] as UserRole) ||
                                  UserRole.TESTER,
                              ) || isDeleteLoading
                            }
                            className="text-muted-foreground hover:text-destructive transition-colors duration-fast disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            {isDeleteLoading &&
                            userToDelete?.id === member.user_id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
