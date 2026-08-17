import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { reportServerError } from "../monitoring";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

function isExpectedAnonymousRequest(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message === "Missing session cookie" || message === "Invalid session cookie";
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    if (!isExpectedAnonymousRequest(error)) {
      reportServerError("auth.context_resolution_failed", error);
    }
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
