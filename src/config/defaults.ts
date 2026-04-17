export const DEFAULT_CONFIG = {
  title: "safetynet config",
  allowlist: {
    paths: [] as string[],
    commits: [] as string[],
    stopwords: [] as string[],
  },
  classifier: {
    model: "safetynet-ner",
    modelDir: "",
    threshold: 0.85,
    minConfidence: 0.5,
    maxTokens: 8192,
    concurrency: 4,
  },
};