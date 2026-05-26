export const SHORTCUTS = [
  { keys: "g d", label: "Go to demands" },
  { keys: "g n", label: "New demand" },
  { keys: "g p", label: "Open current demand agents" },
  { keys: "⌘K", label: "Command palette" },
  { keys: "?", label: "Shortcut help" },
  { keys: "Esc", label: "Close overlay" },
];

export function isEditableTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  if (!element) return false;
  const tag = element.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || element.isContentEditable;
}
