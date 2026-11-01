// GET /api/me  (Authorization: Bearer <token>)
// -> { ok, name, code, progress, videos }   videos = { EP01: "embed url", ... }
import { json, bad, getSession, sessionStatus } from "../_lib.js";

export async function onRequestGet({ request, env }) {
  if (!env.SUKA_KV) return bad("ระบบยังไม่พร้อม (KV)", 500);
  const st = await sessionStatus(request, env);
  if (st.kicked) return json({ ok: false, kicked: true, error: "รหัสนี้ถูกเข้าสู่ระบบจากเครื่องอื่น เครื่องนี้จึงออกจากระบบอัตโนมัติ (ใช้ได้ทีละ 1 เครื่อง)" }, 401);
  if (st.revoked) return bad("รหัสถูกยกเลิก", 401);
  const s = st.s;
  if (!s) return bad("ไม่ได้เข้าสู่ระบบ", 401);
  const [progress, videos, media] = await Promise.all([
    env.SUKA_KV.get("progress:" + s.code, "json"),
    env.SUKA_KV.get("videos", "json"),
    env.SUKA_KV.get("media", "json"),
  ]);
  return json({ ok: true, name: s.name, code: s.code, progress: progress || {}, videos: videos || {}, media: media || {} });
}

// POST /api/me/logout
export async function onRequestDelete({ request, env }) {
  const s = await getSession(request, env);
  if (s) await env.SUKA_KV.delete("session:" + s.token);
  return json({ ok: true });
}
