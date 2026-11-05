// คลิปและปกในห้องเรียน (เก็บใน Cloudflare R2 binding: VIDEOS)
// GET  /api/admin/media                       -> { media: { EP01: { video: bytes, cover: bytes, at } } }
// PUT  /api/admin/media?ep=EP01&kind=video     body = ไฟล์ mp4
// PUT  /api/admin/media?ep=EP01&kind=cover     body = ไฟล์ jpg/png
// PUT  /api/admin/media?ep=EP01&kind=doc       body = ไฟล์ pdf (เอกสารประกอบการเรียนท้ายบท)
import { json, bad, isUploader, EP_RE } from "../../_lib.js";

const KINDS = { video: { ext: "mp4", types: ["video/mp4"] }, cover: { ext: "jpg", types: ["image/jpeg", "image/png", "image/webp"] }, doc: { ext: "pdf", types: ["application/pdf"] } };

export async function onRequest({ request, env }) {
  if (!env.SUKA_KV) return bad("ระบบยังไม่พร้อม (KV)", 500);
  if (!env.VIDEOS) return bad("ยังไม่ได้เชื่อมที่เก็บคลิป (R2)", 500);
  if (!(await isUploader(request, env))) return bad("ไม่มีสิทธิ์", 401);
  const index = (await env.SUKA_KV.get("media", "json")) || {};
  if (request.method === "GET") {
    // ?sync=1 นับใหม่จากไฟล์ที่อยู่จริงใน R2 (แก้ตัวนับเพี้ยนเวลาอัปโหลดหลายไฟล์ติดกัน)
    if (new URL(request.url).searchParams.get("sync") === "1") {
      const fresh = {};
      for (const kind of Object.keys(KINDS)) {
        let cursor;
        do {
          const res = await env.VIDEOS.list({ prefix: kind + "/", cursor });
          for (const o of res.objects) {
            const m = /^[a-z]+\/((?:P2-)?EP\d{2})\./.exec(o.key);
            if (m) fresh[m[1]] = Object.assign({}, fresh[m[1]], { [kind]: o.size, at: o.uploaded ? new Date(o.uploaded).getTime() : Date.now() });
          }
          cursor = res.truncated ? res.cursor : undefined;
        } while (cursor);
      }
      await env.SUKA_KV.put("media", JSON.stringify(fresh));
      return json({ ok: true, media: fresh, synced: true });
    }
    return json({ ok: true, media: index });
  }
  if (request.method !== "PUT") return bad("method not allowed", 405);

  const url = new URL(request.url);
  const ep = url.searchParams.get("ep") || "";
  const kind = url.searchParams.get("kind") || "";
  if (!EP_RE.test(ep) || !KINDS[kind]) return bad("ep/kind ไม่ถูกต้อง");
  // ไฟล์ใหญ่เกิน 100MB: อัปเป็นชิ้น (R2 multipart) ?mp=create | ?mp=part&uid=..&n=1 | ?mp=complete&uid=.. body=[{partNumber,etag}]
  const mp = url.searchParams.get("mp");
  if (mp) {
    const key = kind + "/" + ep + "." + KINDS[kind].ext;
    if (mp === "create") {
      const ctype = url.searchParams.get("type") || KINDS[kind].types[0];
      const up = await env.VIDEOS.createMultipartUpload(key, { httpMetadata: { contentType: ctype } });
      return json({ ok: true, uid: up.uploadId, key });
    }
    const up = env.VIDEOS.resumeMultipartUpload(key, url.searchParams.get("uid") || "");
    if (mp === "part") {
      const n = parseInt(url.searchParams.get("n") || "0", 10);
      if (!(n >= 1 && n <= 10000)) return bad("part number ไม่ถูกต้อง");
      const part = await up.uploadPart(n, await request.arrayBuffer());
      return json({ ok: true, partNumber: part.partNumber, etag: part.etag });
    }
    if (mp === "complete") {
      let obj;
      try { const parts = await request.json(); obj = await up.complete(parts); }
      catch (e) { return bad("complete ไม่สำเร็จ: " + (e && e.message || e), 500); }
      index[ep] = Object.assign({}, index[ep], { [kind]: obj.size, at: Date.now() });
      await env.SUKA_KV.put("media", JSON.stringify(index));
      return json({ ok: true, ep, kind, bytes: obj.size });
    }
    if (mp === "abort") { await up.abort(); return json({ ok: true }); }
    return bad("mp ไม่ถูกต้อง");
  }
  const type = (request.headers.get("content-type") || "").split(";")[0].trim();
  if (!KINDS[kind].types.includes(type)) return bad("ชนิดไฟล์ไม่ถูกต้อง: " + type);
  const body = await request.arrayBuffer();
  if (!body.byteLength) return bad("ไฟล์ว่าง");

  await env.VIDEOS.put(kind + "/" + ep + "." + KINDS[kind].ext, body, { httpMetadata: { contentType: type } });
  index[ep] = Object.assign({}, index[ep], { [kind]: body.byteLength, at: Date.now() });
  await env.SUKA_KV.put("media", JSON.stringify(index));
  return json({ ok: true, ep, kind, bytes: body.byteLength });
}
