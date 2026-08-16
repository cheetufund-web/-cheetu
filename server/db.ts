import { MongoClient, ObjectId, type Collection, type Db } from "mongodb";
import { ENV } from "./_core/env";
import { reportServerError } from "./monitoring";
import type { InsertUser, User } from "../drizzle/schema";

let client: MongoClient | null = null;
let database: Db | null = null;

export type ChitGroup = {
  _id?: ObjectId;
  name: string;
  totalAmount: number;
  durationMonths: number;
  memberCount: number;
  monthlyInstallment: number;
  startDate: string;
  status: "active" | "completed" | "paused";
  createdAt: Date;
  updatedAt: Date;
};

export type Member = {
  _id?: ObjectId;
  name: string;
  phone: string;
  address: string;
  chitGroupId: ObjectId;
  publicToken: string;
  createdAt: Date;
  updatedAt: Date;
};

export type Payment = {
  _id?: ObjectId;
  memberId: ObjectId;
  chitGroupId: ObjectId;
  monthNumber: number;
  dueDate: string;
  amount: number;
  paidAmount: number;
  paidDate?: string;
  status: "paid" | "pending";
  createdAt: Date;
  updatedAt: Date;
};

export type Auction = {
  _id?: ObjectId;
  chitGroupId: ObjectId;
  monthNumber: number;
  auctionDate: string;
  winnerMemberId: ObjectId;
  bidAmount: number;
  createdAt: Date;
  updatedAt: Date;
};

export async function getDb() {
  if (database) return database;
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not configured");
  client = new MongoClient(process.env.MONGODB_URI, { maxPoolSize: 10, serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000, socketTimeoutMS: 5000 });
  try {
    await client.connect();
    database = client.db("kukkal_seat_chits");
  } catch (error) {
    reportServerError("mongodb.connection_failed", error);
    client = null;
    database = null;
    throw error;
  }
  await Promise.all([
    database.collection("members").createIndex({ publicToken: 1 }, { unique: true }),
    database.collection("members").createIndex({ chitGroupId: 1 }),
    database.collection("payments").createIndex({ memberId: 1, monthNumber: 1 }, { unique: true }),
    database.collection("auctions").createIndex({ chitGroupId: 1, monthNumber: 1 }, { unique: true }),
    database.collection("otpChallenges").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    database.collection("otpChallenges").createIndex({ email: 1 }, { unique: true }),
  ]);
  return database;
}

export async function getCollection<T extends object>(name: string): Promise<Collection<T>> {
  return (await getDb()).collection<T>(name);
}

function stableUserId(openId: string) {
  return openId.split("").reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 2147483647, 7);
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const users = await getCollection<User>("users");
  const now = new Date();
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
        updatedAt: now,
      },
      $setOnInsert: { id: stableUserId(user.openId), openId: user.openId, createdAt: now },
    },
    { upsert: true },
  );
}

export type OtpChallengeRecord = {
  email: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  createdAt: Date;
};

export async function saveOtpChallenge(challenge: OtpChallengeRecord) {
  const challenges = await getCollection<OtpChallengeRecord>("otpChallenges");
  await challenges.replaceOne({ email: challenge.email }, challenge, { upsert: true });
}

export async function getOtpChallenge(email: string) {
  return (await getCollection<OtpChallengeRecord>("otpChallenges")).findOne({ email });
}

export async function updateOtpAttempts(email: string, attempts: number) {
  await (await getCollection<OtpChallengeRecord>("otpChallenges")).updateOne({ email }, { $set: { attempts } });
}

export async function deleteOtpChallenge(email: string) {
  await (await getCollection<OtpChallengeRecord>("otpChallenges")).deleteOne({ email });
}

export async function getUserByOpenId(openId: string) {
  const users = await getCollection<User>("users");
  return users.findOne({ openId });
}

export function oid(value: string) {
  if (!ObjectId.isValid(value)) throw new Error("Invalid record id");
  return new ObjectId(value);
}

export function serialize<T extends Record<string, unknown>>(value: T | null) {
  if (!value) return value;
  return JSON.parse(JSON.stringify(value, (_, item) => (item instanceof ObjectId ? item.toString() : item)));
}
