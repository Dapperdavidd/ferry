import { checkDropClaim } from "../dropAuthorization";

const contract = "0x1111111111111111111111111111111111111111";
const recipient = "0x2222222222222222222222222222222222222222";
const claimHash = `0x${"33".repeat(32)}`;
const typedData = {
  domain: {
    name: "FerryDrop",
    version: "1",
    chainId: 10143,
    verifyingContract: contract,
  },
  types: {
    Claim: [
      { name: "claimHash", type: "bytes32" },
      { name: "recipient", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
  },
  primaryType: "Claim",
  message: { claimHash, recipient, deadline: "2000000000" },
};

test("accepts the exact claim the screen shows", () => {
  expect(
    checkDropClaim(typedData, {
      claimHash,
      recipient,
      chainId: 10143,
      verifyingContract: contract,
      deadline: "2000000000",
    })
  ).toBeNull();
});

test("rejects a redirected recipient", () => {
  expect(
    checkDropClaim(
      { ...typedData, message: { ...typedData.message, recipient: contract } },
      {
        claimHash,
        recipient,
        chainId: 10143,
        verifyingContract: contract,
        deadline: "2000000000",
      }
    )
  ).toBe("wrong recipient");
});
