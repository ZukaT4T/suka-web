// POST /api/line-webhook  — LINE Messaging API webhook
// ลูกค้าส่งรูปสลิป -> ตรวจกับ EasySlip -> ถ้าผ่าน:
//   1,490 บาท  = สร้างรหัส VIP แล้วตอบกลับทันที
//   19,999 / 39,999 / 79,999 = ตอบรับ + แจ้งว่าแอดมินจะนัดเรียน
//   อื่นๆ / ไม่ผ่าน = ตอบว่าแอดมินจะตรวจให้ (ไม่ออกรหัส)
// ต้องตั้งค่า secret: LINE_CHANNEL_SECRET, LINE_CHANNEL_TOKEN, EASYSLIP_KEY  และ KV: SUKA_KV
// (ไม่บังคับ) SHEET_URL + SHEET_SECRET = ส่งผลตรวจสลิปลง Google Sheet "ออเดอร์และตรวจสลิป โค้ชสุขา"
import { randomCode } from "../_lib.js";

const PACKAGES = {
  1490: { key: "online", name: "คอร์สออนไลน์ 48 บท" },
  19999: { key: "pv2", name: "Private Coaching 2 เดือน" },
  39999: { key: "pv6", name: "Private Coaching 6 เดือน" },
  79999: { key: "pv12", name: "Private Coaching 12 เดือน" },
};
// บัญชีรับเงิน: กสิกรไทย (004) ปุญภัช ภูธาราพงษ์ 746-2-43028-5
const RECEIVER = { bankId: "004", nameTh: "ปุญภัช", nameEn: "PUNYAPHAT", acctDigits: "3028" };
const LEARN_URL = "https://zuka-t4tacademy.com/learn/";
const OPENCHAT_URL = "https://line.me/ti/g2/thhJkmSQitUosAotVZhCeL2UwBkaMpftkAN8Ww?utm_source=invitation&utm_medium=link_copy&utm_campaign=default";

export async function onRequestPost(context) {
  const { request, env } = context;
  const body = await request.text();
  if (!env.LINE_CHANNEL_SECRET || !(await validSignature(body, request.headers.get("x-line-signature"), env.LINE_CHANNEL_SECRET))) {
    return new Response("bad signature", { status: 401 });
  }
  let payload; try { payload = JSON.parse(body); } catch { return new Response("ok"); }
  const work = (payload.events || []).map((ev) => handleEvent(ev, env).catch((e) => logSlip(env, { at: Date.now(), result: "error", detail: String(e).slice(0, 200) })));
  context.waitUntil(Promise.all(work));
  return new Response("ok"); // ตอบ LINE ทันที แล้วทำงานต่อเบื้องหลัง
}

// ลูกค้าพิมพ์คำเหล่านี้ = ขอรหัส VIP เดิม (ส่งให้เฉพาะรหัสที่ออกให้บัญชี LINE นี้)
const RESEND_WORDS = ["ขอรหัส", "ขอรหัสvip", "ขอรหัสใหม่", "ลืมรหัส", "รหัสหาย", "ขอรหัสเข้าเรียน"];

