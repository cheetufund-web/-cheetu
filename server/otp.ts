import { createHash, randomInt } from "node:crypto";
import { deleteOtpChallenge, getOtpChallenge, saveOtpChallenge, updateOtpAttempts } from "./db";

export const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

type MemoryOtpChallenge = {
  code: string;
  expiresAt: number;
  attempts: number;
};

const challenges = new Map<string, MemoryOtpChallenge>();

export const DEMO_OTP_EMAIL = process.env.DEMO_OTP_EMAIL || "demo@cheetu.local";
export const DEMO_OTP_CODE = process.env.DEMO_OTP_CODE || "123456";

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function hashCode(code: string) {
  return createHash("sha256").update(code.trim()).digest("hex");
}

export async function requestOtp(email: string) {
  const normalizedEmail = normalizeEmail(email);
  const code = process.env.NODE_ENV === "development" ? DEMO_OTP_CODE : String(randomInt(100000, 1000000));
  const expiresAt = Date.now() + OTP_TTL_MS;

  if (process.env.NODE_ENV === "development") {
    challenges.set(normalizedEmail, { code, expiresAt, attempts: 0 });
    console.log(`[OTP] Demo code for ${normalizedEmail}: ${code}`);
  } else {
    await saveOtpChallenge({
      email: normalizedEmail,
      codeHash: hashCode(code),
      expiresAt: new Date(expiresAt),
      attempts: 0,
      createdAt: new Date(),
    });
  }

  return { expiresAt, code, demoCode: process.env.NODE_ENV === "development" ? code : undefined };
}

export async function verifyOtp(email: string, code: string) {
  const normalizedEmail = normalizeEmail(email);

  if (process.env.NODE_ENV === "development") {
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

  const challenge = await getOtpChallenge(normalizedEmail);
  if (!challenge || Date.now() > challenge.expiresAt.getTime()) {
    await deleteOtpChallenge(normalizedEmail);
    return { ok: false as const, reason: "expired" as const };
  }

  const attempts = challenge.attempts + 1;
  if (attempts > MAX_ATTEMPTS) {
    await deleteOtpChallenge(normalizedEmail);
    return { ok: false as const, reason: "locked" as const };
  }
  if (hashCode(code) !== challenge.codeHash) {
    await updateOtpAttempts(normalizedEmail, attempts);
    return { ok: false as const, reason: "invalid" as const };
  }

  await deleteOtpChallenge(normalizedEmail);
  return { ok: true as const };
}

export function clearOtpChallenges() {
  challenges.clear();
}
