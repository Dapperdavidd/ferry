import { PRODUCTION_BACKEND_URL, resolveBackendUrl } from "../runtimeConfig";

describe("backend runtime configuration", () => {
  it("uses the deployed API for a release archive without a local env file", () => {
    expect(resolveBackendUrl(undefined, false)).toBe(PRODUCTION_BACKEND_URL);
  });

  it("keeps local development local by default", () => {
    expect(resolveBackendUrl(undefined, true)).toBe("http://localhost:8000");
  });

  it("honours an explicit backend and removes its trailing slash", () => {
    expect(resolveBackendUrl("  https://staging.ferry.money/  ", false)).toBe(
      "https://staging.ferry.money"
    );
  });

  it("does not turn a blank release variable into an invalid relative URL", () => {
    expect(resolveBackendUrl("   ", false)).toBe(PRODUCTION_BACKEND_URL);
  });
});
