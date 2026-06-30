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
