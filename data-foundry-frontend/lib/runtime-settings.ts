import type {
  ModelProvider,
  RuntimeSettings,
} from "./domain";
import type { SearchEngineProvider } from "./types";

export const RUNTIME_SETTINGS_STORAGE_KEY = "data-foundry:runtime-settings";

export const MODEL_PROVIDER_OPTIONS: Array<{
  value: ModelProvider;
  label: string;
  hint: string;
}> = [
  { value: "doubao", label: "Doubao", hint: "" },
  { value: "qwen", label: "Qwen", hint: "" },
  { value: "deepseek", label: "DeepSeek", hint: "" },
  { value: "glm", label: "GLM", hint: "" },
  { value: "kimi", label: "Kimi", hint: "" },
];

export const SEARCH_ENGINE_OPTIONS: Array<{
  value: SearchEngineProvider;
  label: string;
  hint: string;
}> = [
  { value: "volcano", label: "Volcano 火山搜索", hint: "" },
  { value: "bing", label: "Bing 必应搜索", hint: "" },
];

export const SEARCH_ENGINE_LABELS: Record<SearchEngineProvider, string> = {
  volcano: "Volcano 火山搜索",
  bing: "Bing 必应搜索",
};

export const DEFAULT_RUNTIME_SETTINGS: RuntimeSettings = {
  maxConcurrentAgentTasks: 5,
  modelConfig: {
    provider: "doubao",
    enableThinking: false,
    temperature: 0.7,
  },
  searchConfig: {
    enabledSearchEngines: ["volcano", "bing"],
    parallelism: 4,
    llmApiEndpoint: "",
    ragServiceEndpoint: "",
  },
  confidenceConfig: {
    dataConfidence: 0.85,
    iterationRounds: 3,
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, numeric));
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function normalizeProvider(value: unknown): ModelProvider {
  const candidate = typeof value === "string" ? value.trim().toLowerCase() : "";
  return MODEL_PROVIDER_OPTIONS.some((option) => option.value === candidate)
    ? (candidate as ModelProvider)
    : DEFAULT_RUNTIME_SETTINGS.modelConfig.provider;
}

function normalizeSearchEngines(value: unknown): SearchEngineProvider[] {
  const validEngines = new Set<SearchEngineProvider>(
    SEARCH_ENGINE_OPTIONS.map((option) => option.value),
  );
  const result: SearchEngineProvider[] = [];
  for (const item of readList(value)) {
    if (validEngines.has(item as SearchEngineProvider) && !result.includes(item as SearchEngineProvider)) {
      result.push(item as SearchEngineProvider);
    }
  }
  return result.length > 0 ? result : DEFAULT_RUNTIME_SETTINGS.searchConfig.enabledSearchEngines;
}

function readNestedRecord(value: Record<string, unknown>, camelKey: string, snakeKey: string): Record<string, unknown> {
  const nested = value[camelKey] ?? value[snakeKey];
  return isRecord(nested) ? nested : {};
}

export function normalizeRuntimeSettings(raw: unknown): RuntimeSettings {
  const source = isRecord(raw) ? raw : {};
  const modelSource = readNestedRecord(source, "modelConfig", "model_config");
  const searchSource = readNestedRecord(source, "searchConfig", "search_config");
  const confidenceSource = readNestedRecord(source, "confidenceConfig", "confidence_config");

  return {
    maxConcurrentAgentTasks: clampNumber(
      source.maxConcurrentAgentTasks ?? source.max_concurrent_agent_tasks,
      1,
      64,
      DEFAULT_RUNTIME_SETTINGS.maxConcurrentAgentTasks,
    ),
    modelConfig: {
      provider: normalizeProvider(modelSource.provider ?? modelSource["provider"]),
      enableThinking: readBoolean(
        modelSource.enableThinking ?? modelSource.enable_thinking,
        DEFAULT_RUNTIME_SETTINGS.modelConfig.enableThinking,
      ),
      temperature: clampNumber(
        modelSource.temperature ?? modelSource.top_value ?? modelSource.topValue,
        0,
        1,
        DEFAULT_RUNTIME_SETTINGS.modelConfig.temperature,
      ),
    },
    searchConfig: {
      enabledSearchEngines: normalizeSearchEngines(
        searchSource.enabledSearchEngines ?? searchSource.enabled_search_engines,
      ),
      parallelism: clampNumber(
        searchSource.parallelism,
        1,
        32,
        DEFAULT_RUNTIME_SETTINGS.searchConfig.parallelism,
      ),
      llmApiEndpoint: readString(
        searchSource.llmApiEndpoint ?? searchSource.llm_api_endpoint,
        DEFAULT_RUNTIME_SETTINGS.searchConfig.llmApiEndpoint,
      ),
      ragServiceEndpoint: readString(
        searchSource.ragServiceEndpoint ?? searchSource.rag_service_endpoint,
        DEFAULT_RUNTIME_SETTINGS.searchConfig.ragServiceEndpoint,
      ),
    },
    confidenceConfig: {
      dataConfidence: clampNumber(
        confidenceSource.dataConfidence ?? confidenceSource.data_confidence,
        0,
        1,
        DEFAULT_RUNTIME_SETTINGS.confidenceConfig.dataConfidence,
      ),
      iterationRounds: clampNumber(
        confidenceSource.iterationRounds ?? confidenceSource.iteration_rounds,
        1,
        10,
        DEFAULT_RUNTIME_SETTINGS.confidenceConfig.iterationRounds,
      ),
    },
  };
}

export function loadRuntimeSettings(): RuntimeSettings {
  if (typeof window === "undefined") {
    return DEFAULT_RUNTIME_SETTINGS;
  }

  try {
    const stored = window.localStorage.getItem(RUNTIME_SETTINGS_STORAGE_KEY);
    if (!stored) {
      return DEFAULT_RUNTIME_SETTINGS;
    }
    return normalizeRuntimeSettings(JSON.parse(stored));
  } catch {
    return DEFAULT_RUNTIME_SETTINGS;
  }
}

export function saveRuntimeSettings(settings: RuntimeSettings): RuntimeSettings {
  const normalized = normalizeRuntimeSettings(settings);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      RUNTIME_SETTINGS_STORAGE_KEY,
      JSON.stringify(normalized),
    );
  }
  return normalized;
}

export function formatSearchEngineLabel(engine: SearchEngineProvider): string {
  return SEARCH_ENGINE_LABELS[engine] ?? engine;
}