async function handleEvent(ev, env) {
  if (ev.type !== "message" || !ev.replyToken) return;
  const userId = ev.source?.userId || "";
  if (ev.message?.type === "text") {
    const t = String(ev.message.text || "").replace(/\s+/g, "").toLowerCase();
    if (RESEND_WORDS.includes(t)) return resendCode(ev, env, userId);
    return;
  }
  if (ev.message?.type !== "image") return;

  // 1) ดึงรูปจาก LINE
  const img = await fetch(`https://api-data.line.me/v2/bot/message/${ev.message.id}/content`, {
    headers: { authorization: `Bearer ${env.LINE_CHANNEL_TOKEN}` },
  });
  if (!img.ok) return; // ไม่ใช่รูปที่ดึงได้ ปล่อยให้แอดมินดูเอง
  const b64 = toBase64(await img.arrayBuffer());

  // 2) ตรวจกับ EasySlip
  const r = await fetch("https://developer.easyslip.com/api/v1/verify", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.EASYSLIP_KEY}` },
    body: JSON.stringify({ image: b64, checkDuplicate: true }),
  });
  const res = await r.json().catch(() => ({}));
  const name = await displayName(userId, env);

  if (res?.message === "duplicate_slip") {
    await logSlip(env, { at: Date.now(), userId, name, result: "duplicate", transRef: res?.data?.transRef, amount: Math.round(Number(res?.data?.amount?.amount) || 0) || undefined }, res?.data);
    return reply(ev.replyToken, env, "สลิปนี้เคยถูกใช้แล้วค่ะ ถ้าเป็นการโอนใหม่ รบกวนส่งสลิปใบล่าสุดนะคะ แอดมินจะตรวจสอบให้อีกครั้งค่ะ 🙏");
  }
  if (!r.ok || res?.status !== 200 || !res?.data) {
    // ไม่ใช่สลิป หรืออ่านไม่ได้ -> เงียบไว้ ให้แอดมินดู (ลูกค้าอาจส่งรูปอื่น)
    await logSlip(env, { at: Date.now(), userId, name, result: "not_slip", detail: res?.message || r.status });
    return;
  }

  const d = res.data;
  const amount = Math.round(Number(d.amount?.amount ?? d.amount) || 0);
  const transRef = String(d.transRef || "");
  const rc = d.receiver || {};
  const recvOk =
    String(rc.bank?.id || "") === RECEIVER.bankId &&
    (String(rc.account?.name?.th || "").includes(RECEIVER.nameTh) ||
      String(rc.account?.name?.en || "").toUpperCase().includes(RECEIVER.nameEn) ||
      String(rc.account?.bank?.account || "").replace(/\D/g, "").includes(RECEIVER.acctDigits));

  // กันใช้สลิปซ้ำในระบบเราเองด้วย
  if (transRef && (await env.SUKA_KV.get("slip:" + transRef))) {
    await logSlip(env, { at: Date.now(), userId, name, result: "duplicate", amount, transRef }, d);
    return reply(ev.replyToken, env, "สลิปนี้เคยใช้รับรหัสไปแล้วค่ะ ถ้ามีปัญหาเข้าเรียน พิมพ์บอกแอดมินได้เลยนะคะ 🙏");
  }

  if (!recvOk) {
    await logSlip(env, { at: Date.now(), userId, name, result: "wrong_receiver", amount, transRef, detail: rc.account?.name?.th || rc.account?.name?.en || "" }, d);
    return reply(ev.replyToken, env, "ได้รับสลิปแล้วค่ะ แต่ชื่อบัญชีผู้รับไม่ตรงกับบัญชีของสุขาสอนเทรด แอดมินจะตรวจสอบและตอบกลับโดยเร็วนะคะ 🙏");
  }

  const pk = PACKAGES[amount];
  if (!pk) {
    await logSlip(env, { at: Date.now(), userId, name, result: "amount_mismatch", amount, transRef }, d);
    return reply(ev.replyToken, env, `ได้รับยอดโอน ${amount.toLocaleString("en-US")} บาทแล้วค่ะ ยอดนี้ไม่ตรงกับราคาคอร์ส แอดมินจะตรวจสอบและตอบกลับโดยเร็วนะคะ 🙏`);
  }

  if (transRef) await env.SUKA_KV.put("slip:" + transRef, JSON.stringify({ at: Date.now(), userId, amount }));

  if (pk.key === "online") {
    let code; do { code = randomCode(); } while (await env.SUKA_KV.get("code:" + code));
    await env.SUKA_KV.put("code:" + code, JSON.stringify({ createdAt: Date.now(), note: `อัตโนมัติ · LINE: ${name} · ${transRef}`, course: "beginner48", lineUserId: userId, auto: true }));
    if (userId) {
      const mine = (await env.SUKA_KV.get("user:" + userId, "json")) || [];
      if (!mine.includes(code)) mine.push(code);
      await env.SUKA_KV.put("user:" + userId, JSON.stringify(mine));
    }
    await logSlip(env, { at: Date.now(), userId, name, result: "issued", amount, transRef, code, pkg: pk.name }, d);
    return reply(ev.replyToken, env,
      `ได้รับยอด 1,490 บาทเรียบร้อยค่ะ ขอบคุณที่สมัครเรียนนะคะ 🙏\n\n` +
      `รหัส VIP ของพี่: ${code}\n\n` +
      `เข้าเรียนที่ ${LEARN_URL}\n` +
      `กรอกชื่อ + รหัส VIP ครั้งเดียว ครั้งต่อไปเข้าได้เลยค่ะ\n\n` +
      `* รหัสนี้ใช้ได้ 1 คน กรุณาอย่าแชร์นะคะ\n\n` +
      `คุณได้รับคำเชิญให้เข้าร่วม "โค้ชสุขา : พูดคุยระบบเทรดทองคำ" พูดคุยสอบถามกับโค้ชโดยตรง และเพื่อนๆ เทรดเดอร์ทุกคน (ดูแลตลอดการใช้งาน)\n` +
      `แตะลิงก์เพื่อเข้าร่วมโอเพนแชท:\n${OPENCHAT_URL}`,
      code);
  }

  await logSlip(env, { at: Date.now(), userId, name, result: "private_paid", amount, transRef, pkg: pk.name }, d);
  return reply(ev.replyToken, env,
    `ได้รับยอด ${amount.toLocaleString("en-US")} บาทเรียบร้อยค่ะ 🙏\n` +
    `แพ็กเกจ: ${pk.name}\n\n` +
    `เดี๋ยวแอดมินทักไปนัดวันเริ่มเรียนกับโค้ชสุขาในแชตนี้นะคะ`);
}

async function resendCode(ev, env, userId) {
  if (!userId) return;
  let codes = (await env.SUKA_KV.get("user:" + userId, "json")) || [];
  if (!codes.length) {
    // รหัสที่ออกก่อนมีระบบนี้: ค้นจากรหัสทั้งหมด แล้วจำไว้
    let cursor;
    do {
      const page = await env.SUKA_KV.list({ prefix: "code:", cursor });
      for (const k of page.keys) {
        const rec = await env.SUKA_KV.get(k.name, "json");
        if (rec && rec.lineUserId === userId) codes.push(k.name.slice(5));
      }
      cursor = page.list_complete ? null : page.cursor;
    } while (cursor);
    if (codes.length) await env.SUKA_KV.put("user:" + userId, JSON.stringify(codes));
  }
  const active = [];
  for (const c of codes) {
    const rec = await env.SUKA_KV.get("code:" + c, "json");
    if (rec && !rec.revoked) active.push({ code: c, usedBy: rec.usedBy || "" });
  }
  const name = await displayName(userId, env);
  await logSlip(env, { at: Date.now(), userId, name, result: active.length ? "code_resent" : "code_not_found", code: active.map((a) => a.code).join(", ") });
  if (!active.length) {
    return reply(ev.replyToken, env,
      "ยังไม่พบรหัส VIP ที่ผูกกับบัญชี LINE นี้ค่ะ\n" +
      "ถ้าเคยโอนค่าเรียนแล้ว รบกวนส่งรูปสลิปเดิมหรือแจ้งชื่อผู้โอนในแชตนี้ แอดมินจะตรวจสอบและส่งรหัสให้นะคะ 🙏");
  }
  const lines = active.map((a) => `รหัส VIP: ${a.code}` + (a.usedBy ? `\nชื่อที่ใช้เข้าเรียน: ${a.usedBy}` : "")).join("\n\n");
  return reply(ev.replyToken, env,
    `ส่งรหัสเดิมให้นะคะ 🙏\n\n${lines}\n\n` +
    `เข้าเรียนที่ ${LEARN_URL}\n` +
    `กรอกชื่อให้ตรงกับที่ใช้ครั้งแรก + รหัส VIP ค่ะ\n\n` +
    `กลุ่ม OpenChat:\n${OPENCHAT_URL}`,
    active.length === 1 ? active[0].code : undefined);
}

async function reply(replyToken, env, text, code) {
  const messages = [{ type: "text", text }];
  if (code) messages.push({ type: "text", text: code }); // แยกรหัสไว้ให้กดค้างคัดลอกง่าย
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.LINE_CHANNEL_TOKEN}` },
    body: JSON.stringify({ replyToken, messages }),
  });
}

