export function absoluteImageUrl(req, url) {
  if (!url) return null;
  // Already absolute (http/https or data URIs)
  if (/^https?:\/\//i.test(url) || /^data:/i.test(url)) return url;

  const base = process.env.BACKEND_URL?.replace(/\/$/, "") || `${req.protocol}://${req.get("host")}`;
  if (url.startsWith("/")) return `${base}${url}`;
  return `${base}/${url}`;
}

export function absoluteImageUrls(req, urls) {
  if (!Array.isArray(urls)) return [];
  return urls.map((u) => absoluteImageUrl(req, u)).filter(Boolean);
}

