import {
  ContractFunctionRevertedError,
  encodeErrorResult,
  getAddress,
  type Hex,
} from "viem";
import type { ChainService } from "../chain/chain.service";
import { ferryFlowAbi } from "./flow.abi";
import {
  FlowRelayError,
  ViemFlowRelayer,
  isDefinitelyPreBroadcastFailure,
} from "./flow-relayer";

const FLOW_ADDRESS = getAddress("0x1000000000000000000000000000000000000001");
const OWNER = getAddress("0x2000000000000000000000000000000000000002");
const SIGNATURE = `0x${"01".repeat(32)}${"02".repeat(32)}1b` as Hex;

function setup(options: {
  simulateFails?: boolean;
  simulateError?: Error;
  writeFails?: boolean;
}) {
  const writeContract = options.writeFails
    ? jest.fn().mockRejectedValue(new Error("submission result unknown"))
    : jest.fn().mockResolvedValue(`0x${"aa".repeat(32)}`);
  const chain = {
    chainId: 10143,
    publicClient: {
      simulateContract:
        options.simulateFails || options.simulateError
          ? jest
              .fn()
              .mockRejectedValue(
                options.simulateError ?? new Error("simulation failed"),
              )
          : jest.fn().mockResolvedValue({ request: {} }),
      estimateContractGas: jest.fn().mockResolvedValue(100_000n),
    },
    requireRelayer: () => ({
      account: { address: OWNER },
      wallet: { chain: { id: 10143 }, writeContract },
    }),
  } as unknown as ChainService;
  const config = {
    get: (key: string) =>
      key === "FLOW_CONTRACT_ADDRESS" ? FLOW_ADDRESS : undefined,
  };
  const relayer = new ViemFlowRelayer(config as never, chain);
  return { relayer, writeContract };
}

const authorization = {
  kind: "configure" as const,
  owner: OWNER,
  destinations: [OWNER],
  basisPoints: [10_000n],
  nonce: 0n,
  deadline: 2_000_000_000n,
};

describe("ViemFlowRelayer failure phases", () => {
  it("marks simulation failure as definitely pre-broadcast", async () => {
    const { relayer, writeContract } = setup({ simulateFails: true });

    const error = await relayer
      .configure(authorization, SIGNATURE)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(FlowRelayError);
    expect(isDefinitelyPreBroadcastFailure(error)).toBe(true);
    expect(writeContract).not.toHaveBeenCalled();
  });

  it("marks wallet submission failure as broadcast-ambiguous", async () => {
    const { relayer, writeContract } = setup({ writeFails: true });

    const error = await relayer
      .configure(authorization, SIGNATURE)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(FlowRelayError);
    expect((error as FlowRelayError).broadcastMayHaveOccurred).toBe(true);
    expect(isDefinitelyPreBroadcastFailure(error)).toBe(false);
    expect(writeContract).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["ZeroAddress", "INVALID_FLOW"],
    ["ZeroValue", "INVALID_AMOUNT"],
    ["TransferFailed", "FLOW_TRANSFER_FAILED"],
  ] as const)(
    "decodes FerryFlow %s reverts into %s",
    async (errorName, code) => {
      const simulateError = new ContractFunctionRevertedError({
        abi: ferryFlowAbi,
        data: encodeErrorResult({ abi: ferryFlowAbi, errorName }),
        functionName: "configureFlow",
      });
      const { relayer, writeContract } = setup({ simulateError });

      const error = await relayer
        .configure(authorization, SIGNATURE)
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(FlowRelayError);
      expect(error).toMatchObject({ code, broadcastMayHaveOccurred: false });
      expect(isDefinitelyPreBroadcastFailure(error)).toBe(true);
      expect(writeContract).not.toHaveBeenCalled();
    },
  );
});
