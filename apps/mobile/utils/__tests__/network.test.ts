import {
  FERRY_NETWORKS,
  getActiveNetworkConfig,
  setActiveNetwork,
} from "../network";

describe("network configuration", () => {
  afterEach(() => setActiveNetwork("mainnet"));

  it("uses Monad mainnet and the official AUSD deployment", () => {
    expect(FERRY_NETWORKS.mainnet).toMatchObject({
      chainId: 143,
      ausdAddress: "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a",
    });
  });

  it("switches every runtime consumer together", () => {
    setActiveNetwork("testnet");
    expect(getActiveNetworkConfig()).toMatchObject({
      id: "testnet",
      chainId: 10143,
    });
  });
});
