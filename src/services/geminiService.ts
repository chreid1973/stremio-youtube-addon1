// src/services/geminiService.ts
// Minimal shim so builds never fail in static mode.
// Replace with real Gemini calls later.

export async function summarize(text: string): Promise<string> {
  // return a short placeholder summary
  return `Summary: ${text.slice(0, 120)}${text.length > 120 ? '…' : ''}`;
}

export async function suggestTags(input: string): Promise<string[]> {
  // naive tagger: split words and de-dupe a bit
  const words = input.toLowerCase().match(/[a-z0-9@#]+/g) || [];
  const uniq = Array.from(new Set(words)).slice(0, 5);
  return uniq;
}

// If ChannelCard imports default:
export default { summarize, suggestTags };
