export function reportLovableError(error: unknown, context: Record<string, unknown> = {}) {
  console.error("Client error", error, context);
}
