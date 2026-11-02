// GET /api/d/EP01?t=<session token>  ดาวน์โหลดเอกสารประกอบการเรียนท้ายบท (เฉพาะนักเรียนที่ login อยู่)
import { sessionFromToken, EP_RE } from "../../_lib.js";

export async function onRequestGet({ request, env, params }) {
  const ep = String(params.ep || "");
  if (!EP_RE.test(ep) || !env.VIDEOS) return new Response("not found", { status: 404 });
  const t = new URL(request.url).searchParams.get("t") || "";
  if (!(await sessionFromToken(t, env))) return new Response("กรุณาเข้าสู่ระบบห้องเรียนก่อน", { status: 401, headers: { "content-type": "text/plain; charset=utf-8" } });
  const obj = await env.VIDEOS.get("doc/" + ep + ".pdf");
  if (!obj) return new Response("ยังไม่มีเอกสารของบทนี้", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  const name = ep + "_เอกสารประกอบการเรียน.pdf";
  return new Response(obj.body, { headers: {
    "content-type": "application/pdf",
    "content-disposition": `attachment; filename="${ep}.pdf"; filename*=UTF-8''${encodeURIComponent(name)}`,
    "cache-control": "private, max-age=3600",
    "x-content-type-options": "nosniff",
  } });
}
