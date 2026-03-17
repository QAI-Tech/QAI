import type {
  Scenario,
  TestCaseUnderExecutionSchema,
  TestCaseParameter,
} from "@/lib/types";

/**
 * This function creates a single text string from a TCUE by combining its
 * description, step details, expected results, and preconditions.
 */
export function buildTcueTextCorpus(
  tcue: TestCaseUnderExecutionSchema,
): string {
  let text = "";
  try {
    text += (tcue.test_case_description || "") + "\n";
    (tcue.test_case_steps || []).forEach((step) => {
      text += (step.step_description || "") + "\n";
      (step.expected_results || []).forEach((r) => (text += (r || "") + "\n"));
    });
    (tcue.preconditions || []).forEach((p) => (text += (p || "") + "\n"));
  } catch (error) {
    console.error("Error building Tcue text corpus", error);
  }
  return text;
}

export function computeContentMatchScore(
  tcue: TestCaseUnderExecutionSchema,
  scenarioMetaParams?: TestCaseParameter[],
): number {
  if (!scenarioMetaParams || scenarioMetaParams.length === 0) return 0;

  const text = buildTcueTextCorpus(tcue).toLowerCase();
  let score = 0;

  for (const p of scenarioMetaParams) {
    if (!p?.parameter_value) continue;
    const value = p.parameter_value.toLowerCase().trim();
    if (!value) continue;

    const hasExactPhrase =
      text.includes(` ${value} `) ||
      text.startsWith(value + " ") ||
      text.endsWith(" " + value) ||
      text === value;

    if (hasExactPhrase) {
      score += 2;
    } else if (text.includes(value)) {
      score += 1;
    }
  }

  return score;
}

export function orderTcueByScenarioMeta(
  tcueList: TestCaseUnderExecutionSchema[],
  scenarios: Scenario[] = [],
): TestCaseUnderExecutionSchema[] {
  if (!scenarios || scenarios.length === 0) return tcueList;

  const remainingTcueList = [...tcueList];
  const ordered: TestCaseUnderExecutionSchema[] = [];

  scenarios.forEach((scenario) => {
    let bestIdx = -1;
    let bestScore = -1;
    remainingTcueList.forEach((tcue, idx) => {
      const score = computeContentMatchScore(tcue, scenario.params);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = idx;
      }
    });

    if (bestIdx !== -1) {
      ordered.push(remainingTcueList[bestIdx]);
      remainingTcueList.splice(bestIdx, 1);
    }
  });

  return [...ordered, ...remainingTcueList];
}

export function mapTcueToBestScenarioMeta(
  tcueList: TestCaseUnderExecutionSchema[],
  metas: Scenario[] = [],
): Record<string, Scenario | undefined> {
  const mapping: Record<string, Scenario | undefined> = {};

  for (const tcue of tcueList) {
    let best: Scenario | undefined = undefined;
    let bestScore = -1;

    metas.forEach((m) => {
      const s = computeContentMatchScore(tcue, m.params);
      if (s > bestScore) {
        bestScore = s;
        best = m;
      } else if (s === bestScore && s > 0 && best) {
        const bestLength = (best.params || []).reduce(
          (acc, p) => acc + (p?.parameter_value?.length || 0),
          0,
        );
        const candidateLength = (m.params || []).reduce(
          (acc, p) => acc + (p?.parameter_value?.length || 0),
          0,
        );
        if (candidateLength > bestLength) {
          best = m;
        }
      }
    });

    mapping[tcue.id] = best;
  }

  return mapping;
}
