export class BoundedJsonError extends Error {
  readonly status: 400 | 413;

  constructor(status: 400 | 413, message: string) {
    super(message);
    this.name = "BoundedJsonError";
    this.status = status;
  }
}

function declaredLength(request: Request) {
  const header = request.headers.get("content-length")?.trim();
  if (!header || !/^\d+$/.test(header)) return undefined;
  const value = Number(header);
  return Number.isSafeInteger(value) ? value : Number.POSITIVE_INFINITY;
}

export async function readBoundedJsonObject(
  request: Request,
  maximumBytes = 4_096,
): Promise<Record<string, unknown>> {
  const length = declaredLength(request);
  if (length !== undefined && length > maximumBytes) {
    throw new BoundedJsonError(413, "Request is too large.");
  }
  if (!request.body) {
    throw new BoundedJsonError(400, "Invalid request.");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        throw new BoundedJsonError(413, "Request is too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const value = JSON.parse(decoded);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new TypeError("JSON object required.");
    }
    return value as Record<string, unknown>;
  } catch {
    throw new BoundedJsonError(400, "Invalid request.");
  }
}
