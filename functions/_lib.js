// helpers ใช้ร่วมกันทุก API (Cloudflare Pages Functions)
export const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra },
  });

// รหัสบทเรียน: Part 1 = EP01–EP48, Part 2 = P2-EP01, P2-EP02, …
export const EP_RE = /^(?:P2-)?EP\d{2}$/;

export const bad = (msg, status = 400) => json({ ok: false, error: msg }, status);

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // ตัดตัวที่สับสน (0/O, 1/I)
export function randomCode(prefix = "SUKA") {
  const a = new Uint8Array(4); crypto.getRandomValues(a);
  return prefix + "-" + Array.from(a, (b) => ALPHABET[b % ALPHABET.length]).join("");
}
export function randomToken() {
  const a = new Uint8Array(24); crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function normCode(s) {
  return String(s || "").trim().toUpperCase().replace(/\s+/g, "");
}

// ---- session ----
export async function getSession(request, env) {
  const h = request.headers.get("authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!token) return null;
  const raw = await env.SUKA_KV.get("session:" + token);
  if (!raw) return null;
  const s = JSON.parse(raw);
  s.token = token;
  const a = await checkActive(s, env);
  return a.ok ? s : null;
}

// เข้าระบบได้ทีละเครื่อง: token ต้องเป็นเครื่องล่าสุดที่ล็อกอินด้วยรหัสนี้ (rec.session)
// รหัสเก่าที่ยังไม่มี rec.session -> เครื่องแรกที่เรียกเข้ามาหลังอัปเดตจะได้สิทธิ์ เครื่องอื่นหลุด
export async function checkActive(s, env) {
  const raw = await env.SUKA_KV.get("code:" + s.code);
  if (!raw) return { ok: false };
  const rec = JSON.parse(raw);
  if (rec.revoked) return { ok: false, revoked: true };
  if (s.kicked) return { ok: false, kicked: true };
  if (!rec.session) { rec.session = s.token; await env.SUKA_KV.put("code:" + s.code, JSON.stringify(rec)); return { ok: true }; }
  if (rec.session !== s.token) { await env.SUKA_KV.put("session:" + s.token, JSON.stringify({ kicked: true, code: s.code }), { expirationTtl: 7 * 86400 }); return { ok: false, kicked: true }; }
  return { ok: true };
}

// ใช้กับ /api/me เพื่อบอกเหตุผลที่หลุด (ถูกล็อกอินจากเครื่องอื่น)
export async function sessionStatus(request, env) {
  const h = request.headers.get("authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!token) return { s: null };
  const raw = await env.SUKA_KV.get("session:" + token);
  if (!raw) return { s: null };
  const s = JSON.parse(raw); s.token = token;
  const a = await checkActive(s, env);
  return a.ok ? { s } : { s: null, kicked: !!a.kicked, revoked: !!a.revoked };
}

export function isAdmin(request, env) {
  const key = request.headers.get("x-admin-key") || "";
  return env.ADMIN_KEY && key && timingSafeEqual(key, env.ADMIN_KEY);
}
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function readJSON(request) {
  try { return await request.json(); } catch { return {}; }
}

// ผู้มีสิทธิ์อัปโหลดคลิป: แอดมิน หรือรหัสอัปโหลดชั่วคราวที่แอดมินสร้าง (หมดอายุเอง)
export async function isUploader(request, env) {
  if (isAdmin(request, env)) return true;
  const t = request.headers.get("x-upload-ticket") || "";
  if (!/^[0-9a-f]{48}$/.test(t)) return false;
  return !!(await env.SUKA_KV.get("upticket:" + t));
}

// เช็กสิทธิ์นักเรียนจาก token (ใช้กับ <video src> ที่ส่ง header ไม่ได้)
export async function sessionFromToken(token, env) {
  if (!/^[0-9a-f]{48}$/.test(token || "")) return null;
  const raw = await env.SUKA_KV.get("session:" + token);
  if (!raw) return null;
  const s = JSON.parse(raw); s.token = token;
  const a = await checkActive(s, env);
  return a.ok ? s : null;
}
