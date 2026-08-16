import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const context = (role: "admin" | "user") => ({
  user: { id: 1, openId: "test-user", email: "test@example.com", name: "Test User", loginMethod: "test", role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
  req: { protocol: "https", headers: {} } as TrpcContext["req"],
  res: {} as TrpcContext["res"],
});

describe("admin access control", () => {
  it("rejects every management procedure for regular users before database work", async () => {
    const caller = appRouter.createCaller(context("user"));
    const attempts = [
      caller.dashboard.summary(),
      caller.groups.list(),
      caller.groups.create({ name: "Test Group", totalAmount: 1000, durationMonths: 10, memberCount: 10, monthlyInstallment: 100, startDate: "2026-01-01", status: "active" }),
      caller.groups.updateStatus({ id: "000000000000000000000000", status: "active" }),
      caller.groups.update({ id: "000000000000000000000000", data: { name: "Test Group", totalAmount: 1000, durationMonths: 10, memberCount: 10, monthlyInstallment: 100, startDate: "2026-01-01", status: "active" } }),
      caller.members.list(),
      caller.members.create({ name: "Test Member", phone: "1234567890", address: "Test Address", chitGroupId: "000000000000000000000000" }),
      caller.members.update({ id: "000000000000000000000000", data: { name: "Test Member", phone: "1234567890", address: "Test Address", chitGroupId: "000000000000000000000000" } }),
      caller.payments.list(),
      caller.payments.upsert({ memberId: "000000000000000000000000", chitGroupId: "000000000000000000000000", monthNumber: 1, dueDate: "2026-01-01", amount: 100, paidAmount: 0, status: "pending" }),
      caller.auctions.list(),
      caller.auctions.create({ chitGroupId: "000000000000000000000000", monthNumber: 1, auctionDate: "2026-01-01", winnerMemberId: "000000000000000000000000", bidAmount: 50 }),
    ];
    for (const attempt of attempts) await expect(attempt).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
