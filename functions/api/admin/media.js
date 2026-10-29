// คลิปและปกในห้องเรียน (เก็บใน Cloudflare R2 binding: VIDEOS)
// GET  /api/admin/media                       -> { media: { EP01: { video: bytes, cover: bytes, at } } }
// PUT  /api/admin/media?ep=EP01&kind=video     body = ไฟล์ mp4
// PUT  /api/admin/media?ep=EP01&kind=cover     body = ไฟล์ jpg/png
import { json, bad, isUploader } from "../../_lib.js";

const KINDS = { video: { ext: "mp4", types: ["video/mp4"] }, cover: { ext: "jpg", types: ["image/jpeg", "image/png", "image/webp"] } };

export async function onRequest({ request, env }) {
  if (!env.SUKA_KV) return bad("ระบบยังไม่พร้อม (KV)", 500);
  if (!env.VIDEOS) return bad("ยังไม่ได้เชื่อมที่เก็บคลิป (R2)", 500);
  if (!(await isUploader(request, env))) return bad("ไม่มีสิทธิ์", 401);
  const index = (await env.SUKA_KV.get("media", "json")) || {};
  if (request.method === "GET") return json({ ok: true, media: index });
  if (request.method !== "PUT") return bad("method not allowed", 405);

  const url = new URL(request.url);
  const ep = url.searchParams.get("ep") || "";
  const kind = url.searchParams.get("kind") || "";
  if (!/^EP\d{2}$/.test(ep) || !KINDS[kind]) return bad("ep/kind ไม่ถูกต้อง");
  const type = (request.headers.get("content-type") || "").split(";")[0].trim();
  if (!KINDS[kind].types.includes(type)) return bad("ชนิดไฟล์ไม่ถูกต้อง: " + type);
  const body = await request.arrayBuffer();
  if (!body.byteLength) return bad("ไฟล์ว่าง");

  await env.VIDEOS.put(kind + "/" + ep + "." + KINDS[kind].ext, body, { httpMetadata: { contentType: type } });
  index[ep] = Object.assign({}, index[ep], { [kind]: body.byteLength, at: Date.now() });
  await env.SUKA_KV.put("media", JSON.stringify(index));
  return json({ ok: true, ep, kind, bytes: body.byteLength });
}
