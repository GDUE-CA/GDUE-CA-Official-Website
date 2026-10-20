/**
 * 访客实际访问的 host（可含端口）：经 Cloudflare / Nginx 反代时取 X-Forwarded-Host，否则取 Host。
 *
 * 多层反代可能各追加一次，形如 "www.gdueca.com, www.gdueca.com"，只取最外层写入的第一个值。
 */
export function requestHost(headers: Pick<Headers, "get">): string {
  return (headers.get("x-forwarded-host") ?? headers.get("host") ?? "").split(",")[0].trim();
}
