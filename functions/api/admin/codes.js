// แอดมิน (header x-admin-key = ADMIN_KEY)
// GET    /api/admin/codes            -> รายการรหัสทั้งหมด
// POST   /api/admin/codes {count, note} -> สร้างรหัสใหม่
// DELETE /api/admin/codes {code}     -> ยกเลิกรหัส (revoke) / {code, restore:true} คืนสถานะ
import { json, bad, isAdmin, randomCode, normCode, readJSON } from "../../_lib.js";

export async function onRequest({ request, env }) {
  if (!env.SUKA_KV) return bad("ระบบยังไม่พร้อม (KV)", 500);
  if (!isAdmin(request, env)) return bad("ไม่มีสิทธิ์", 401);

  if (request.method === "GET") {
    const out = []; let cursor;
    do {
      const r = await env.SUKA_KV.list({ prefix: "code:", cursor });
      for (const k of r.keys) {
        const rec = await env.SUKA_KV.get(k.name, "json");
        out.push({ code: k.name.slice(5), ...rec });
      }
      cursor = r.list_complete ? null : r.cursor;
    } while (cursor);
    out.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return json({ ok: true, codes: out });
  }

  if (request.method === "POST") {
    const body = await readJSON(request);
    const count = Math.min(Math.max(parseInt(body.count || 1, 10), 1), 50);
    const note = String(body.note || "").slice(0, 80);
    const made = [];
    for (let i = 0; i < count; i++) {
      let code; do { code = randomCode(); } while (await env.SUKA_KV.get("code:" + code));
      await env.SUKA_KV.put("code:" + code, JSON.stringify({ createdAt: Date.now(), note, course: "beginner48" }));
      made.push(code);
    }
    return json({ ok: true, codes: made });
  }

  if (request.method === "DELETE") {
    const body = await readJSON(request);
    const code = normCode(body.code);
    const rec = await env.SUKA_KV.get("code:" + code, "json");
    if (!rec) return bad("ไม่พบรหัส", 404);
    rec.revoked = !body.restore;
    await env.SUKA_KV.put("code:" + code, JSON.stringify(rec));
    return json({ ok: true, code, revoked: rec.revoked });
  }
  return bad("method not allowed", 405);
}
