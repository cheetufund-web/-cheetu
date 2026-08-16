import { describe, expect, it } from "vitest";
import nodemailer from "nodemailer";

describe("configured Gmail SMTP", () => {
  it("authenticates with the configured SMTP server", async () => {
    expect(process.env.SMTP_HOST).toBe("smtp.gmail.com");
    expect(process.env.SMTP_USER).toBe("cheetufund@gmail.com");
    expect(process.env.SMTP_PASSWORD).toBeTruthy();

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    });

    await expect(transporter.verify()).resolves.toBe(true);
    transporter.close();
  }, 20000);
});

// This test validates connectivity and authentication only; it never sends an email.
