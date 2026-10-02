// AI tag values arrive lowercase and hyphenated, e.g. "polka-dot" or "business-casual" (see
// PATTERNS, SEASONS and FORMALITY_LEVELS in server/src/gemini/constants.ts). This turns them into
// "Polka dot" and "Business casual". Older free-text values like "Solid" come out unchanged.
export function formatTag(value: string): string {
  const words = value.trim().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
