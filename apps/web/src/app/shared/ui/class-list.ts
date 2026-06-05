export function splitClasses(classes: string): string[] {
  return classes.split(/\s+/).filter(Boolean);
}
