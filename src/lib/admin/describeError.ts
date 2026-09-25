/**
 * Firestore/gRPC errors carry a numeric `.code` (google-gax status code)
 * alongside `.message` — both are surfaced in every admin route's 500
 * response (see eligible-events/route.ts for why: no access to this
 * deployment's Cloud Logging from wherever the code is developed, so the
 * response body is the only available diagnostic channel for a failure
 * that only reproduces against the real deployed backend). Safe to return:
 * every caller is already admin-authenticated, and a Firestore error
 * message never contains secrets — at most a project id or resource path.
 */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    return code !== undefined ? `${error.message} (code ${code})` : error.message;
  }
  return String(error);
}
