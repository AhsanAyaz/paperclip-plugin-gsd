import type { AdapterCompat } from "./gsd-types.js";

/**
 * Known adapter compatibility with GSD.
 *
 * GSD is a CLI plugin system — it works in environments where
 * Claude Code, Gemini CLI, or similar tools are installed.
 */
const ADAPTER_COMPAT: Record<string, AdapterCompat> = {
  claude_local: "supported",
  opencode_local: "supported",
  process: "partial",
};

export function getAdapterCompat(adapterType: string): AdapterCompat {
  return ADAPTER_COMPAT[adapterType] ?? "unsupported";
}

export function getAdapterCompatMessage(
  adapterType: string,
  compat: AdapterCompat,
): string {
  switch (compat) {
    case "supported":
      return `${adapterType} natively supports GSD.`;
    case "partial":
      return `${adapterType} may support GSD if the GSD plugin is installed in the agent's environment.`;
    case "unsupported":
      return `${adapterType} does not currently support GSD. GSD requires a compatible coding environment (Claude Code, Gemini CLI, etc.).`;
  }
}
