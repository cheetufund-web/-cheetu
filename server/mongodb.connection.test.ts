import { describe, expect, it } from "vitest";
import { MongoClient } from "mongodb";

describe("MongoDB configuration", () => {
  it("accepts a MongoDB SRV URI when configured", () => {
    expect(process.env.MONGODB_URI, "MONGODB_URI must be configured").toMatch(/^mongodb/);
  });

  it.skipIf(process.env.RUN_MONGODB_LIVE_TEST !== "1")("connects with the configured MONGODB_URI when live testing is enabled", async () => {
    const uri = process.env.MONGODB_URI;
    expect(uri, "MONGODB_URI must be configured").toMatch(/^mongodb/);

    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const client = new MongoClient(uri!, { serverSelectionTimeoutMS: 7000, connectTimeoutMS: 7000 });
      try {
        await client.connect();
        const result = await client.db().command({ ping: 1 });
        expect(result.ok).toBe(1);
        await client.close();
        return;
      } catch (error) {
        lastError = error;
        await client.close().catch(() => undefined);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    throw lastError;
  }, 30000);
});
