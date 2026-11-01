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
  3333: { key: "live", name: "คอร์สสด 1 เดือน" }, // คอร์สพิเศษประจำเดือน (ชื่อเดือนคำนวณตอนรับสลิป)
  // 79,999 (Private 12 เดือน) ปิดการขายแล้ว 27 ต.ค. 2569 — ถ้ามีคนโอนยอดนี้ บอทจะให้แอดมินตรวจเอง
};
// บัญชีรับเงิน: กสิกรไทย (004) ปุญภัช ภูธาราพงษ์ 746-2-43028-5
const RECEIVER = { bankId: "004", nameTh: "ปุญภัช", nameEn: "PUNYAPHAT", acctDigits: "3028" };
const LEARN_URL = "https://www.zuka-t4tacademy.com/learn/";
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

// ลูกค้าพิมพ์ "สมัคร" / "สนใจ" หรือกดปุ่ม "รายละเอียดคอร์ส" ในริชเมนู = ส่งการ์ดคอร์สรูปเต็ม (Flex) + ลิงก์เว็บ
const COURSE_WORDS = ["สมัคร", "สนใจ", "ขอรายละเอียด", "ดูคอร์ส", "รายละเอียดคอร์ส", "สมัครเรียน", "ดูคอร์สทั้งหมด"];
const SITE = "https://www.สุขาสอนเทรด.com";
const IMG_BASE = "https://www.zuka-t4tacademy.com"; // รูปใน Flex ต้องเป็นโดเมนอังกฤษ
const PAY_SITE = "https://www.zuka-t4tacademy.com"; // ลิงก์จ่ายเงินใช้โดเมนอังกฤษ แชร์ต่อแล้วไม่เพี้ยน
// แตะการ์ด = ส่งข้อความนี้เข้าแชท แล้วบอทตอบลิงก์เว็บของคอร์สนั้น
// คอร์สพิเศษประจำเดือน (คอร์สสด 1 เดือน 3,333) — เปิดทุกเดือนอัตโนมัติ
// 10 วันสุดท้ายของเดือน การ์ด/รูป/ข้อความ จะเปลี่ยนเป็นเดือนถัดไปเอง (วันที่ 1 – วันสุดท้ายของเดือนนั้น)
// รูปแต่ละเดือนอยู่ที่ assets/live/flex-live-YYYY-MM.jpg (ทำไว้ถึง ธ.ค. 2571)
const TH_MON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const LIVE_LAST_IMG = "2028-12";
export function liveMonth(now = Date.now()) {
  const t = new Date(now + 7 * 3600 * 1000); // เวลาไทย
  let y = t.getUTCFullYear(), m = t.getUTCMonth() + 1;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (t.getUTCDate() > last - 10) { m += 1; if (m === 13) { m = 1; y += 1; } } // 10 วันสุดท้าย -> เดือนถัดไป
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const key = `${y}-${String(m).padStart(2, "0")}`;
  const mon = TH_MON[m - 1];
  return { key, imgKey: key <= LIVE_LAST_IMG ? key : LIVE_LAST_IMG, mon, days, beYear: y + 543, range: `1–${days} ${mon}` };
}
const LIVE_TEXT = "สนใจคอร์สสด 1 เดือน (3,333 บาท) ค่ะ";
function liveCard() {
  const lm = liveMonth();
  return { text: LIVE_TEXT, label: "คอร์สสด 1 เดือน", imgUrl: IMG_BASE + "/assets/live/flex-live-" + lm.imgKey + ".jpg",
    reply: `คอร์สสด 1 เดือน กับโค้ชสุขา 3,333 บาท 🎯\n\n• สอนสดทาง Google Meet\n• วันที่เรียน ${lm.range}\n• ดูแลและฝึกไปด้วยกัน 1 เดือน\n• ฝึกวิเคราะห์ วางแผน และทำตามแผน จนการเทรดมีระบบ ไม่ใช่เข้าตามอารมณ์\n\nดูรายละเอียดและสมัครได้ที่นี่ค่ะ 👉\n` + PAY_SITE + "/?buy=live#live\n\nโอนแล้วส่งรูปสลิปในแชตนี้ แอดมินจะส่งลิงก์ Google Meet และรายละเอียดการเรียนให้ค่ะ มีคำถามพิมพ์ถามได้เลยนะคะ 🙏" };
}
const PICK = {
  online: { text: "สนใจคอร์สออนไลน์ 1,490 บาท ค่ะ", img: "flex-online.jpg", label: "คอร์สออนไลน์",
    reply: "คอร์สออนไลน์ GOLD TRADING FOUNDATION 1,490 บาท 🎯\n\nสมัครและดูวิธีชำระเงินได้ที่นี่ค่ะ 👉\n" + PAY_SITE + "/?buy=online#pay\n\nโอนแล้วส่งรูปสลิปในแชตนี้ได้เลย ระบบจะส่งรหัส VIP + ลิงก์ห้องเรียนให้ทันทีค่ะ 🙏" },
  pv2: { text: "สนใจ Private Coaching 2 เดือน (19,999 บาท) ค่ะ", img: "flex-pv2.jpg", label: "Private 2 เดือน",
    reply: "Private Coaching 1:1 · 2 เดือน 19,999 บาท\n\nดูรายละเอียดและสมัครได้ที่นี่ค่ะ 👉\n" + PAY_SITE + "/?buy=pv2#private\n\nโอนแล้วส่งรูปสลิปในแชตนี้ แอดมินจะนัดวันเริ่มเรียนกับโค้ชสุขาให้ค่ะ มีคำถามพิมพ์ถามได้เลยนะคะ 🙏" },
  pv6: { text: "สนใจ Private Coaching 6 เดือน (39,999 บาท) ค่ะ", img: "flex-pv6.jpg", label: "Private 6 เดือน",
    reply: "Private Coaching 1:1 · 6 เดือน 39,999 บาท (BEST VALUE)\n\nดูรายละเอียดและสมัครได้ที่นี่ค่ะ 👉\n" + PAY_SITE + "/?buy=pv6#private\n\nโอนแล้วส่งรูปสลิปในแชตนี้ แอดมินจะนัดวันเริ่มเรียนกับโค้ชสุขาให้ค่ะ มีคำถามพิมพ์ถามได้เลยนะคะ 🙏" },
};
const norm = (x) => String(x || "").replace(/\s+/g, "").toLowerCase();
const PICK_BY_TEXT = Object.fromEntries(Object.values(PICK).map((p) => [norm(p.text), p]));
const cards = () => [liveCard(), ...Object.values(PICK)];

