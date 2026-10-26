# Admin Panel

React + TypeScript + Vite admin panel สำหรับเชื่อมต่อ NestJS API

## ใช้งานในเครื่อง

ต้องใช้ Node.js 24 และ Yarn 1.x

```bash
cp .env.example .env.local
yarn install --frozen-lockfile
yarn dev
```

แก้ค่าใน `.env.local` ให้ชี้ไปยัง API และ LINE callback ที่ใช้จริง

## Production build

```bash
yarn lint
yarn build
```

ไฟล์พร้อม deploy จะอยู่ใน `dist/` รวมถึง `.htaccess` สำหรับ React Router บน Apache/Plesk

## CI/CD ไปยัง Plesk ด้วย GitHub Actions

Workflow `.github/workflows/deploy-plesk.yml` จะทำงานเมื่อ push เข้า branch `main`:

1. ติดตั้ง dependency ตาม `yarn.lock`
2. ตรวจ lint และ build (`lint` รายงานผลแต่ยังไม่ block deploy เพราะมี lint debt เดิม)
3. sync ไฟล์ใน `dist/` ไปยัง document root ของโดเมนบน Plesk

### 1. เตรียม Plesk

ใน Plesk เปิด **Websites & Domains → Hosting & DNS → Hosting Settings** แล้วตรวจว่า:

- Document root เป็น `httpdocs` หรือโฟลเดอร์ของ subdomain ที่ต้องการ
- เปิด Apache proxy/Apache support เพื่อให้ `.htaccess` ทำงาน
- ผู้ใช้ subscription มี SSH access

ลอง SSH เข้า server แล้วตรวจว่ามี `rsync`:

```bash
ssh USER@HOST 'command -v rsync'
```

หากไม่พบ ต้องให้ผู้ดูแล server ติดตั้ง `rsync` ก่อน

### 2. สร้าง SSH key สำหรับ deployment

สร้าง key แยกสำหรับ GitHub Actions:

```bash
ssh-keygen -t ed25519 -C "github-actions-plesk" -f ./plesk_deploy_key
```

- เพิ่มเนื้อหา `plesk_deploy_key.pub` ใน `~/.ssh/authorized_keys` ของผู้ใช้ Plesk
- เก็บ private key `plesk_deploy_key` เป็น GitHub secret `PLESK_SSH_KEY`
- หลังตั้งค่าเสร็จ ลบ key ทั้งสองไฟล์ออกจากเครื่องถ้าไม่ต้องใช้ต่อ และห้าม commit

สร้างค่า known hosts จากเครื่องที่เชื่อถือได้:

```bash
ssh-keyscan -p 22 YOUR_PLESK_HOST
```

นำผลลัพธ์ทั้งหมดไปเก็บเป็น secret `PLESK_KNOWN_HOSTS`

### 3. ตั้ง GitHub Environment secrets

เข้า repository ที่ GitHub → **Settings → Environments → New environment** ตั้งชื่อ `production`
แล้วเพิ่ม secrets:

| Secret | ตัวอย่าง | ความหมาย |
| --- | --- | --- |
| `PLESK_HOST` | `server.example.com` | Hostname/IP ของ Plesk |
| `PLESK_PORT` | `22` | SSH port; เว้นว่างได้ถ้าใช้ 22 |
| `PLESK_USER` | `example_user` | System user ของ subscription |
| `PLESK_TARGET_PATH` | `/var/www/vhosts/example.com/httpdocs` | Document root แบบ absolute path |
| `PLESK_SSH_KEY` | private key ทั้งก้อน | Key ที่ใช้ deploy |
| `PLESK_KNOWN_HOSTS` | ผลจาก `ssh-keyscan` | Host fingerprint |
| `VITE_API_URL` | `https://api.example.com` | URL ของ NestJS API |
| `VITE_LINE_CALLBACK_URL` | `https://admin.example.com/settings` | LINE callback URL |

ค่าที่ขึ้นต้นด้วย `VITE_` จะถูกฝังใน JavaScript ตอน build จึงไม่ใช่ที่เก็บความลับ

### 4. เปิดใช้งาน

โปรเจกต์ต้องอยู่ใน Git repository และมี remote บน GitHub จากนั้น push เข้า `main`:

```bash
git init
git add .
git commit -m "Configure Plesk CI/CD"
git branch -M main
git remote add origin git@github.com:OWNER/REPOSITORY.git
git push -u origin main
```

ติดตามผลได้ที่แท็บ **Actions** ใน GitHub หรือกด **Run workflow** เพื่อ deploy ด้วยตนเอง

> `rsync --delete` จะลบไฟล์ frontend เก่าภายใน `PLESK_TARGET_PATH` โดยยกเว้นไฟล์ระบบ `.php-ini`, `.php-version` และ `.well-known/` ให้ path นี้ชี้เฉพาะ document root ของ frontend เท่านั้น ห้ามชี้ไปยังโฟลเดอร์ที่มี backend หรือข้อมูลอื่นร่วมอยู่ด้วย

