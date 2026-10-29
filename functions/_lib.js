// helpers ใช้ร่วมกันทุก API (Cloudflare Pages Functions)
export const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra },
  });

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
  return s;
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
  const s = JSON.parse(raw);
  const c = await env.SUKA_KV.get("code:" + s.code);
  if (!c || JSON.parse(c).revoked) return null;
  return s;
}
