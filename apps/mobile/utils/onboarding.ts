export type HandleAvailability =
  | "idle"
  | "checking"
  | "available"
  | "taken"
  | "unverified";

export function canFinishOnboarding(input: {
  validHandle: boolean;
  availability: HandleAvailability;
  homeSelected: boolean;
  saving: boolean;
}): boolean {
  return (
    input.validHandle &&
    (input.availability === "available" ||
      input.availability === "unverified") &&
    input.homeSelected &&
    !input.saving
  );
}
