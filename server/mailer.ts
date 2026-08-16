import nodemailer from "nodemailer";

export function isSmtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

export async function sendOtpEmail(to: string, code: string) {
  if (!isSmtpConfigured()) {
    if (process.env.NODE_ENV === "development") return { mode: "demo" as const };
    throw new Error("SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, and OTP_FROM.");
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  });

  await transporter.sendMail({
    from: process.env.OTP_FROM || process.env.SMTP_USER,
    to,
    subject: "Your Cheetu Chits verification code",
    text: `Your Cheetu Chits verification code is ${code}. It expires in 5 minutes.`,
    html: `<p>Your Cheetu Chits verification code is <strong>${code}</strong>.</p><p>It expires in 5 minutes.</p>`,
  });

  return { mode: "smtp" as const };
}
