function errorCode(error: unknown) {
  return typeof error === "object" && error && "code" in error
    ? (error as { code?: unknown }).code
    : undefined;
}

function withGuidance(message: string) {
  return `${message.replace(/[.\s]+$/, "")}. Regenerate or edit the alias name and try again.`;
}

export function aliasCreationErrorMessage(error: unknown) {
  if (errorCode(error) === "RESERVED_ALIAS") {
    return "That alias name is reserved. Regenerate or edit the alias name and try again.";
  }
  const message = error instanceof Error ? error.message : "Failed to create alias";
  return /already exists|reserved/i.test(message) ? withGuidance(message) : message;
}
