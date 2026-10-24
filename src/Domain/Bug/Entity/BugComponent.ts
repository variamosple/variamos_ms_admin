// Part of VariaMos a bug concerns (T-23, EV-84 lot 5, decision D5)
export const BUG_COMPONENTS = [
  "language",
  "model",
  "microservice",
  "admin",
  "other",
] as const;
export type BugComponentValue = (typeof BUG_COMPONENTS)[number];

// As written in the body of a GitHub issue
export const BUG_COMPONENT_LABELS: Record<BugComponentValue, string> = {
  language: "Language",
  model: "Model",
  microservice: "Microservice",
  admin: "Administration interface",
  other: "Other",
};

export const isBugComponent = (value: string): value is BugComponentValue =>
  (BUG_COMPONENTS as readonly string[]).includes(value);
