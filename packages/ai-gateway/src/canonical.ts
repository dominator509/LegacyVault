function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return typeof value === "string" ? value.normalize("NFC") : value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export interface PromptEnvelope {
  promptFamily: string;
  promptVersion: string;
  globalPolicy: string;
  taskPolicy: string;
  outputSchema: unknown;
  safeHouseholdCapsule: unknown;
  content: string;
}

export function buildPrompt(envelope: PromptEnvelope): {
  stablePrefix: string;
  volatileContent: string;
} {
  return {
    stablePrefix: stableStringify({
      globalPolicy: envelope.globalPolicy,
      outputSchema: envelope.outputSchema,
      promptFamily: envelope.promptFamily,
      promptVersion: envelope.promptVersion,
      safeHouseholdCapsule: envelope.safeHouseholdCapsule,
      taskPolicy: envelope.taskPolicy,
    }),
    volatileContent: envelope.content.normalize("NFC").trim(),
  };
}
