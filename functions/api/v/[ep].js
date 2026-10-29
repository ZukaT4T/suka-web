// GET /api/v/EP01?t=<session token>  เล่นคลิปบทเรียน (เฉพาะนักเรียนที่ login อยู่) รองรับการเลื่อนดู (Range)
import { sessionFromToken } from "../../_lib.js";

export async function onRequestGet({ request, env, params }) {
  const ep = String(params.ep || "");
  if (!/^EP\d{2}$/.test(ep) || !env.VIDEOS) return new Response("not found", { status: 404 });
  const t = new URL(request.url).searchParams.get("t") || "";
  if (!(await sessionFromToken(t, env))) return new Response("กรุณาเข้าสู่ระบบห้องเรียนก่อน", { status: 401 });

  const key = "video/" + ep + ".mp4";
  const head = await env.VIDEOS.head(key);
  if (!head) return new Response("not found", { status: 404 });
  const size = head.size;
  const base = { "content-type": "video/mp4", "accept-ranges": "bytes", "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff" };

  const m = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") || "");
  if (m) {
    let start = m[1] === "" ? Math.max(0, size - Number(m[2])) : Number(m[1]);
    let end = m[1] !== "" && m[2] !== "" ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { "content-range": "bytes */" + size } });
    const obj = await env.VIDEOS.get(key, { range: { offset: start, length: end - start + 1 } });
    return new Response(obj.body, { status: 206, headers: { ...base, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(end - start + 1) } });
  }
  const obj = await env.VIDEOS.get(key);
  return new Response(obj.body, { status: 200, headers: { ...base, "content-length": String(size) } });
}
