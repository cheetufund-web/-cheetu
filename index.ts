import "dotenv/config";
import { createApp } from "./server/_core/app";

const { app } = await createApp();

export default app;
