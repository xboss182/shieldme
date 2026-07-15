export interface CreateAliasPayloadInput {
  serviceLabel: string;
  localPart: string;
  localPartEdited: boolean;
  domainId: string;
  recipientId: string;
  pgpMode: "none" | "optional" | "required";
}

export function createAliasPayload({
  serviceLabel,
  localPart,
  localPartEdited,
  domainId,
  recipientId,
  pgpMode,
}: CreateAliasPayloadInput) {
  return {
    serviceLabel: serviceLabel.trim() || undefined,
    localPart: localPartEdited ? localPart.trim() || undefined : undefined,
    domainId,
    recipientId,
    pgpMode,
  };
}