async function displayName(userId, env) {
  if (!userId) return "";
  try {
    const r = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, { headers: { authorization: `Bearer ${env.LINE_CHANNEL_TOKEN}` } });
    if (!r.ok) return "";
    return (await r.json()).displayName || "";
  } catch { return ""; }
}

// เก็บประวัติ 200 รายการล่าสุด ให้หน้าแอดมินดู + ส่งลง Google Sheet (ถ้าตั้ง SHEET_URL ไว้)
async function logSlip(env, entry, slip) {
  const list = (await env.SUKA_KV.get("sliplog", "json")) || [];
  list.unshift(entry);
  await env.SUKA_KV.put("sliplog", JSON.stringify(list.slice(0, 200)));
  if (slip !== undefined) await toSheet(env, entry, slip || {}).catch(() => {});
}

// ชื่อคอร์สต้องตรงกับแท็บ "ราคาคอร์ส" ในชีต
const SHEET_COURSE = { 1490: "คอร์สออนไลน์", 19999: "คอร์สไพรเวท 2 เดือน", 39999: "คอร์สไพรเวท 6 เดือน", 79999: "คอร์สไพรเวท 12 เดือน" };
const SHEET_RESULT = {
  issued: "ผ่าน · ออกรหัส VIP อัตโนมัติ",
  private_paid: "ผ่าน · ไพรเวท รอนัดเรียน",
  duplicate: "สลิปซ้ำ",
  wrong_receiver: "ผู้รับไม่ตรง",
  amount_mismatch: "ยอดไม่ตรงราคาคอร์ส",
};

async function toSheet(env, e, d) {
  if (!env.SHEET_URL || !env.SHEET_SECRET) return;
  const rc = d.receiver || {};
  await fetch(env.SHEET_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    redirect: "follow",
    body: JSON.stringify({
      secret: env.SHEET_SECRET,
      at: e.at,
      name: e.name || "",
      course: SHEET_COURSE[e.amount] || "",
      amount: e.amount || "",
      paidAt: d.date || "",
      transRef: e.transRef || "",
      recvName: rc.account?.name?.th || rc.account?.name?.en || "",
      recvAcct: rc.account?.bank?.account || "",
      result: SHEET_RESULT[e.result] || e.result,
      code: e.code || "",
      note: e.code ? "บอทส่งรหัส VIP + ลิงก์ห้องเรียน + OpenChat ให้แล้ว" : "",
    }),
  });
}

async function validSignature(body, sig, secret) {
  if (!sig) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  if (expected.length !== sig.length) return false;
  let r = 0; for (let i = 0; i < expected.length; i++) r |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return r === 0;
}

function toBase64(buf) {
  const bytes = new Uint8Array(buf); let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
