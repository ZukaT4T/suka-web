# เว็บคอร์ส "สุขาสอนเทรด" — วิธีขึ้นเว็บและขั้นถัดไป

โฟลเดอร์นี้คือเว็บทั้งหมด ไม่ต้องติดตั้งอะไร เปิดไฟล์ `index.html` ในเบราว์เซอร์ก็ดูได้เลย

```
suka-web/
├─ index.html        หน้าขายคอร์ส (ราคา 1,490 ตลอดชีพ ปุ่มสมัครไป LINE @zuka)
├─ learn/index.html  ห้องเรียน (กรอกรหัส VIP → รายการ 48 บท → เครื่องเล่น → ติ๊กเรียนแล้ว)
├─ lessons.js        ชื่อบท/คำอธิบาย 48 EP
├─ admin/index.html  หน้าแอดมิน (สร้างรหัส VIP, ใส่ลิงก์คลิป)
├─ functions/        API บน Cloudflare (รหัส VIP, ความคืบหน้า)
└─ README.md         ไฟล์นี้
```

## ทดลองดูตอนนี้
- หน้าขาย: เปิด `index.html`
- ห้องเรียน: ต้องเปิดจากเว็บจริง (API อยู่บน Cloudflare) ใช้รหัสจากหน้าแอดมิน

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
3. เปิดหน้าแอดมิน /admin/ วางลิงก์ในช่องของ EP นั้น → บันทึก (ไม่ต้องแก้ไฟล์)
   (ใช้ YouTube unlisted หรือ Vimeo ได้เหมือนกัน วางลิงก์ embed ลงช่องเดียวกัน)

## ขั้น 4 · ระบบรหัส VIP (ทำแล้ว ใช้ Cloudflare KV + Pages Functions ในโฟลเดอร์ functions/)
- หน้าแอดมิน: https://zuka-t4tacademy.com/admin/  ใส่กุญแจ ADMIN_KEY → สร้างรหัส VIP, ยกเลิกรหัส, ใส่ลิงก์คลิปแต่ละ EP
- นักเรียน: https://zuka-t4tacademy.com/learn/  กรอกชื่อ + รหัส → เข้าได้ทุกเครื่อง (ชื่อต้องตรงกับครั้งแรก สูงสุด 5 เครื่อง) ความคืบหน้าซิงก์ตามรหัส
- ลิงก์คลิปเก็บใน KV เห็นเฉพาะคน login (ไม่อยู่ใน lessons.js)
- ตั้งค่าใน Cloudflare Pages → suka-web → Settings: KV binding ชื่อ SUKA_KV และ Environment variable (secret) ADMIN_KEY
- เปลี่ยนกุญแจแอดมิน: แก้ ADMIN_KEY ใน Settings แล้ว Retry deployment

## ขั้น 5 · กลุ่มถาม-ตอบ
- สร้าง LINE OpenChat → ตั้ง "ต้องอนุมัติก่อนเข้า" → คำถามตอนขอเข้า: "รหัส VIP ของคุณ"
- วางลิงก์ OpenChat ในช่อง `openchat: ""` ของ `lessons.js` ปุ่ม "ถามในกลุ่ม LINE" จะชี้ไปที่นั่น

## ค่าใช้จ่ายรวม
โดเมน ~500 บาท/ปี · Cloudflare Pages ฟรี · Supabase ฟรี · LINE Login ฟรี · Bunny Stream จ่ายตามคนดู (ช่วงแรก ~100–300 บาท/เดือน)
