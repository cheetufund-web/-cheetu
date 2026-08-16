import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const context = (): TrpcContext => ({
  user: { id: 1, openId: "live-admin", email: "admin@cheetu.local", name: "Cheetu Admin", loginMethod: "test", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
  req: { protocol: "https", headers: {} } as TrpcContext["req"],
  res: {} as TrpcContext["res"],
});

describe("live dashboard MongoDB read", () => {
  it.skipIf(process.env.RUN_MONGODB_LIVE_TEST !== "1")("reads the dashboard summary through the real admin tRPC procedure", async () => {
    const result = await appRouter.createCaller(context()).dashboard.summary();
    expect(result.databaseUnavailable).not.toBe(true);
    expect(result).toMatchObject({ groups: expect.any(Array), recentAuctions: expect.any(Array) });
  }, 30000);
});
