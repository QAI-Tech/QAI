import { useEffect, useState, useRef } from "react";
import type { testCaseSchema, MetaGraphs } from "@/lib/types";

interface UseFinalSlideProps {
  localTestCase: testCaseSchema | null;
  metaGraphs: {
    nodesById: Record<string, unknown> | null;
    edgesById: Record<string, unknown> | null;
  };
  fetchSignedUrlForStepImage: (
    stepIdx: number,
    imageUrl: string,
  ) => Promise<string | null>;
  toHttpUrl: (src: string) => string;
  flowStepsLength: number;
}

interface UseFinalSlideReturn {
  finalSlideHttp: string | null;
  isFinalSlideLoading: boolean;
}

export function useFinalSlide({
  localTestCase,
  metaGraphs,
  fetchSignedUrlForStepImage,
  toHttpUrl,
  flowStepsLength,
}: UseFinalSlideProps): UseFinalSlideReturn {
  const [finalSlideHttp, setFinalSlideHttp] = useState<string | null>(null);
  const [isFinalSlideLoading, setIsFinalSlideLoading] = useState(false);

  const fetchSignedUrlRef = useRef(fetchSignedUrlForStepImage);
  const toHttpUrlRef = useRef(toHttpUrl);

  fetchSignedUrlRef.current = fetchSignedUrlForStepImage;
  toHttpUrlRef.current = toHttpUrl;

  const getFinalSlideFromMetadata = async (): Promise<string | null> => {
    try {
      if (
        !localTestCase?.test_case_steps ||
        !metaGraphs ||
        flowStepsLength === 0
      ) {
        return null;
      }
      const { nodesById, edgesById } = metaGraphs as MetaGraphs;
      if (!nodesById || !edgesById) return null;

      let lastRegularIdx = -1;
      for (let i = localTestCase.test_case_steps.length - 1; i >= 0; i--) {
        const st = localTestCase.test_case_steps[i] as { type?: string };
        if (st?.type !== "ADHOC_STEP") {
          lastRegularIdx = i;
          break;
        }
      }
      if (lastRegularIdx < 0) return null;

      const step = localTestCase.test_case_steps[lastRegularIdx] as {
        edge_id?: string;
      };
      const edgeId = step?.edge_id;
      if (!edgeId || !edgesById[edgeId]) return null;
      const edge = edgesById[edgeId];
      const targetId = edge?.target || edge?.source;
      if (!targetId || !nodesById[targetId]) return null;
      const node = nodesById[targetId];
      const raw =
        node?.data?.image ||
        node?.data?.frame_url ||
        node?.data?.screenshot_url;
      if (!raw || typeof raw !== "string" || raw.length === 0) return null;
      const httpUrl = toHttpUrlRef.current(raw);
      const signed = await fetchSignedUrlRef.current(lastRegularIdx, httpUrl);
      return signed;
    } catch (e) {
      console.error("Failed to compute final (n+1) slide:", e);
      return null;
    }
  };

  useEffect(() => {
    let cancelled = false;

    setIsFinalSlideLoading(true);
    getFinalSlideFromMetadata()
      .then((signed) => {
        if (!cancelled) setFinalSlideHttp(signed);
      })
      .finally(() => {
        if (!cancelled) setIsFinalSlideLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [localTestCase?.test_case_steps, flowStepsLength, metaGraphs]);

  return { finalSlideHttp, isFinalSlideLoading };
}
