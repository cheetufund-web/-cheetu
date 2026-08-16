import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const { getCollectionMock } = vi.hoisted(() => ({ getCollectionMock: vi.fn() }));
vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return { ...actual, getCollection: getCollectionMock };
});

const context = (role: "admin" | "user") => ({
  user: { id: 1, openId: "test-user", email: "test@example.com", name: "Test User", loginMethod: "test", role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
  req: { protocol: "https", headers: {} } as TrpcContext["req"],
  res: {} as TrpcContext["res"],
});

describe("dashboard MongoDB fallback", () => {
  beforeEach(() => {
    getCollectionMock.mockReset();
    getCollectionMock.mockRejectedValue(new Error("MongoServerSelectionError: Server selection timed out after 5000 ms"));
  });

  it("returns an actionable unavailable payload for an admin", async () => {
    const result = await appRouter.createCaller(context("admin")).dashboard.summary();
    expect(result).toMatchObject({ databaseUnavailable: true, totalCollections: 0, pendingPayments: 0, activeGroups: 0, upcomingAuctions: 0, groups: [], recentAuctions: [] });
  });

  it("rejects a non-admin before the fallback can be reached", async () => {
    await expect(appRouter.createCaller(context("user")).dashboard.summary()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getCollectionMock).not.toHaveBeenCalled();
  });
});
