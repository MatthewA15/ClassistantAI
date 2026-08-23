/** Tiny class joiner. Keeps a dependency off the tree for something this small. */
export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}