function courseFlex() {
  return {
    type: "flex",
    altText: "คอร์สสด 1 เดือน 3,333 · คอร์สสุขาสอนเทรด: ออนไลน์ 1,490 · Private 2 เดือน 19,999 · Private 6 เดือน 39,999 บาท",
    contents: {
      type: "carousel",
      contents: cards().map((p) => ({
        type: "bubble",
        size: "giga",
        hero: { type: "image", url: p.imgUrl || IMG_BASE + "/assets/cards/" + p.img, size: "full", aspectRatio: "2:3", aspectMode: "cover",
          action: { type: "message", label: p.label, text: p.text } },
      })),
    },
  };
}

async function replyMessages(replyToken, env, messages) {
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.LINE_CHANNEL_TOKEN}` },
    body: JSON.stringify({ replyToken, messages }),
  });
}

async function sendCourseCards(ev, env) {
  await replyMessages(ev.replyToken, env, [courseFlex(), { type: "text", text: "👉 ดูรายละเอียดคอร์สทั้งหมดที่เว็บไซต์ได้เลยค่ะ\n" + SITE }]);
}

// ข้อความทักทายเพื่อนใหม่ (ส่งโดยบอท เพื่อใช้การ์ดรูปเต็มได้)
const GREET_PAIN = `เรียนเทรดมาตั้งเยอะ... แต่ทำไมพอเจอกราฟจริง กลับไม่รู้ว่าจะต้องทำอะไร?

❌ เปิดกราฟมาแล้วไม่รู้จะวิเคราะห์ยังไง
❌ เรียนมาหลายระบบ แต่ยังจับต้นชนปลายไม่ถูก
❌ เห็นกราฟวิ่งแรงก็กลัวตกรถ รีบเข้าออเดอร์
❌ พอขาดทุนก็อยากเอาคืน จนหลุดแผน
❌ รู้ทฤษฎีเยอะ แต่เอามาใช้กับหน้างานจริงไม่ได้

ถ้าพี่ ๆ กำลังเจอปัญหาเหล่านี้ สุขาอยากชวนมาฝึกด้วยกันค่ะ ❤️

เพราะสุขาเชื่อว่า...

การเป็นเทรดเดอร์ที่ดี ไม่ใช่การทายว่ากราฟจะขึ้นหรือลงให้ถูกทุกครั้ง แต่คือการรู้ว่าตัวเองกำลังทำอะไร และมีแผนรองรับทุกการตัดสินใจ`;
const GREET_HOW = `สมัครง่ายๆ 3 ขั้นตอนค่ะ
1️⃣ เลือกคอร์สจากการ์ดด้านบน แล้วโอนตามราคา
ธ.กสิกรไทย 746-2-43028-5
ชื่อ ปุญภัช ภูธาราพงษ์
(สแกน QR ได้ที่หน้าเว็บ)
2️⃣ ส่งรูปสลิปในแชตนี้
3️⃣ คอร์สออนไลน์: ระบบส่ง "รหัส VIP" + ลิงก์ห้องเรียน + ลิงก์กลุ่ม OpenChat ให้ทันที ✨
   Private: แอดมินนัดวันเริ่มเรียนกับโค้ชสุขาในแชตนี้

