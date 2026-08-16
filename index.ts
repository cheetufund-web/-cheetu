import "dotenv/config";
import express from "express";
import { createApp } from "./server/_core/app";

const { app } = await createApp();

void express;

export default app;
