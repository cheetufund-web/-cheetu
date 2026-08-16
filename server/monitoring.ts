const SENSITIVE_KEYS = /password|secret|token|authorization|cookie|otp|code|uri/i;

function sanitize(value: unknown): unknown {
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, SENSITIVE_KEYS.test(key) ? "[REDACTED]" : sanitize(item)]));
  }
  return value;
}

export function reportServerError(event: string, error: unknown, context: Record<string, unknown> = {}) {
  console.error(
    JSON.stringify({
      level: "error",
      service: "cheetu",
      event,
      time: new Date().toISOString(),
      error: sanitize(error),
      context: sanitize(context),
    }),
  );
}