ดูรายละเอียดทั้งหมด 👉 ${SITE}`;

async function sendGreeting(ev, env) {
  const name = await displayName(ev.source?.userId || "", env);
  const hello = `สวัสดีค่ะ${name ? " คุณ" + name : ""} 🙏\nขอบคุณที่แอดไลน์ สุขาสอนเทรด นะคะ\nสุขาสอนเทรดทองคำ (XAUUSD) แบบเป็นระบบ ตั้งแต่อ่านกราฟ วางแผน ไปจนถึงคุมความเสี่ยงค่ะ`;
  await replyMessages(ev.replyToken, env, [{ type: "text", text: hello }, { type: "text", text: GREET_PAIN }, courseFlex(), { type: "text", text: GREET_HOW }]);
}

async function handleEvent(ev, env) {
  if (ev.type === "follow" && ev.replyToken && env.GREETING_BY_BOT !== "off") return sendGreeting(ev, env);
  if (ev.type !== "message" || !ev.replyToken) return;
  const userId = ev.source?.userId || "";
  if (ev.message?.type === "text") {
    const t = norm(ev.message.text);
    if (RESEND_WORDS.includes(t)) return resendCode(ev, env, userId);
    if (COURSE_WORDS.includes(t)) return sendCourseCards(ev, env);
    const pick = PICK_BY_TEXT[t];
    if (t === norm(LIVE_TEXT)) return replyMessages(ev.replyToken, env, [{ type: "text", text: liveCard().reply }]);
    if (pick) return replyMessages(ev.replyToken, env, [{ type: "text", text: pick.reply }]);
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
  // ตรวจผู้รับ: ชื่อต้องเป็น ปุญภัช / PUNYAPHAT หรือเลขบัญชีลงท้าย 3028
  // โอนผ่านพร้อมเพย์ (สแกน QR) สลิปมักไม่โชว์ธนาคาร/เลขบัญชี -> ยอมรับถ้าชื่อผู้รับตรง
  const recvBank = String(rc.bank?.id || "");
  const recvAcctRaw = String(rc.account?.bank?.account || "");
  const nameOk = String(rc.account?.name?.th || "").includes(RECEIVER.nameTh) ||
    String(rc.account?.name?.en || "").toUpperCase().includes(RECEIVER.nameEn);
  const acctOk = recvAcctRaw.replace(/\D/g, "").includes(RECEIVER.acctDigits);
  const promptpay = !recvAcctRaw || !!rc.account?.proxy;
  const recvOk = (recvBank === RECEIVER.bankId && (nameOk || acctOk)) || (nameOk && (promptpay || !recvBank));

  // กันใช้สลิปซ้ำในระบบเราเองด้วย
  if (transRef && (await env.SUKA_KV.get("slip:" + transRef))) {
    await logSlip(env, { at: Date.now(), userId, name, result: "duplicate", amount, transRef }, d);
    return reply(ev.replyToken, env, "สลิปนี้เคยใช้รับรหัสไปแล้วค่ะ ถ้ามีปัญหาเข้าเรียน พิมพ์บอกแอดมินได้เลยนะคะ 🙏");
  }

  if (!recvOk) {
    await logSlip(env, { at: Date.now(), userId, name, result: "wrong_receiver", amount, transRef, detail: rc.account?.name?.th || rc.account?.name?.en || "" }, d);
    return reply(ev.replyToken, env, "ได้รับสลิปแล้วค่ะ แต่ชื่อบัญชีผู้รับไม่ตรงกับบัญชีของสุขาสอนเทรด แอดมินจะตรวจสอบและตอบกลับโดยเร็วนะคะ 🙏");
  }

  const pk = PACKAGES[amount] || null;
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

  if (pk.key === "live") {
    const lm = liveMonth();
    await logSlip(env, { at: Date.now(), userId, name, result: "live_paid", amount, transRef, pkg: `${pk.name} (${lm.range} ${lm.beYear})` }, d);
    return reply(ev.replyToken, env,
      `ได้รับสลิปเรียบร้อยค่ะ 🙏\n` +
      `รอแอดมินตรวจสอบยอดโอนสักครู่นะคะ`);
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
const SHEET_COURSE = { 1490: "คอร์สออนไลน์", 19999: "คอร์สไพรเวท 2 เดือน", 39999: "คอร์สไพรเวท 6 เดือน", 3333: "คอร์สสด 1 เดือน" };
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
      recvAcct: rc.account?.bank?.account || (rc.account?.proxy?.account ? "พร้อมเพย์ " + rc.account.proxy.account : (rc.account?.name ? "พร้อมเพย์" : "")),
      result: SHEET_RESULT[e.result] || e.result,
      code: e.code || "",
      note: e.code ? "บอทส่งรหัส VIP + ลิงก์ห้องเรียน + OpenChat ให้แล้ว"
        : e.result === "live_paid" ? `รอบ ${liveMonth(e.at || Date.now()).range} ${liveMonth(e.at || Date.now()).beYear} · รอแอดมินตรวจยอดและส่งลิงก์ Google Meet` : "",
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
