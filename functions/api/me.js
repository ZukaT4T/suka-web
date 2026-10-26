// GET /api/me  (Authorization: Bearer <token>)
// -> { ok, name, code, progress, videos }   videos = { EP01: "embed url", ... }
import { json, bad, getSession } from "../_lib.js";

export async function onRequestGet({ request, env }) {
  if (!env.SUKA_KV) return bad("ระบบยังไม่พร้อม (KV)", 500);
  const s = await getSession(request, env);
  if (!s) return bad("ไม่ได้เข้าสู่ระบบ", 401);
  const codeRaw = await env.SUKA_KV.get("code:" + s.code);
  if (!codeRaw || JSON.parse(codeRaw).revoked) return bad("รหัสถูกยกเลิก", 401);
  const [progress, videos] = await Promise.all([
    env.SUKA_KV.get("progress:" + s.code, "json"),
    env.SUKA_KV.get("videos", "json"),
  ]);
  return json({ ok: true, name: s.name, code: s.code, progress: progress || {}, videos: videos || {} });
}

// POST /api/me/logout
export async function onRequestDelete({ request, env }) {
  const s = await getSession(request, env);
  if (s) await env.SUKA_KV.delete("session:" + s.token);
  return json({ ok: true });
}
