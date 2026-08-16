export function isMongoUnavailable(error: unknown) {
  return error instanceof Error && /MongoServerSelectionError|Server selection timed out|MONGODB_URI is not configured/i.test(error.message);
}
