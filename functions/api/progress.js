// PUT /api/progress  { progress: { EP01: timestamp, ... } }  บันทึกความคืบหน้าตามรหัส (ซิงก์ทุกเครื่อง)
import { json, bad, getSession, readJSON } from "../_lib.js";

export async function onRequestPut({ request, env }) {
  const s = await getSession(request, env);
  if (!s) return bad("ไม่ได้เข้าสู่ระบบ", 401);
  const body = await readJSON(request);
  const p = body.progress && typeof body.progress === "object" ? body.progress : {};
  const clean = {};
  for (const k of Object.keys(p)) if (/^EP\d{2}$/.test(k)) clean[k] = Number(p[k]) || 1;
  await env.SUKA_KV.put("progress:" + s.code, JSON.stringify(clean));
  return json({ ok: true, count: Object.keys(clean).length });
}
