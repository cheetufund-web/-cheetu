import express, { type Express } from "express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

export function createApiApp(): Express {
  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );
  return app;
}

export async function createDevelopmentApp(server: import("node:http").Server): Promise<Express> {
  const app = createApiApp();
  const { setupVite } = await import("./vite");
  await setupVite(app, server);
  return app;
}

export function createProductionApp(): Express {
  const app = createApiApp();
  return app;
}

export default createApiApp;

