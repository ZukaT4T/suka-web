// GET /api/admin/videos -> { EP01: url, ... }   PUT { videos: {...} }  (ลิงก์คลิปเห็นเฉพาะนักเรียนที่ login)
import { json, bad, isAdmin, readJSON } from "../../_lib.js";

export async function onRequest({ request, env }) {
  if (!env.SUKA_KV) return bad("ระบบยังไม่พร้อม (KV)", 500);
  if (!isAdmin(request, env)) return bad("ไม่มีสิทธิ์", 401);
  if (request.method === "GET") return json({ ok: true, videos: (await env.SUKA_KV.get("videos", "json")) || {} });
  if (request.method === "PUT") {
    const body = await readJSON(request);
    const v = body.videos && typeof body.videos === "object" ? body.videos : {};
    const clean = {};
    for (const k of Object.keys(v)) {
      const url = String(v[k] || "").trim();
      if ((/^EP\d{2}$/.test(k) || /^DOC_(MANUAL|NOTEBOOK)$/.test(k)) && /^https:\/\//.test(url)) clean[k] = url.slice(0, 500);
    }
    await env.SUKA_KV.put("videos", JSON.stringify(clean));
    return json({ ok: true, count: Object.keys(clean).length });
  }
  return bad("method not allowed", 405);
}
