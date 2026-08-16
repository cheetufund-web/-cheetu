import { z } from "zod";
import { nanoid } from "nanoid";
import { TRPCError } from "@trpc/server";
import { ObjectId } from "mongodb";
import { getCollection, oid, serialize, type Auction, type ChitGroup, type Member, type Payment } from "./db";
import { COOKIE_NAME, OTP_COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, publicProcedure, router } from "./_core/trpc";
import { sdk } from "./_core/sdk";
import { DEMO_OTP_EMAIL, normalizeEmail, requestOtp, verifyOtp } from "./otp";
import { sendOtpEmail } from "./mailer";
import { isMongoUnavailable } from "./mongo-errors";

const groupInput = z.object({
  name: z.string().min(2),
  totalAmount: z.number().positive(),
  durationMonths: z.number().int().positive(),
  memberCount: z.number().int().positive(),
  monthlyInstallment: z.number().positive(),
  startDate: z.string(),
  status: z.enum(["active", "completed", "paused"]).default("active"),
});
const memberInput = z.object({ name: z.string().min(2), phone: z.string().min(6), address: z.string().min(3), chitGroupId: z.string().min(1) });
const toSafe = <T extends Record<string, unknown>>(items: T[]) => items.map(item => serialize(item));
export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    requestOtp: publicProcedure.input(z.object({ email: z.string().email() })).mutation(async ({ input }) => {
      const email = normalizeEmail(input.email);
      if (email !== normalizeEmail(DEMO_OTP_EMAIL)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "This demo is configured for the administrator email only." });
      }
      const challenge = requestOtp(email);
      try {
        await sendOtpEmail(email, challenge.code);
      } catch (error) {
        console.error("[OTP] Mail delivery failed:", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "OTP delivery is not configured. Enable SMTP or use development mode." });
      }
      return { expiresAt: challenge.expiresAt, demoCode: challenge.demoCode };
    }),
    verifyOtp: publicProcedure.input(z.object({ email: z.string().email(), code: z.string().length(6) })).mutation(async ({ input, ctx }) => {
      const email = normalizeEmail(input.email);
      if (email !== normalizeEmail(DEMO_OTP_EMAIL)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the configured administrator can sign in." });
      }
      const result = verifyOtp(email, input.code);
      if (!result.ok) throw new TRPCError({ code: "UNAUTHORIZED", message: result.reason === "expired" ? "The OTP expired. Request a new code." : result.reason === "locked" ? "Too many attempts. Request a new code." : "Invalid OTP." });
      const sessionToken = await sdk.createSessionToken(process.env.OWNER_OPEN_ID || "demo-owner", { name: "Cheetu Administrator", authMethod: "otp" });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(OTP_COOKIE_NAME, sessionToken, cookieOptions);
      return { success: true } as const;
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(OTP_COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  dashboard: router({
    summary: adminProcedure.query(async () => {
      try {
        const [groups, payments, auctions] = await Promise.all([getCollection<ChitGroup>("chitGroups"), getCollection<Payment>("payments"), getCollection<Auction>("auctions")]);
        const [groupRows, paymentRows, auctionRows] = await Promise.all([groups.find({}).sort({ createdAt: -1 }).toArray(), payments.find({}).toArray(), auctions.find({}).sort({ auctionDate: 1 }).toArray()]);
        const totalCollections = paymentRows.reduce((sum, payment) => sum + (payment.paidAmount || 0), 0);
        const pendingPayments = paymentRows.filter(payment => payment.status === "pending").length;
        const upcomingAuctions = auctionRows.filter(auction => new Date(auction.auctionDate) >= new Date()).slice(0, 3);
        return { databaseUnavailable: false, totalCollections, pendingPayments, activeGroups: groupRows.filter(group => group.status === "active").length, upcomingAuctions: upcomingAuctions.length, groups: toSafe(groupRows), recentAuctions: toSafe(auctionRows.slice(0, 5)) };
      } catch (error) {
        if (!isMongoUnavailable(error)) throw error;
        console.warn("[Dashboard] MongoDB unavailable; returning an actionable empty state");
        return { databaseUnavailable: true, totalCollections: 0, pendingPayments: 0, activeGroups: 0, upcomingAuctions: 0, groups: [], recentAuctions: [] };
      }
    }),
  }),
  groups: router({
    list: adminProcedure.query(async () => {
      try { return toSafe(await (await getCollection<ChitGroup>("chitGroups")).find({}).sort({ createdAt: -1 }).toArray()); }
      catch (error) { if (isMongoUnavailable(error)) return []; throw error; }
    }),
    create: adminProcedure.input(groupInput).mutation(async ({ input }) => {
      const now = new Date();
      const group: ChitGroup = { ...input, createdAt: now, updatedAt: now };
      const result = await (await getCollection<ChitGroup>("chitGroups")).insertOne(group as ChitGroup & { _id: ObjectId });
      return { ...serialize(group), _id: result.insertedId.toString() };
    }),
    update: adminProcedure.input(z.object({ id: z.string(), data: groupInput })).mutation(async ({ input }) => {
      await (await getCollection<ChitGroup>("chitGroups")).updateOne({ _id: oid(input.id) }, { $set: { ...input.data, updatedAt: new Date() } });
      return { success: true };
    }),
    updateStatus: adminProcedure.input(z.object({ id: z.string(), status: z.enum(["active", "completed", "paused"]) })).mutation(async ({ input }) => {
      await (await getCollection<ChitGroup>("chitGroups")).updateOne({ _id: oid(input.id) }, { $set: { status: input.status, updatedAt: new Date() } });
      return { success: true };
    }),
  }),
  members: router({
    list: adminProcedure.query(async () => {
      try {
        const members = await (await getCollection<Member>("members")).find({}).sort({ createdAt: -1 }).toArray();
        const groups = await (await getCollection<ChitGroup>("chitGroups")).find({}).toArray();
        const groupMap = new Map(groups.map(group => [group._id?.toString(), group.name]));
        return members.map(member => ({ ...serialize(member), chitGroupName: groupMap.get(member.chitGroupId.toString()) ?? "Unassigned" }));
      } catch (error) { if (isMongoUnavailable(error)) return []; throw error; }
    }),
    create: adminProcedure.input(memberInput).mutation(async ({ input }) => {
      const now = new Date();
      const member: Member = { ...input, chitGroupId: oid(input.chitGroupId), publicToken: nanoid(18), createdAt: now, updatedAt: now };
      const result = await (await getCollection<Member>("members")).insertOne(member as Member & { _id: ObjectId });
      return { ...serialize(member), _id: result.insertedId.toString() };
    }),
    update: adminProcedure.input(z.object({ id: z.string(), data: memberInput })).mutation(async ({ input }) => {
      await (await getCollection<Member>("members")).updateOne({ _id: oid(input.id) }, { $set: { ...input.data, chitGroupId: oid(input.data.chitGroupId), updatedAt: new Date() } });
      return { success: true };
    }),
  }),
  payments: router({
    list: adminProcedure.input(z.object({ memberId: z.string().optional() }).optional()).query(async ({ input }) => {
      const query = input?.memberId ? { memberId: oid(input.memberId) } : {};
      return toSafe(await (await getCollection<Payment>("payments")).find(query).sort({ dueDate: -1 }).toArray());
    }),
    upsert: adminProcedure.input(z.object({ memberId: z.string(), chitGroupId: z.string(), monthNumber: z.number().int().positive(), dueDate: z.string(), amount: z.number().positive(), paidAmount: z.number().min(0), paidDate: z.string().optional(), status: z.enum(["paid", "pending"]) })).mutation(async ({ input }) => {
      const now = new Date();
      const payment = { ...input, memberId: oid(input.memberId), chitGroupId: oid(input.chitGroupId), createdAt: now, updatedAt: now } as Payment;
      await (await getCollection<Payment>("payments")).updateOne({ memberId: payment.memberId, monthNumber: payment.monthNumber }, { $set: payment }, { upsert: true });
      return { success: true };
    }),
  }),
  auctions: router({
    list: adminProcedure.query(async () => toSafe(await (await getCollection<Auction>("auctions")).find({}).sort({ auctionDate: -1 }).toArray())),
    create: adminProcedure.input(z.object({ chitGroupId: z.string(), monthNumber: z.number().int().positive(), auctionDate: z.string(), winnerMemberId: z.string(), bidAmount: z.number().positive() })).mutation(async ({ input }) => {
      const now = new Date();
      const auction = { ...input, chitGroupId: oid(input.chitGroupId), winnerMemberId: oid(input.winnerMemberId), createdAt: now, updatedAt: now } as Auction;
      await (await getCollection<Auction>("auctions")).updateOne({ chitGroupId: auction.chitGroupId, monthNumber: auction.monthNumber }, { $set: auction }, { upsert: true });
      return { success: true };
    }),
  }),
  public: router({
    memberByToken: publicProcedure.input(z.object({ token: z.string().min(10) })).query(async ({ input }) => {
      const member = await (await getCollection<Member>("members")).findOne({ publicToken: input.token });
      if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "This customer link is no longer available." });
      const [group, payments, auctions] = await Promise.all([(await getCollection<ChitGroup>("chitGroups")).findOne({ _id: member.chitGroupId }), (await getCollection<Payment>("payments")).find({ memberId: member._id }).sort({ monthNumber: 1 }).toArray(), (await getCollection<Auction>("auctions")).find({ chitGroupId: member.chitGroupId }).sort({ monthNumber: 1 }).toArray()]);
      return { member: serialize(member), group: serialize(group), payments: toSafe(payments), auctions: toSafe(auctions) };
    }),
  }),
});

export type AppRouter = typeof appRouter;
