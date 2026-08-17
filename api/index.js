// server/_core/app.ts
import express from "express";

// server/routers.ts
import { z as z2 } from "zod";
import { nanoid } from "nanoid";
import { TRPCError as TRPCError3 } from "@trpc/server";

// server/db.ts
import { MongoClient, ObjectId } from "mongodb";

// server/_core/env.ts
var ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? ""
};

// server/monitoring.ts
var SENSITIVE_KEYS = /password|secret|token|authorization|cookie|otp|code|uri/i;
function sanitize(value) {
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, SENSITIVE_KEYS.test(key) ? "[REDACTED]" : sanitize(item)]));
  }
  return value;
}
function reportServerError(event, error, context = {}) {
  console.error(
    JSON.stringify({
      level: "error",
      service: "cheetu",
      event,
      time: (/* @__PURE__ */ new Date()).toISOString(),
      error: sanitize(error),
      context: sanitize(context)
    })
  );
}

// server/db.ts
var client = null;
var database = null;
async function getDb() {
  if (database) return database;
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not configured");
  client = new MongoClient(process.env.MONGODB_URI, { maxPoolSize: 10, serverSelectionTimeoutMS: 5e3, connectTimeoutMS: 5e3, socketTimeoutMS: 5e3 });
  try {
    await client.connect();
    database = client.db("kukkal_seat_chits");
  } catch (error) {
    reportServerError("mongodb.connection_failed", error);
    client = null;
    database = null;
    throw error;
  }
  const indexResults = await Promise.allSettled([
    database.collection("members").createIndex({ publicToken: 1 }, { unique: true }),
    database.collection("members").createIndex({ chitGroupId: 1 }),
    database.collection("payments").createIndex({ memberId: 1, monthNumber: 1 }, { unique: true }),
    database.collection("auctions").createIndex({ chitGroupId: 1, monthNumber: 1 }, { unique: true }),
    database.collection("otpChallenges").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    database.collection("otpChallenges").createIndex({ email: 1 }, { unique: true })
  ]);
  const indexFailures = indexResults.filter((result) => result.status === "rejected");
  if (indexFailures.length > 0) {
    reportServerError("mongodb.index_initialization_failed", new Error(`${indexFailures.length} index operation(s) failed`), {
      failedCount: indexFailures.length
    });
  }
  return database;
}
async function getCollection(name) {
  return (await getDb()).collection(name);
}
function stableUserId(openId) {
  return openId.split("").reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 2147483647, 7);
}
async function upsertUser(user) {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const users = await getCollection("users");
  const now = /* @__PURE__ */ new Date();
  const role = user.openId === ENV.ownerOpenId ? "admin" : user.role ?? "user";
  await users.updateOne(
    { openId: user.openId },
    {
      $set: {
        name: user.name ?? null,
        email: user.email ?? null,
        loginMethod: user.loginMethod ?? null,
        role,
        lastSignedIn: user.lastSignedIn ?? now,
        updatedAt: now
      },
      $setOnInsert: { id: stableUserId(user.openId), openId: user.openId, createdAt: now }
    },
    { upsert: true }
  );
}
async function saveOtpChallenge(challenge) {
  const challenges2 = await getCollection("otpChallenges");
  await challenges2.replaceOne({ email: challenge.email }, challenge, { upsert: true });
}
async function getOtpChallenge(email) {
  return (await getCollection("otpChallenges")).findOne({ email });
}
async function updateOtpAttempts(email, attempts) {
  await (await getCollection("otpChallenges")).updateOne({ email }, { $set: { attempts } });
}
async function deleteOtpChallenge(email) {
  await (await getCollection("otpChallenges")).deleteOne({ email });
}
async function getUserByOpenId(openId) {
  const users = await getCollection("users");
  return users.findOne({ openId });
}
function oid(value) {
  if (!ObjectId.isValid(value)) throw new Error("Invalid record id");
  return new ObjectId(value);
}
function serialize(value) {
  if (!value) return value;
  return JSON.parse(JSON.stringify(value, (_, item) => item instanceof ObjectId ? item.toString() : item));
}

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var OTP_COOKIE_NAME = "cheetu_otp_session";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    path: "/",
    // The frontend and API are same-origin on Vercel. `lax` avoids browsers
    // rejecting `SameSite=None` cookies when a proxy reports an insecure hop.
    sameSite: "lax",
    secure: isSecureRequest(req) || process.env.NODE_ENV === "production"
  };
}

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
var isNonEmptyString2 = (value) => typeof value === "string" && value.length > 0;
var SDKServer = class {
  constructor() {
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Cheetu OTP-authenticated user
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        // Local OTP authentication is independent of Manus OAuth. Keep the
        // session payload valid when VITE_APP_ID is not configured in Vercel.
        appId: ENV.appId || "cheetu-otp",
        name: options.name || "",
        authMethod: options.authMethod
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name,
      ...payload.authMethod ? { authMethod: payload.authMethod } : {}
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name, authMethod } = payload;
      if (!isNonEmptyString2(openId) || !isNonEmptyString2(appId) || !isNonEmptyString2(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name,
        ...authMethod === "otp" ? { authMethod } : {}
      };
    } catch (error) {
      reportServerError("auth.session_verification_failed", error);
      return null;
    }
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    let sessionToken = cookies.get(OTP_COOKIE_NAME);
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
    const signedInAt = /* @__PURE__ */ new Date();
    try {
      let user = await getUserByOpenId(sessionUserId);
      if (!user) {
        await upsertUser({
          openId: sessionUserId,
          name: session.name || "Cheetu Administrator",
          email: process.env.DEMO_OTP_EMAIL || null,
          loginMethod: "otp",
          role: sessionUserId === ENV.ownerOpenId ? "admin" : "user",
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(sessionUserId);
      }
      if (!user) throw ForbiddenError("User not found");
      await upsertUser({
        openId: user.openId,
        lastSignedIn: signedInAt
      });
      return user;
    } catch (error) {
      console.error("[Auth] MongoDB unavailable while loading user:", error);
      if (sessionUserId !== ENV.ownerOpenId) {
        throw ForbiddenError("User persistence is unavailable");
      }
      return buildOwnerFallbackUser(session);
    }
  }
};
function buildOwnerFallbackUser(session) {
  const now = /* @__PURE__ */ new Date();
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
    lastSignedIn: now
  };
}
var sdk = new SDKServer();

