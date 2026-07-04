import type { AddonContext } from "@wealthfolio/addon-sdk";
import type { AddonSettings } from "./types";

const SECRETS_KEY = "config";

export const DEFAULT_SETTINGS: AddonSettings = {
  cashAccountId: "",
  portfolioAccountId: "",
  transferPatterns: [],
};

export async function loadSettings(ctx: AddonContext): Promise<AddonSettings> {
  try {
    const raw = await ctx.api.secrets.get(SECRETS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(ctx: AddonContext, settings: AddonSettings): Promise<void> {
  await ctx.api.secrets.set(SECRETS_KEY, JSON.stringify(settings));
}
