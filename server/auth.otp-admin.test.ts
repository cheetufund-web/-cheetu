import { afterEach, describe, expect, it, vi } from "vitest";
import { OTP_COOKIE_NAME } from "@shared/const";
import * as db from "./db";
import { ENV } from "./_core/env";
import { sdk } from "./_core/sdk";

const ownerUser = {
  id: 1,
  openId: ENV.ownerOpenId,
  name: "Cheetu Administrator",
  email: "cheetufund@gmail.com",
  loginMethod: "otp",
  role: "admin" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("local OTP admin authentication", () => {
  it("resolves the OTP admin session locally without a Manus permission client", async () => {
    const sessionToken = await sdk.createSessionToken(ENV.ownerOpenId, {
      name: "Cheetu Administrator",
      authMethod: "otp",
    });
    const getUserByOpenId = vi
      .spyOn(db, "getUserByOpenId")
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(ownerUser);
    const upsertUser = vi.spyOn(db, "upsertUser").mockResolvedValue(undefined);
    const user = await sdk.authenticateRequest({
      headers: { cookie: `${OTP_COOKIE_NAME}=${sessionToken}` },
    } as never);

    expect(user.role).toBe("admin");
    expect(user.loginMethod).toBe("otp");
    expect((sdk as Record<string, unknown>).getUserInfoWithJwt).toBeUndefined();
    expect(upsertUser).toHaveBeenCalledWith(
      expect.objectContaining({
        openId: ENV.ownerOpenId,
        email: "cheetufund@gmail.com",
        loginMethod: "otp",
        role: "admin",
      }),
    );
    expect(getUserByOpenId).toHaveBeenCalledTimes(2);
  });
});

void ownerUser;