## สำรองและล้างประวัติเช็คชื่อเมื่อสิ้นเทอม

เมนู **ระบบ → สำรอง / ล้างประวัติเช็คชื่อ** (`/attendance-archives`) สำหรับผู้ดูแลระบบ:

1. เลือกทุกภาคเรียน หรือภาคเรียนที่ต้องการ แล้วส่งออก `.sql` ครบทุกสถานะ ทั้งเข้าแถวและเขตพื้นที่
2. เก็บไฟล์ไว้ในเครื่อง แล้วเลือกไฟล์นั้นกลับมาตรวจสอบก่อนล้าง
3. ล้างได้เฉพาะภาคเรียนที่พ้นวันสิ้นสุดตามเวลาไทยแล้ว และไม่ได้ตั้งเป็นภาคเรียนปัจจุบัน ต้องพิมพ์ `ล้างประวัติ` ยืนยัน

API ตรวจลายเซ็นไฟล์และตรวจว่าประวัติใน DB ยังตรงกับตอนส่งออกก่อนลบใน transaction หากมีการเพิ่ม แก้ไข หรือลบข้อมูลหลังส่งออก ต้องส่งออกไฟล์ใหม่ การล้างลบเฉพาะ `AttendanceRecord` โดยเก็บ `BehaviorRecord`, `StudentPointAccount` และข้อมูลนักเรียน/การลงทะเบียนไว้ จึงรักษาคะแนนและรายการหักคะแนนจากการเช็คชื่อไว้ครบ

หลังล้าง ระบบเก็บเครื่องหมายขนาดเล็กใน `SystemConfig` (`ATTENDANCE_TERM_STATE_<termId>`) เพื่อล็อกการบันทึกเช็คชื่อในเทอมนั้น ป้องกันการเช็คชื่อซ้ำและหักคะแนนซ้ำ ตัวล็อกใช้ร่วมกับการบันทึกและแก้ไขเช็คชื่อทั้งสามช่องทาง ไม่ควรลบเครื่องหมายนี้ด้วยตนเอง

เมนู **อ่านข้อมูลเช็คชื่อเก่า** (`/attendance-archive-reader`) เปิดไฟล์ `.sql` ที่สร้างจากเมนูนี้ในเบราว์เซอร์ ตรวจ SHA-256 และค้นหา/กรองตามนักเรียน ผู้บันทึก ห้อง ภาคเรียน วันที่ ประเภท และสถานะได้ โดยไม่อัปโหลดไฟล์หรือเพิ่มประวัติกลับเข้า DB รองรับไฟล์ไม่เกิน 200 MB และต้องเปิดระบบผ่าน HTTPS (หรือ localhost) เพื่อใช้ Web Crypto ไฟล์ SQL จากเครื่องมืออื่นยังไม่รองรับ

ชื่อบุคคลและชื่อห้องเป็นข้อมูล ณ วันที่ส่งออก ส่วนห้องของประวัติใช้ `classroomId` ณ วันบันทึก หากรายการเก่าไม่มีข้อมูลห้อง ระบบแสดงว่าไม่ระบุห้อง ไฟล์มี SQL สำหรับสร้างตาราง `DSPSAttendanceArchive_v1` แยกจากตารางใช้งานจริง หากต้องการนำ SQL เข้า MySQL/MariaDB เพื่อวิเคราะห์ ให้ใช้ฐานข้อมูลสำหรับประวัติแยกต่างหาก การดูย้อนหลังผ่านหน้าเว็บไม่ต้องนำเข้า SQL

หลังล้าง รายงานปกติที่อ่านจาก DB จะไม่มีรายการที่ล้างแล้ว ต้องเปิดไฟล์เพื่อดูย้อนหลัง พื้นที่ในตารางสามารถนำกลับมาใช้บันทึกใหม่ได้ แต่ขนาดไฟล์ DB บนดิสก์อาจไม่ลดทันที ไม่จำเป็นต้องทำ `OPTIMIZE TABLE` อัตโนมัติ

ต้อง deploy ทั้ง `admin-dspscare` และ `../behavior-service` รุ่นที่มี API ใหม่นี้พร้อมกัน ไม่ต้องเพิ่มตารางหรือรัน migration ใหม่ API ใช้ `JWT_SECRET` เดียวกับระบบล็อกอินเพื่อลงลายเซ็นใบรับรองการส่งออก หากเปลี่ยน secret ไฟล์เดิมยังเปิดย้อนหลังได้ แต่ต้องส่งออกใหม่เพื่อใช้ล้างข้อมูล

ตรวจสอบตัวอ่านไฟล์ด้วย `npm run test:attendance-archive` (Node.js 24)
