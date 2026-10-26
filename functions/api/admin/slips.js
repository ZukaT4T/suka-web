// GET /api/admin/slips -> ประวัติสลิปที่บอทตรวจ (200 รายการล่าสุด)
import { json, bad, isAdmin } from "../../_lib.js";

export async function onRequestGet({ request, env }) {
  if (!env.SUKA_KV) return bad("ระบบยังไม่พร้อม (KV)", 500);
  if (!isAdmin(request, env)) return bad("ไม่มีสิทธิ์", 401);
  const list = (await env.SUKA_KV.get("sliplog", "json")) || [];
  return json({ ok: true, slips: list, ready: { line: !!env.LINE_CHANNEL_TOKEN && !!env.LINE_CHANNEL_SECRET, easyslip: !!env.EASYSLIP_KEY } });
}
