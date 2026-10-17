/**
 * Case-, accent- and punctuation-insensitive whole-word match:
 * "SELECT", "select", "Select!" and "¡sélect!" match "select";
 * "selection" and "preselect" do not.
 */
export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function matchesKeyword(text: string | null | undefined, keywords: readonly string[]): boolean {
  if (!text) return false;
  const words = new Set(normalizeForMatch(text).split(" ").filter(Boolean));
  return keywords.some((keyword) => {
    const parts = normalizeForMatch(keyword).split(" ").filter(Boolean);
    if (parts.length === 0) return false;
    if (parts.length === 1) return words.has(parts[0]);
    return ` ${normalizeForMatch(text)} `.includes(` ${parts.join(" ")} `);
  });
}
