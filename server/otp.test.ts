import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_OTP_EMAIL, DEMO_OTP_CODE, OTP_TTL_MS, clearOtpChallenges, requestOtp, verifyOtp } from "./otp";

describe("development email OTP", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    clearOtpChallenges();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("generates the configured demo code for the demo email", () => {
    const challenge = requestOtp(DEMO_OTP_EMAIL);
    expect(challenge.demoCode).toBe(DEMO_OTP_CODE);
  });

  it("accepts the correct code once", () => {
    requestOtp(DEMO_OTP_EMAIL);
    expect(verifyOtp(DEMO_OTP_EMAIL, DEMO_OTP_CODE)).toEqual({ ok: true });
    expect(verifyOtp(DEMO_OTP_EMAIL, DEMO_OTP_CODE).ok).toBe(false);
  });

  it("rejects an invalid code", () => {
    requestOtp(DEMO_OTP_EMAIL);
    expect(verifyOtp(DEMO_OTP_EMAIL, "000000")).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("rejects a code after the five-minute expiry", () => {
    vi.useFakeTimers();
    requestOtp(DEMO_OTP_EMAIL);
    vi.advanceTimersByTime(OTP_TTL_MS + 1);
    expect(verifyOtp(DEMO_OTP_EMAIL, DEMO_OTP_CODE)).toMatchObject({ ok: false, reason: "expired" });
    vi.useRealTimers();
  });
});
