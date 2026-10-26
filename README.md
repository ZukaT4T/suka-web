# เว็บคอร์ส "สุขาสอนเทรด" — วิธีขึ้นเว็บและขั้นถัดไป

โฟลเดอร์นี้คือเว็บทั้งหมด ไม่ต้องติดตั้งอะไร เปิดไฟล์ `index.html` ในเบราว์เซอร์ก็ดูได้เลย

```
suka-web/
├─ index.html        หน้าขายคอร์ส (ราคา 1,490 ตลอดชีพ ปุ่มสมัครไป LINE @zuka)
├─ learn/index.html  ห้องเรียน (กรอกรหัส VIP → รายการ 48 บท → เครื่องเล่น → ติ๊กเรียนแล้ว)
├─ lessons.js        ข้อมูลคอร์สทั้งหมด แก้ไฟล์นี้ไฟล์เดียว
└─ README.md         ไฟล์นี้
```

## ทดลองดูตอนนี้
- หน้าขาย: เปิด `index.html`
- ห้องเรียน: เปิด `learn/index.html` ใส่ชื่ออะไรก็ได้ รหัส `SUKA-DEMO`

## ขั้น 1 · เอาขึ้นอินเทอร์เน็ตฟรี (Cloudflare Pages) ~15 นาที
1. สมัคร https://github.com (ฟรี) → New repository ชื่อ `suka-web` → Upload files → ลากทั้งโฟลเดอร์นี้ลงไป → Commit
2. สมัคร https://dash.cloudflare.com (ฟรี) → Workers & Pages → Create → Pages → Connect to Git → เลือก repo `suka-web`
   - Framework preset: None · Build command: ว่าง · Output directory: `/`
3. กด Deploy ได้ลิงก์ `https://suka-web.pages.dev` ใช้ได้ทันที
4. ต่อไปแก้อะไรก็อัปโหลดไฟล์ใหม่บน GitHub เว็บอัปเดตเองใน 1 นาที

## ขั้น 2 · ซื้อโดเมน (รายปี)
- .com ราว 400–600 บาท/ปี ซื้อที่ Cloudflare Registrar (ถูกสุด ไม่บวกกำไร) หรือ Namecheap
- ใน Cloudflare Pages → Custom domains → Add → ใส่โดเมน ระบบตั้ง DNS ให้เอง HTTPS ฟรี
- แนะนำดูชื่อ: sukatrade.com / zukatrader.com / coachsuka.com

## ขั้น 3 · ใส่คลิป
1. สมัคร Bunny.net → Stream → สร้าง Video Library ชื่อ `suka-course`
   - Security → Allowed referrers: ใส่โดเมนของเรา (คลิปจะเล่นได้เฉพาะบนเว็บเรา)
   - เปิด Token authentication เมื่อต่อ login ของจริง (ลิงก์หมดอายุเอง)
2. อัปโหลดคลิปทีละ EP → กด Embed → คัดลอกลิงก์ใน `src="..."`
3. เปิด `lessons.js` วางลิงก์ในช่อง `video: ""` ของ EP นั้น → อัปโหลดไฟล์ขึ้น GitHub
   (ใช้ YouTube unlisted หรือ Vimeo ได้เหมือนกัน วางลิงก์ embed ลงช่องเดียวกัน)

## ขั้น 4 · LINE Login + รหัส VIP ของจริง
ตอนนี้ห้องเรียนตรวจรหัสจากรายการ `demoCodes` ใน `lessons.js` (ใช้ทดสอบเท่านั้น ห้ามใส่รหัสจริงที่นี่ เพราะใครก็เปิดอ่านได้)
ของจริงทำแบบนี้ ผมทำให้ได้ทั้งหมดเมื่อสุขาเปิดบัญชีให้:
1. LINE Developers → สร้าง Provider → Channel แบบ "LINE Login" → ได้ Channel ID / Secret
2. Supabase (ฟรี) → ตาราง `students` (line_user_id, name, course, vip_code, activated_at) และ `vip_codes` (code, used)
3. Cloudflare Pages Functions (ไฟล์ `functions/api/auth.js`) รับ callback จาก LINE → ตรวจ code → ออก session
4. Google Sheet "ออเดอร์และตรวจสลิป โค้ชสุขา" ใส่สูตรสร้างรหัส VIP และ Apps Script ส่งรหัสเข้า Supabase อัตโนมัติ

## ขั้น 5 · กลุ่มถาม-ตอบ
- สร้าง LINE OpenChat → ตั้ง "ต้องอนุมัติก่อนเข้า" → คำถามตอนขอเข้า: "รหัส VIP ของคุณ"
- วางลิงก์ OpenChat ในช่อง `openchat: ""` ของ `lessons.js` ปุ่ม "ถามในกลุ่ม LINE" จะชี้ไปที่นั่น

## ค่าใช้จ่ายรวม
โดเมน ~500 บาท/ปี · Cloudflare Pages ฟรี · Supabase ฟรี · LINE Login ฟรี · Bunny Stream จ่ายตามคนดู (ช่วงแรก ~100–300 บาท/เดือน)
