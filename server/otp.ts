import { randomInt } from "node:crypto";

export const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export type OtpChallenge = {
  code: string;
  expiresAt: number;
  attempts: number;
};

const challenges = new Map<string, OtpChallenge>();

export const DEMO_OTP_EMAIL = process.env.DEMO_OTP_EMAIL || "demo@cheetu.local";
export const DEMO_OTP_CODE = process.env.DEMO_OTP_CODE || "123456";

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function requestOtp(email: string) {
  const normalizedEmail = normalizeEmail(email);
  const code = process.env.NODE_ENV === "development" ? DEMO_OTP_CODE : String(randomInt(100000, 1000000));
  const challenge = { code, expiresAt: Date.now() + OTP_TTL_MS, attempts: 0 };
  challenges.set(normalizedEmail, challenge);
  if (process.env.NODE_ENV === "development") {
    console.log(`[OTP] Demo code for ${normalizedEmail}: ${code}`);
  }
  return { expiresAt: challenge.expiresAt, code, demoCode: process.env.NODE_ENV === "development" ? code : undefined };
}

export function verifyOtp(email: string, code: string) {
  const normalizedEmail = normalizeEmail(email);
  const challenge = challenges.get(normalizedEmail);
  if (!challenge || Date.now() > challenge.expiresAt) {
    challenges.delete(normalizedEmail);
    return { ok: false as const, reason: "expired" as const };
  }
  challenge.attempts += 1;
  if (challenge.attempts > MAX_ATTEMPTS) {
    challenges.delete(normalizedEmail);
    return { ok: false as const, reason: "locked" as const };
  }
  if (challenge.code !== code.trim()) return { ok: false as const, reason: "invalid" as const };
  challenges.delete(normalizedEmail);
  return { ok: true as const };
}

export function clearOtpChallenges() {
  challenges.clear();
}
