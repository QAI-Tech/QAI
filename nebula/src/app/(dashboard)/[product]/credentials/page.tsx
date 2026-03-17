"use client";

import { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch } from "@/app/store/store";
import { motion, AnimatePresence } from "framer-motion";
import { CredentialCard } from "./components/CredentialCard";
import { CredentialDetails } from "./components/CredentialDetails";
import { useProductSwitcher } from "@/providers/product-provider";
import { Plus, KeyRound } from "lucide-react";
import { transitions } from "@/lib/animations";
import {
  fetchCredentials,
  addCredential,
  deleteCredential as deleteCredentialAction,
  selectCredentials,
  selectCredentialsLoading,
  selectDefaultCredentialsId,
  updateCredential,
} from "@/app/store/credentialsSlice";
import { Credential } from "@/lib/types";
import { useGraphFlows } from "@/app/context/graph-flows-context";
import { useMemo } from "react";
import { toast } from "sonner";
import * as Sentry from "@sentry/nextjs";

export default function CredentialsPage() {
  const dispatch = useDispatch<AppDispatch>();
  const { productSwitcher } = useProductSwitcher();
  const credentialsMap = useSelector(selectCredentials);
  const isLoading = useSelector(selectCredentialsLoading);
  const defaultCredentialsId = useSelector(selectDefaultCredentialsId);
  const { flows } = useGraphFlows();

  // Convert credentials map to array
  const credentials = Object.values(credentialsMap || {});

  const [selectedCredential, setSelectedCredential] =
    useState<Credential | null>(null);

  // Find flows that use the selected credential
  const flowsUsingCredential = useMemo(() => {
    if (!selectedCredential || selectedCredential.id.startsWith("temp-")) {
      return [];
    }
    return flows.filter(
      (flow) =>
        flow.credentials && flow.credentials.includes(selectedCredential.id),
    );
  }, [selectedCredential, flows]);

  // Fetch credentials when component mounts
  useEffect(() => {
    if (productSwitcher.product_id) {
      dispatch(fetchCredentials(productSwitcher.product_id));
    }
  }, [productSwitcher.product_id, dispatch]);

  const handleCredentialClick = (credential: Credential) => {
    if (selectedCredential?.id === credential.id) {
      setSelectedCredential(null);
    } else {
      setSelectedCredential(credential);
    }
  };

  const handleNewCredential = () => {
    const newCredential = {
      id: `temp-${Date.now()}`,
      name: `New Credential ${credentials.length + 1}`,
      description: "",
      username: "",
      password: "",
      isDefault: credentials.length === 0,
      flowIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Create a temporary credential for the UI
    const tempCredential: Credential = {
      id: newCredential.id,
      description: newCredential.name,
      credentials: {
        username: newCredential.username,
        password: newCredential.password,
      },
      created_at: newCredential.createdAt.toISOString(),
      updated_at: newCredential.updatedAt.toISOString(),
      product_id: productSwitcher.product_id || "",
    };

    setSelectedCredential(tempCredential);
  };

  const handleUpdateCredential = (
    id: string,
    updates: Partial<Credential> & {
      isDefault?: boolean;
      name?: string;
      credentials?: Record<string, string>;
    },
  ) => {
    if (!productSwitcher.product_id) return;

    if (id.startsWith("temp-")) {
      // For new credentials, create them
      dispatch(
        addCredential({
          productId: productSwitcher.product_id,
          data: {
            credentials: updates.credentials || {},
            description: updates.name || "",
            is_default: updates.isDefault || false,
          },
        }),
      );
      setSelectedCredential(null);
      return;
    }

    // For existing credentials, update them
    const existingCred = credentialsMap[id];
    if (!existingCred) return;

    dispatch(
      updateCredential({
        credentialId: id,
        productId: productSwitcher.product_id,
        data: {
          // Replace existing credentials with updates to allow key changes (e.g. username -> email)
          credentials: updates.credentials || existingCred.credentials,
          description:
            updates.name !== undefined
              ? updates.name
              : existingCred.description,
          is_default:
            updates.isDefault !== undefined
              ? updates.isDefault
              : id === defaultCredentialsId,
        },
      }),
    );
  };

  const handleDeleteCredential = (id: string) => {
    if (!productSwitcher.product_id) return;

    if (id.startsWith("temp-")) {
      // For temporary credentials, just clear the selection
      setSelectedCredential(null);
      return;
    }

    dispatch(
      deleteCredentialAction({
        credentialId: id,
        productId: productSwitcher.product_id,
        testCaseId: "",
      }),
    );
    setSelectedCredential(null);
  };

  const handleSetDefaultCredential = (id: string) => {
    if (!productSwitcher.product_id || id.startsWith("temp-")) return;

    const existingCred = credentialsMap[id];
    if (!existingCred) return;

    dispatch(
      updateCredential({
        credentialId: id,
        productId: productSwitcher.product_id,
        data: {
          credentials: existingCred.credentials,
          description: existingCred.description,
          is_default: true,
        },
      }),
    )
      .then(() => {
        toast.success(
          `"${existingCred.description}" is now set as the default credential.`,
        );

        if (selectedCredential && selectedCredential.id === id) {
          const updatedCredential = {
            ...selectedCredential,
            id: selectedCredential.id,
          };
          setSelectedCredential({ ...updatedCredential });
        }
      })
      .catch((error) => {
        toast.error("Failed to update default credential.");
        Sentry.captureException(error, {
          extra: {
            credentialId: id,
            productId: productSwitcher.product_id,
          },
        });
        throw error;
      });
  };

  // Get the current credential from Redux state
  const currentCredential =
    selectedCredential?.id && !selectedCredential.id.startsWith("temp-")
      ? credentialsMap[selectedCredential.id] || selectedCredential
      : selectedCredential;

  // Convert Redux credentials
  const mappedCredentials = credentials.map((cred) => {
    // Find flows that use this credential
    const flowsUsingThisCred = flows.filter(
      (flow) => flow.credentials && flow.credentials.includes(cred.id),
    );

    return {
      id: cred.id,
      name: cred.description || "",
      description: "", // This is actually shown from username in the card
      username: cred.credentials.username || cred.credentials.email || "",
      password: cred.credentials.password || "",
      isDefault: cred.id === defaultCredentialsId,
      flowIds: flowsUsingThisCred.map((f) => f.id),
      createdAt: new Date(cred.created_at),
      updatedAt: cred.updated_at
        ? new Date(cred.updated_at)
        : new Date(cred.created_at),
    };
  });

  return (
    <div className="h-full w-full relative pointer-events-none">
      {/* Credentials List/Details - same width as flows list */}
      <div className="w-1/3 border-r border-border overflow-y-auto h-full pointer-events-auto bg-background">
        <AnimatePresence mode="wait">
          {currentCredential ? (
            <CredentialDetails
              key={currentCredential.id}
              credential={{
                id: currentCredential.id,
                name: currentCredential.description || "",
                description: "", // Not used in detail view
                credentials: currentCredential.credentials || {},
                isDefault: currentCredential.id === defaultCredentialsId,
                flowIds: flowsUsingCredential.map((f) => f.id),
                createdAt: new Date(currentCredential.created_at),
                updatedAt: currentCredential.updated_at
                  ? new Date(currentCredential.updated_at)
                  : new Date(currentCredential.created_at),
              }}
              flows={flowsUsingCredential}
              productId={productSwitcher.product_id}
              onDelete={() => handleDeleteCredential(currentCredential.id)}
              onBack={() => setSelectedCredential(null)}
              onUpdate={(updates) => {
                handleUpdateCredential(currentCredential.id, {
                  name: updates.name,
                  credentials: updates.credentials,
                  isDefault: updates.isDefault,
                });
              }}
              onSetDefault={() =>
                handleSetDefaultCredential(currentCredential.id)
              }
            />
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={transitions.fast}
              className="p-4 space-y-3"
            >
              <button
                onClick={handleNewCredential}
                className="flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors duration-fast"
              >
                <Plus className="h-4 w-4" />
                New Credentials
              </button>

              {isLoading ? (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">
                    Loading credentials...
                  </p>
                </div>
              ) : credentials.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                    <KeyRound className="h-6 w-6 text-primary" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    No credentials yet
                  </p>
                </div>
              ) : (
                mappedCredentials.map((credential) => (
                  <CredentialCard
                    key={credential.id}
                    credential={credential}
                    isSelected={selectedCredential?.id === credential.id}
                    onClick={() =>
                      handleCredentialClick(credentialsMap[credential.id])
                    }
                  />
                ))
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
