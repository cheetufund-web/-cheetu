import { afterEach, describe, expect, it, vi } from "vitest";
import { createContext } from "./_core/context";
import { sdk } from "./_core/sdk";
import * as monitoring from "./monitoring";

const request = { protocol: "http", headers: {} } as never;
const response = {} as never;

describe("anonymous authentication context", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(["Missing session cookie", "Invalid session cookie"])(
    "does not report expected %s errors",
    async message => {
      vi.spyOn(sdk, "authenticateRequest").mockRejectedValue(new Error(message));
      const report = vi.spyOn(monitoring, "reportServerError").mockImplementation(() => undefined);

      await expect(createContext({ req: request, res: response } as never)).resolves.toMatchObject({ user: null });

      expect(report).not.toHaveBeenCalled();
    },
  );

  it("continues reporting unexpected authentication failures", async () => {
    vi.spyOn(sdk, "authenticateRequest").mockRejectedValue(new Error("JWT signing key unavailable"));
    const report = vi.spyOn(monitoring, "reportServerError").mockImplementation(() => undefined);

    await expect(createContext({ req: request, res: response } as never)).resolves.toMatchObject({ user: null });

    expect(report).toHaveBeenCalledWith("auth.context_resolution_failed", expect.any(Error));
  });
});
