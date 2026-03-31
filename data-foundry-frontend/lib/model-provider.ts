export function inferProviderByModel(model: string): string | null {
  const normalized = model.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized.includes("glm") || normalized.includes("glp")) {
    return "智谱AI";
  }

  if (normalized.includes("kimi")) {
    return "Moonshot";
  }

  if (normalized.includes("deepseek")) {
    return "DeepSeek";
  }

  if (normalized.includes("gpt") || normalized.startsWith("o1") || normalized.startsWith("o3")) {
    return "OpenAI";
  }

  return null;
}

export function normalizeProviderByModel(model: string, provider: string): string {
  const inferred = inferProviderByModel(model);
  if (!inferred) {
    return provider;
  }
  return inferred;
}
