/**
 * Placeholder para resumo via modelo local (Ollama) sem enviar o prompt integral ao Grau 33.
 */
export function summarizeLocally(text: string, maxChars = 4000): string {
  if (text.length <= maxChars) return text;
  const head = text.slice(0, Math.floor(maxChars * 0.55));
  const tail = text.slice(-Math.floor(maxChars * 0.35));
  return `${head}\n\n[… trecho omitido localmente (${text.length - maxChars} caracteres) …]\n\n${tail}`;
}
