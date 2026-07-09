export const TASK_TYPES = [
  { value: "normal", label: "Normale" },
  { value: "important", label: "Importante" },
  { value: "growth", label: "Crescita personale" },
  { value: "project", label: "Sharkmo / Progetto" },
  { value: "health", label: "Salute / Disciplina" },
];

export function getTaskTypeLabel(value) {
  return TASK_TYPES.find((type) => type.value === value)?.label || "Normale";
}
