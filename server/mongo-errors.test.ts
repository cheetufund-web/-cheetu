import { describe, expect, it } from "vitest";
import { isMongoUnavailable } from "./mongo-errors";

describe("isMongoUnavailable", () => {
  it("recognizes Atlas server-selection timeouts", () => {
    expect(isMongoUnavailable(new Error("MongoServerSelectionError: Server selection timed out after 5000 ms"))).toBe(true);
    expect(isMongoUnavailable(new Error("MONGODB_URI is not configured"))).toBe(true);
  });

  it("does not hide unrelated application failures", () => {
    expect(isMongoUnavailable(new Error("Validation failed"))).toBe(false);
    expect(isMongoUnavailable("Server selection timed out after 5000 ms")).toBe(false);
  });
});
