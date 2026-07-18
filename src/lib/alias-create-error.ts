function errorCode(error: unknown) {
  return typeof error === "object" && error && "code" in error
    ? (error as { code?: unknown }).code
    : undefined;
}

function withGuidance(message: string, guidance: string) {
  return `${message.replace(/[.\s]+$/, "")}. ${guidance}`;
}

export function aliasCreationErrorMessage(error: unknown) {
  if (errorCode(error) === "RESERVED_ALIAS") {
    return "That alias name is reserved. Please choose or regenerate a different name.";
  }
  const message = error instanceof Error ? error.message : "Failed to create alias";
  return /already exists|reserved/i.test(message)
    ? withGuidance(message, "Please choose or regenerate a different alias name.")
    : message;
}
