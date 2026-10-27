// ใครเข้าเว็บด้วยชื่อไทย (สุขาสอนเทรด.com) จะถูกพาไป www.zuka-t4tacademy.com อัตโนมัติ
// เพื่อให้เวลากดแชร์จากเบราว์เซอร์ได้ลิงก์ภาษาอังกฤษที่อ่านง่าย (ไม่เป็น xn--...)
const THAI_HOSTS = ["xn--22c0bih5cxbby7b6c3e.com", "www.xn--22c0bih5cxbby7b6c3e.com"];
const MAIN = "https://www.zuka-t4tacademy.com";

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const m = context.request.method;
  if (THAI_HOSTS.includes(url.hostname) && !url.pathname.startsWith("/api/") && (m === "GET" || m === "HEAD")) {
    return Response.redirect(MAIN + url.pathname + url.search + url.hash, 301);
  }
  return context.next();
}
