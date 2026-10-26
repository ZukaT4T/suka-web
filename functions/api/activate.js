// POST /api/activate  { name, code }  -> { ok, token, name }
// รหัส 1 รหัส = นักเรียน 1 คน ใช้ได้หลายเครื่อง (ถ้าชื่อตรงกับครั้งแรก)
import { json, bad, normCode, randomToken, readJSON } from "../_lib.js";

export async function onRequestPost({ request, env }) {
  if (!env.SUKA_KV) return bad("ระบบยังไม่พร้อม (KV)", 500);
  const body = await readJSON(request);
  const name = String(body.name || "").trim().slice(0, 60);
  const code = normCode(body.code);
  if (!name) return bad("กรุณากรอกชื่อ");
  if (!/^[A-Z0-9]{2,8}-[A-Z0-9]{4,8}$/.test(code)) return bad("รูปแบบรหัสไม่ถูกต้อง");

  // กันเดารหัส: จำกัดความถี่ต่อ IP
  const ip = request.headers.get("cf-connecting-ip") || "0";
  const rlKey = "rl:" + ip;
  const tries = parseInt((await env.SUKA_KV.get(rlKey)) || "0", 10);
  if (tries >= 10) return bad("ลองหลายครั้งเกินไป รอ 10 นาทีแล้วลองใหม่", 429);
  await env.SUKA_KV.put(rlKey, String(tries + 1), { expirationTtl: 600 });

  const raw = await env.SUKA_KV.get("code:" + code);
  if (!raw) return bad("รหัสไม่ถูกต้อง ตรวจตัวสะกดอีกครั้ง หรือทักแชต LINE @zuka");
  const rec = JSON.parse(raw);
  if (rec.revoked) return bad("รหัสนี้ถูกยกเลิกแล้ว ทักแชต LINE @zuka");

  if (!rec.usedBy) {
    rec.usedBy = name; rec.usedAt = Date.now(); rec.devices = 1;
  } else {
    const same = rec.usedBy.replace(/\s+/g, "").toLowerCase() === name.replace(/\s+/g, "").toLowerCase();
    if (!same) return bad("รหัสนี้ถูกใช้แล้วโดยชื่ออื่น ถ้าเป็นของคุณ กรอกชื่อให้ตรงกับครั้งแรก หรือทักแชต LINE @zuka");
    rec.devices = (rec.devices || 1) + 1;
    if (rec.devices > 5) return bad("รหัสนี้ถูกใช้บนหลายเครื่องเกินกำหนด ทักแชต LINE @zuka");
  }
  await env.SUKA_KV.put("code:" + code, JSON.stringify(rec));

  const token = randomToken();
  await env.SUKA_KV.put("session:" + token, JSON.stringify({ code, name: rec.usedBy, at: Date.now() }));
  await env.SUKA_KV.delete(rlKey);
  return json({ ok: true, token, name: rec.usedBy });
}
