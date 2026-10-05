import { VerifySchema } from "./dtos";

const request = {
  address: "0x0000000000000000000000000000000000000001",
  signature: `0x${"ab".repeat(65)}`,
};

describe("auth DTOs", () => {
  it("keeps older clients on account creation semantics", () => {
    expect(VerifySchema.parse(request).intent).toBe("create");
  });

  it("preserves an explicit sign-in intent", () => {
    expect(VerifySchema.parse({ ...request, intent: "signIn" }).intent).toBe(
      "signIn",
    );
  });
});
