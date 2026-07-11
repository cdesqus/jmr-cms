export function publicUrl(request: Request, path: string) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const proto =
    forwardedProto ?? (host?.startsWith("localhost") ? "http" : "https");

  if (host) return new URL(path, `${proto}://${host}`);
  return new URL(path, request.url);
}
