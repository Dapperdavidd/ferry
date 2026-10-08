import { Test } from "@nestjs/testing";

describe("AppModule dependency graph", () => {
  it("compiles every controller and guard", async () => {
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/ferry";
    process.env.JWT_SECRETS = "test-secret-that-is-long-enough";
    process.env.MONAD_RPC_URLS = "http://localhost:8545";
    process.env.AUSD_ADDRESS = "0x0000000000000000000000000000000000000001";

    const { AppModule } =
      jest.requireActual<typeof import("./app.module")>("./app.module");
    const { DbService } =
      jest.requireActual<typeof import("./db/db.service")>("./db/db.service");

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DbService)
      .useValue({})
      .compile();

    await moduleRef.close();
  });
});
