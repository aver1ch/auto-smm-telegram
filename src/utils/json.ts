export function extractJsonObject(rawText: string): unknown {
  const trimmed = rawText.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    // Ignore direct parse failure and fall back to fenced blocks.
  }

  const fencedMatch = trimmed.match(/```json\s*([\s\S]*?)```/i) ?? trimmed.match(/```\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return JSON.parse(fencedMatch[1].trim());
  }

  const objectMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!objectMatch) {
    throw new Error("Model response did not contain a JSON object");
  }

  return JSON.parse(objectMatch[0]);
}
