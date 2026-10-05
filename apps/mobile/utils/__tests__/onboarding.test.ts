import { canFinishOnboarding, type HandleAvailability } from "../onboarding";

const canFinish = (
  availability: HandleAvailability,
  overrides: Partial<Parameters<typeof canFinishOnboarding>[0]> = {}
) =>
  canFinishOnboarding({
    validHandle: true,
    availability,
    homeSelected: true,
    saving: false,
    ...overrides,
  });

describe("onboarding completion", () => {
  it("allows a verified available handle", () => {
    expect(canFinish("available")).toBe(true);
  });

  it("does not strand a user when the optional preflight check is offline", () => {
    expect(canFinish("unverified")).toBe(true);
  });

  it("blocks known taken and in-flight handles", () => {
    expect(canFinish("taken")).toBe(false);
    expect(canFinish("checking")).toBe(false);
    expect(canFinish("idle")).toBe(false);
  });

  it("still requires a valid handle and home currency", () => {
    expect(canFinish("available", { validHandle: false })).toBe(false);
    expect(canFinish("available", { homeSelected: false })).toBe(false);
    expect(canFinish("available", { saving: true })).toBe(false);
  });
});
