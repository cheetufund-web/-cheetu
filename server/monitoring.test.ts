import { describe, expect, it, vi } from "vitest";
import { reportServerError } from "./monitoring";

describe("production monitoring redaction", () => {
  it("redacts authentication and database secrets from structured logs", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    reportServerError("auth.failure", new Error("invalid otp"), {
      email: "cheetufund@gmail.com",
      otp: "123456",
      password: "hidden",
      mongodbUri: "mongodb+srv://secret",
    });
    const payload = JSON.parse(String(spy.mock.calls[0]?.[0]));
    expect(payload.context.email).toBe("cheetufund@gmail.com");
    expect(payload.context.otp).toBe("[REDACTED]");
    expect(payload.context.password).toBe("[REDACTED]");
    expect(payload.context.mongodbUri).toBe("[REDACTED]");
    spy.mockRestore();
  });
});