// server/otp.ts
import { createHash, randomInt } from "node:crypto";
var OTP_TTL_MS = 5 * 60 * 1e3;
var MAX_ATTEMPTS = 5;
var challenges = /* @__PURE__ */ new Map();
var DEMO_OTP_EMAIL = process.env.DEMO_OTP_EMAIL || "cheetufund@gmail.com";
var DEMO_OTP_CODE = process.env.DEMO_OTP_CODE || "123456";
function normalizeEmail(email) {
  return email.trim().toLowerCase();
}
function hashCode(code) {
  return createHash("sha256").update(code.trim()).digest("hex");
}
async function requestOtp(email) {
  const normalizedEmail = normalizeEmail(email);
  const code = process.env.NODE_ENV === "development" ? DEMO_OTP_CODE : String(randomInt(1e5, 1e6));
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
      createdAt: /* @__PURE__ */ new Date()
    });
  }
  return { expiresAt, code, demoCode: process.env.NODE_ENV === "development" ? code : void 0 };
}
async function verifyOtp(email, code) {
  const normalizedEmail = normalizeEmail(email);
  if (process.env.NODE_ENV === "development") {
    const challenge2 = challenges.get(normalizedEmail);
    if (!challenge2 || Date.now() > challenge2.expiresAt) {
      challenges.delete(normalizedEmail);
      return { ok: false, reason: "expired" };
    }
    challenge2.attempts += 1;
    if (challenge2.attempts > MAX_ATTEMPTS) {
      challenges.delete(normalizedEmail);
      return { ok: false, reason: "locked" };
    }
    if (challenge2.code !== code.trim()) return { ok: false, reason: "invalid" };
    challenges.delete(normalizedEmail);
    return { ok: true };
  }
  const challenge = await getOtpChallenge(normalizedEmail);
  if (!challenge || Date.now() > challenge.expiresAt.getTime()) {
    await deleteOtpChallenge(normalizedEmail);
    return { ok: false, reason: "expired" };
  }
  const attempts = challenge.attempts + 1;
  if (attempts > MAX_ATTEMPTS) {
    await deleteOtpChallenge(normalizedEmail);
    return { ok: false, reason: "locked" };
  }
  if (hashCode(code) !== challenge.codeHash) {
    await updateOtpAttempts(normalizedEmail, attempts);
    return { ok: false, reason: "invalid" };
  }
  await deleteOtpChallenge(normalizedEmail);
  return { ok: true };
}

