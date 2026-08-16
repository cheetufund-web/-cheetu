import { OTP_COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { reportServerError } from "../monitoring";
import { ENV } from "./env";
// Utility function
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

export type SessionPayload = {
  openId: string;
  appId: string;
  name: string;
  authMethod?: "otp";
};

class SDKServer {
  constructor() {}

  private parseCookies(cookieHeader: string | undefined) {
    if (!cookieHeader) {
      return new Map<string, string>();
    }

    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }

  private getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }

  /**
   * Create a session token for a Cheetu OTP-authenticated user
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(
    openId: string,
    options: { expiresInMs?: number; name?: string; authMethod?: "otp" } = {}
  ): Promise<string> {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || "",
        authMethod: options.authMethod,
      },
      options
    );
  }

  async signSession(
    payload: SessionPayload,
    options: { expiresInMs?: number } = {}
  ): Promise<string> {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);
    const secretKey = this.getSessionSecret();

    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name,
      ...(payload.authMethod ? { authMethod: payload.authMethod } : {}),
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(expirationSeconds)
      .sign(secretKey);
  }

  async verifySession(
    cookieValue: string | undefined | null
  ): Promise<{ openId: string; appId: string; name: string; authMethod?: "otp" } | null> {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }

    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"],
      });
      const { openId, appId, name, authMethod } = payload as Record<string, unknown>;

      if (
        !isNonEmptyString(openId) ||
        !isNonEmptyString(appId) ||
        !isNonEmptyString(name)
      ) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }

      return {
        openId,
        appId,
        name,
        ...(authMethod === "otp" ? { authMethod } : {}),
      };
    } catch (error) {
      reportServerError("auth.session_verification_failed", error);
      return null;
    }
  }

  async authenticateRequest(req: Request): Promise<AuthenticatedUser> {
    // Cheetu uses a dedicated OTP cookie. The legacy app_session_id cookie is
    // intentionally ignored so a stale legacy session cannot auto-login.
    const cookies = this.parseCookies(req.headers.cookie);
    let sessionToken = cookies.get(OTP_COOKIE_NAME);

    // Cron callbacks may still authenticate through a bearer token.
    if (!sessionToken) {
      const authHeader = req.headers.authorization;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.slice(7);
      }
    }

    const session = await this.verifySession(sessionToken);

    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }

    if (session.authMethod !== "otp") {
      throw ForbiddenError("Email OTP authentication required");
    }

    const sessionUserId = session.openId;
    const signedInAt = new Date();

    try {
      let user = await db.getUserByOpenId(sessionUserId);

      // OTP sessions are fully local and never depend on an external identity service.
      if (!user) {
        await db.upsertUser({
          openId: sessionUserId,
          name: session.name || "Cheetu Administrator",
          email: process.env.DEMO_OTP_EMAIL || null,
          loginMethod: "otp",
          role: sessionUserId === ENV.ownerOpenId ? "admin" : "user",
          lastSignedIn: signedInAt,
        });
        user = await db.getUserByOpenId(sessionUserId);
      }

      if (!user) throw ForbiddenError("User not found");

      await db.upsertUser({
        openId: user.openId,
        lastSignedIn: signedInAt,
      });

      return user;
    } catch (error) {
      console.error("[Auth] MongoDB unavailable while loading user:", error);
      if (sessionUserId !== ENV.ownerOpenId) {
        throw ForbiddenError("User persistence is unavailable");
      }

      // Degraded mode is restricted to the configured owner identity. This
      // preserves admin access during a transient Atlas outage without
      // granting management privileges to any other session.
      return buildOwnerFallbackUser(session);
    }
  }
}

/** Result of `sdk.authenticateRequest`. Cron callbacks set `isCron=true` and `taskUid`; see `/home/ubuntu/skills/webdev-periodic-updates/SKILL.md`. */
export type AuthenticatedUser = User & {
  taskUid?: string;
  isCron?: boolean;
};

export function buildOwnerFallbackUser(session: SessionPayload): AuthenticatedUser {
  const now = new Date();
  if (session.openId !== ENV.ownerOpenId) {
    throw ForbiddenError("User persistence is unavailable");
  }

  return {
    id: 0,
    openId: session.openId,
    name: session.name || null,
    email: null,
    loginMethod: "otp",
    role: "admin",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  } as AuthenticatedUser;
}

export const sdk = new SDKServer();
