// Minimal, build-safe shim. Replace with real Gemini code later.

export async function summarize(text: string): Promise<string> {
  return `Summary: ${text.slice(0, 100)}${text.length > 100 ? '…' : ''}`;
}

// Alias to satisfy ChannelCard's named import
export async function getSummary(text: string): Promise<string> {
  return summarize(text);
}

export async function analyzeChannel(name: string): Promise<string> {
  return `Analysis of ${name} coming soon.`;
}

// Optional default export (covers any default-style imports elsewhere)
export default { summarize, getSummary, analyzeChannel };