// server/mailer.ts
import nodemailer from "nodemailer";
function isSmtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}
async function sendOtpEmail(to, code) {
  if (!isSmtpConfigured()) {
    if (process.env.NODE_ENV === "development") return { mode: "demo" };
    throw new Error("SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, and OTP_FROM.");
  }
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
  });
  await transporter.sendMail({
    from: process.env.OTP_FROM || process.env.SMTP_USER,
    to,
    subject: "Your Cheetu Chits verification code",
    text: `Your Cheetu Chits verification code is ${code}. It expires in 5 minutes.`,
    html: `<p>Your Cheetu Chits verification code is <strong>${code}</strong>.</p><p>It expires in 5 minutes.</p>`
  });
  return { mode: "smtp" };
}

// server/mongo-errors.ts
function isMongoUnavailable(error) {
  return error instanceof Error && /MongoServerSelectionError|Server selection timed out|MONGODB_URI is not configured/i.test(error.message);
}

// server/routers.ts
var groupInput = z2.object({
  name: z2.string().min(2),
  totalAmount: z2.number().positive(),
  durationMonths: z2.number().int().positive(),
  memberCount: z2.number().int().positive(),
  monthlyInstallment: z2.number().positive(),
  startDate: z2.string(),
  status: z2.enum(["active", "completed", "paused"]).default("active")
});
var memberInput = z2.object({ name: z2.string().min(2), phone: z2.string().min(6), address: z2.string().min(3), chitGroupId: z2.string().min(1) });
var toSafe = (items) => items.map((item) => serialize(item));
var appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    requestOtp: publicProcedure.input(z2.object({ email: z2.string().email() })).mutation(async ({ input }) => {
      const email = normalizeEmail(input.email);
      if (email !== normalizeEmail(DEMO_OTP_EMAIL)) {
        throw new TRPCError3({ code: "FORBIDDEN", message: "This demo is configured for the administrator email only." });
      }
      const challenge = await requestOtp(email);
      try {
        await sendOtpEmail(email, challenge.code);
      } catch (error) {
        reportServerError("otp.mail_delivery_failed", error, { email });
        throw new TRPCError3({ code: "INTERNAL_SERVER_ERROR", message: "OTP delivery is not configured. Enable SMTP or use development mode." });
      }
      return { expiresAt: challenge.expiresAt, demoCode: challenge.demoCode };
    }),
    verifyOtp: publicProcedure.input(z2.object({ email: z2.string().email(), code: z2.string().length(6) })).mutation(async ({ input, ctx }) => {
      const email = normalizeEmail(input.email);
      if (email !== normalizeEmail(DEMO_OTP_EMAIL)) {
        throw new TRPCError3({ code: "FORBIDDEN", message: "Only the configured administrator can sign in." });
      }
      const result = await verifyOtp(email, input.code);
      if (!result.ok) {
        reportServerError("auth.otp_verification_failed", new Error(result.reason), { email, reason: result.reason });
        throw new TRPCError3({ code: "UNAUTHORIZED", message: result.reason === "expired" ? "The OTP expired. Request a new code." : result.reason === "locked" ? "Too many attempts. Request a new code." : "Invalid OTP." });
      }
      const sessionToken = await sdk.createSessionToken(process.env.OWNER_OPEN_ID || "demo-owner", { name: "Cheetu Administrator", authMethod: "otp" });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(OTP_COOKIE_NAME, sessionToken, cookieOptions);
      return { success: true };
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(OTP_COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true };
    })
  }),
  dashboard: router({
    summary: adminProcedure.query(async () => {
      try {
        const [groups, payments, auctions] = await Promise.all([getCollection("chitGroups"), getCollection("payments"), getCollection("auctions")]);
        const [groupRows, paymentRows, auctionRows] = await Promise.all([groups.find({}).sort({ createdAt: -1 }).toArray(), payments.find({}).toArray(), auctions.find({}).sort({ auctionDate: 1 }).toArray()]);
        const totalCollections = paymentRows.reduce((sum, payment) => sum + (payment.paidAmount || 0), 0);
        const pendingPayments = paymentRows.filter((payment) => payment.status === "pending").length;
        const upcomingAuctions = auctionRows.filter((auction) => new Date(auction.auctionDate) >= /* @__PURE__ */ new Date()).slice(0, 3);
        return { databaseUnavailable: false, totalCollections, pendingPayments, activeGroups: groupRows.filter((group) => group.status === "active").length, upcomingAuctions: upcomingAuctions.length, groups: toSafe(groupRows), recentAuctions: toSafe(auctionRows.slice(0, 5)) };
      } catch (error) {
        if (!isMongoUnavailable(error)) throw error;
        console.warn("[Dashboard] MongoDB unavailable; returning an actionable empty state");
        return { databaseUnavailable: true, totalCollections: 0, pendingPayments: 0, activeGroups: 0, upcomingAuctions: 0, groups: [], recentAuctions: [] };
      }
    })
  }),
  groups: router({
    list: adminProcedure.query(async () => {
      try {
        return toSafe(await (await getCollection("chitGroups")).find({}).sort({ createdAt: -1 }).toArray());
      } catch (error) {
        if (isMongoUnavailable(error)) return [];
        throw error;
      }
    }),
    create: adminProcedure.input(groupInput).mutation(async ({ input }) => {
      const now = /* @__PURE__ */ new Date();
      const group = { ...input, createdAt: now, updatedAt: now };
      const result = await (await getCollection("chitGroups")).insertOne(group);
      return { ...serialize(group), _id: result.insertedId.toString() };
    }),
    update: adminProcedure.input(z2.object({ id: z2.string(), data: groupInput })).mutation(async ({ input }) => {
      await (await getCollection("chitGroups")).updateOne({ _id: oid(input.id) }, { $set: { ...input.data, updatedAt: /* @__PURE__ */ new Date() } });
      return { success: true };
    }),
    updateStatus: adminProcedure.input(z2.object({ id: z2.string(), status: z2.enum(["active", "completed", "paused"]) })).mutation(async ({ input }) => {
      await (await getCollection("chitGroups")).updateOne({ _id: oid(input.id) }, { $set: { status: input.status, updatedAt: /* @__PURE__ */ new Date() } });
      return { success: true };
    })
  }),
  members: router({
    list: adminProcedure.query(async () => {
      try {
        const members = await (await getCollection("members")).find({}).sort({ createdAt: -1 }).toArray();
        const groups = await (await getCollection("chitGroups")).find({}).toArray();
        const groupMap = new Map(groups.map((group) => [group._id?.toString(), group.name]));
        return members.map((member) => ({ ...serialize(member), chitGroupName: groupMap.get(member.chitGroupId.toString()) ?? "Unassigned" }));
      } catch (error) {
        if (isMongoUnavailable(error)) return [];
        throw error;
      }
    }),
    create: adminProcedure.input(memberInput).mutation(async ({ input }) => {
      const now = /* @__PURE__ */ new Date();
      const member = { ...input, chitGroupId: oid(input.chitGroupId), publicToken: nanoid(18), createdAt: now, updatedAt: now };
      const result = await (await getCollection("members")).insertOne(member);
      return { ...serialize(member), _id: result.insertedId.toString() };
    }),
    update: adminProcedure.input(z2.object({ id: z2.string(), data: memberInput })).mutation(async ({ input }) => {
      await (await getCollection("members")).updateOne({ _id: oid(input.id) }, { $set: { ...input.data, chitGroupId: oid(input.data.chitGroupId), updatedAt: /* @__PURE__ */ new Date() } });
      return { success: true };
    })
  }),
  payments: router({
    list: adminProcedure.input(z2.object({ memberId: z2.string().optional() }).optional()).query(async ({ input }) => {
      const query = input?.memberId ? { memberId: oid(input.memberId) } : {};
      return toSafe(await (await getCollection("payments")).find(query).sort({ dueDate: -1 }).toArray());
    }),
    upsert: adminProcedure.input(z2.object({ memberId: z2.string(), chitGroupId: z2.string(), monthNumber: z2.number().int().positive(), dueDate: z2.string(), amount: z2.number().positive(), paidAmount: z2.number().min(0), paidDate: z2.string().optional(), status: z2.enum(["paid", "pending"]) })).mutation(async ({ input }) => {
      const now = /* @__PURE__ */ new Date();
      const payment = { ...input, memberId: oid(input.memberId), chitGroupId: oid(input.chitGroupId), createdAt: now, updatedAt: now };
      await (await getCollection("payments")).updateOne({ memberId: payment.memberId, monthNumber: payment.monthNumber }, { $set: payment }, { upsert: true });
      return { success: true };
    })
  }),
  auctions: router({
    list: adminProcedure.query(async () => toSafe(await (await getCollection("auctions")).find({}).sort({ auctionDate: -1 }).toArray())),
    create: adminProcedure.input(z2.object({ chitGroupId: z2.string(), monthNumber: z2.number().int().positive(), auctionDate: z2.string(), winnerMemberId: z2.string(), bidAmount: z2.number().positive() })).mutation(async ({ input }) => {
      const now = /* @__PURE__ */ new Date();
      const auction = { ...input, chitGroupId: oid(input.chitGroupId), winnerMemberId: oid(input.winnerMemberId), createdAt: now, updatedAt: now };
      await (await getCollection("auctions")).updateOne({ chitGroupId: auction.chitGroupId, monthNumber: auction.monthNumber }, { $set: auction }, { upsert: true });
      return { success: true };
    })
  }),
  public: router({
    memberByToken: publicProcedure.input(z2.object({ token: z2.string().min(10) })).query(async ({ input }) => {
      const member = await (await getCollection("members")).findOne({ publicToken: input.token });
      if (!member) throw new TRPCError3({ code: "NOT_FOUND", message: "This customer link is no longer available." });
      const [group, payments, auctions] = await Promise.all([(await getCollection("chitGroups")).findOne({ _id: member.chitGroupId }), (await getCollection("payments")).find({ memberId: member._id }).sort({ monthNumber: 1 }).toArray(), (await getCollection("auctions")).find({ chitGroupId: member.chitGroupId }).sort({ monthNumber: 1 }).toArray()]);
      return { member: serialize(member), group: serialize(group), payments: toSafe(payments), auctions: toSafe(auctions) };
    })
  })
});

// server/_core/context.ts
function isExpectedAnonymousRequest(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message === "Missing session cookie" || message === "Invalid session cookie";
}
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    if (!isExpectedAnonymousRequest(error)) {
      reportServerError("auth.context_resolution_failed", error);
    }
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// server/_core/app.ts
import { createExpressMiddleware } from "@trpc/server/adapters/express";
function createApiApp() {
  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext
    })
  );
  return app;
}

// .vercel-bundle-entry.ts
var vercel_bundle_entry_default = createApiApp();
export {
  vercel_bundle_entry_default as default
};
