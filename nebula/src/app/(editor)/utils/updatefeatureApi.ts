import { GRAPH_COLLABORATION_SERVER_URL } from "@/lib/constants";
import * as Sentry from "@sentry/nextjs";

/**
 * Updates a feature via the REST API
 * @param featureId - The ID of the feature to update
 * @param updates - The updates to apply (name and/or nodeIds)
 * @param productId - The product ID
 * @returns Promise that resolves when the update is complete
 */
export async function updateFeatureViaApi(
  featureId: string,
  updates: {
    name?: string;
    nodeIds?: string[];
  },
  productId: string | null,
): Promise<void> {
  try {
    const body: {
      id: string;
      product_id: string | null;
      name?: string;
      nodeIds?: string[];
    } = {
      id: featureId,
      product_id: productId,
    };

    if (updates.name !== undefined) {
      body.name = updates.name;
    }
    if (updates.nodeIds !== undefined) {
      body.nodeIds = updates.nodeIds;
    }

    const resp = await fetch(
      `${GRAPH_COLLABORATION_SERVER_URL}/api/graph-events/features/update`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );

    if (!resp.ok) {
      const txt = await resp.text().catch(() => resp.statusText);
      throw new Error(txt || "Failed to update feature");
    }
  } catch (error) {
    console.error("Failed to update feature via API:", error);
    Sentry.captureException(error, {
      level: "fatal",
      tags: { priority: "high" },
    });
    throw error;
  }
}

export async function deleteFeatureViaApi(
  featureId: string,
  productId: string | null,
): Promise<void> {
  try {
    const resp = await fetch(
      `${GRAPH_COLLABORATION_SERVER_URL}/api/graph-events/features/delete`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: featureId,
          product_id: productId,
        }),
      },
    );

    if (!resp.ok) {
      const txt = await resp.text().catch(() => resp.statusText);
      throw new Error(txt || "Failed to delete feature");
    }
  } catch (error) {
    console.error("Failed to delete feature via API:", error);
    Sentry.captureException(error, {
      level: "fatal",
      tags: { priority: "high" },
    });
    throw error;
  }
}
