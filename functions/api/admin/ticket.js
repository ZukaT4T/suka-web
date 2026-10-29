// POST /api/admin/ticket -> { ticket }  รหัสอัปโหลดคลิปชั่วคราว ใช้ได้ 3 ชั่วโมง (เฉพาะแอดมินสร้างได้)
import { json, bad, isAdmin, randomToken } from "../../_lib.js";

export async function onRequestPost({ request, env }) {
  if (!env.SUKA_KV) return bad("ระบบยังไม่พร้อม (KV)", 500);
  if (!isAdmin(request, env)) return bad("ไม่มีสิทธิ์", 401);
  const ticket = randomToken();
  await env.SUKA_KV.put("upticket:" + ticket, String(Date.now()), { expirationTtl: 3 * 3600 });
  return json({ ok: true, ticket, expiresInHours: 3 });
}
