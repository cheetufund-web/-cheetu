import { describe, expect, it } from "vitest";
import { buildOwnerFallbackUser } from "./_core/sdk";
import { ENV } from "./_core/env";

describe("owner-only degraded authentication", () => {
  it("creates an admin fallback only for the configured owner", () => {
    const user = buildOwnerFallbackUser({
      openId: ENV.ownerOpenId,
      appId: ENV.appId,
      name: "Cheetu Owner",
    });

    expect(user.role).toBe("admin");
    expect(user.openId).toBe(ENV.ownerOpenId);
  });

  it("rejects a non-owner session when persistence is unavailable", () => {
    expect(() =>
      buildOwnerFallbackUser({
        openId: "not-the-configured-owner",
        appId: ENV.appId,
        name: "Other User",
      }),
    ).toThrow("User persistence is unavailable");
  });
});
