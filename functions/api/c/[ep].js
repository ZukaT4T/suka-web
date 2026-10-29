// GET /api/c/EP01  รูปปกของบทเรียน
export async function onRequestGet({ env, params }) {
  const ep = String(params.ep || "");
  if (!/^EP\d{2}$/.test(ep) || !env.VIDEOS) return new Response("not found", { status: 404 });
  const obj = await env.VIDEOS.get("cover/" + ep + ".jpg");
  if (!obj) return new Response("not found", { status: 404 });
  return new Response(obj.body, { headers: { "content-type": obj.httpMetadata?.contentType || "image/jpeg", "cache-control": "public, max-age=86400" } });
}
