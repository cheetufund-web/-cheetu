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
  it("does not call the Manus user-info permission path", async () => {
    const sessionToken = await sdk.createSessionToken(ENV.ownerOpenId, {
      name: "Cheetu Administrator",
      authMethod: "otp",
    });
    const getUserByOpenId = vi
      .spyOn(db, "getUserByOpenId")
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(ownerUser);
    const upsertUser = vi.spyOn(db, "upsertUser").mockResolvedValue(undefined);
    const getUserInfoWithJwt = vi
      .spyOn(sdk, "getUserInfoWithJwt")
      .mockRejectedValue(new Error("Manus permission endpoint must not be called"));

    const user = await sdk.authenticateRequest({
      headers: { cookie: `${OTP_COOKIE_NAME}=${sessionToken}` },
    } as never);

    expect(user.role).toBe("admin");
    expect(user.loginMethod).toBe("otp");
    expect(getUserInfoWithJwt).not.toHaveBeenCalled();
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
