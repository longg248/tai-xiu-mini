# 🎲 TÀI XỈU MINI

Game Tài Xỉu casino 2D dạng **server–client**: một Node.js server roll kết quả mỗi ván, nhiều người chơi cược chung qua **SSE + REST**, giao diện lobby theo mẫu sòng game.

- **Client**: `tai_xiu.html` — 1 file duy nhất (HTML + CSS + JS inline), sân khấu 1600×900 tự scale.
- **Server**: `server.js` — Node.js thuần, **không cần package nào**.
- **Provably Fair**: công bố `SHA-256(serverSeed)` trước ván, mở seed sau ván; xúc xắc = `HMAC-SHA256(serverSeed, "round:<id>")`.

---

## 1. Chạy local

```bash
node server.js          # 60s/ván: mở cược 50s → chốt 5s → kết quả 5s
node server.js --fast   # 15s/ván: mở cược 10s → chốt 2s → kết quả 3s (để test)
```

Mở http://localhost:8099 (hoặc `127.0.0.1:8099` để tránh cache).

Hoặc dùng npm:

```bash
npm start
npm run dev     # = --fast
```

### Cấu hình bằng biến môi trường

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | `8099` | Cổng HTTP (Render/Railway/Fly tự tiêm) |
| `DATA_DIR` | thư mục chứa `server.js` | Nơi ghi `tx_data.json` — trỏ vào volume persistent khi deploy |

---

## 2. Đưa code lên GitHub

### 2.1. Tạo repo trống trên GitHub

Vào https://github.com/new → đặt tên (ví dụ `tai-xiu-mini`) → **Public** hoặc **Private** → **KHÔNG** tick "Add a README" → Create repository.

### 2.2. Push code

```bash
cd C:\Agents\Workflow

git add -A
git commit -m "Tai Xiu Mini: server + client, provably fair"

git branch -M main
git remote add origin https://github.com/<TEN-BAN>/tai-xiu-mini.git
git push -u origin main
```

> Lần push đầu, Git sẽ hỏi đăng nhập. Dùng **Personal Access Token** (Settings → Developer settings → Personal access tokens → Fine-grained tokens, quyền `Contents: Read and write`) thay cho mật khẩu. Hoặc cài GitHub CLI rồi `gh auth login`.

> `tx_data.json` đã nằm trong `.gitignore` — **không** đẩy dữ liệu người chơi (hash mật khẩu, token phiên) lên repo.

---

## 3. Deploy lên Render (miễn phí, dễ nhất)

Render chạy được Node + SSE, phù hợp demo.

### Cách A — Blueprint (tự đọc `render.yaml`)

1. Push code lên GitHub (mục 2).
2. Vào https://dashboard.render.com/blueprints → **New Blueprint Instance**.
3. Chọn repo `tai-xiu-mini` → **Apply**.
4. Đợi build xong, mở URL dạng `https://tai-xiu-mini-xxxx.onrender.com`.

### Cách B — Tạo Web Service thủ công

1. https://dashboard.render.com → **New** → **Web Service**.
2. Connect repo GitHub.
3. Điền:
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Health Check Path**: `/api/state`
   - **Instance Type**: Free
4. **Create Web Service**.

### Lưu ý quan trọng trên Render Free

| Vấn đề | Chi tiết |
|---|---|
| **Ngủ sau 15 phút** | Free tier spin down khi không có request; request đầu tiên đánh thức mất ~30–60s. |
| **Ổ đĩa tạm** | `tx_data.json` **mất mỗi lần deploy/restart**. Muốn giữ dữ liệu: nâng cấp gói có **Persistent Disk**, mount tại `/var/data`, rồi đặt env `DATA_DIR=/var/data`. |
| **Chỉ 1 instance** | Trạng thái ván nằm trong RAM. **Không** bật scale > 1 (mỗi instance sẽ roll kết quả riêng). |
| **SSE** | Render proxy hỗ trợ SSE; client đã có polling 5s dự phòng nếu SSE đứt. |

---

## 4. Deploy lên VPS (ổn định, giữ dữ liệu)

Phù hợp chạy thật lâu dài. Ví dụ VPS Ubuntu 22.04 (Vultr / DigitalOcean / Hetzner ~4–6 USD/tháng).

### 4.1. Cài Node + PM2

```bash
# trên VPS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs nginx
sudo npm i -g pm2
```

### 4.2. Lấy code

```bash
sudo mkdir -p /opt/tai-xiu && sudo chown $USER:$USER /opt/tai-xiu
git clone https://github.com/<TEN-BAN>/tai-xiu-mini.git /opt/tai-xiu
cd /opt/tai-xiu
```

### 4.3. Chạy bằng PM2

```bash
cd /opt/tai-xiu
PORT=8099 DATA_DIR=/opt/tai-xiu pm2 start server.js --name tai-xiu
pm2 save
pm2 startup            # chạy lệnh mà PM2 in ra để tự khởi động cùng máy
```

Kiểm tra: `pm2 logs tai-xiu`, `pm2 status`.

### 4.4. Nginx reverse proxy (bắt buộc tắt buffer cho SSE)

`/etc/nginx/sites-available/tai-xiu`:

```nginx
server {
    listen 80;
    server_name game.example.com;

    location / {
        proxy_pass http://127.0.0.1:8099;
        proxy_http_version 1.1;

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection        "";

        # SSE: không đệm, không cắt kết nối
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 24h;
        chunked_transfer_encoding on;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/tai-xiu /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 4.5. HTTPS miễn phí

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d game.example.com
```

Certbot tự gia hạn mỗi 90 ngày.

### 4.6. Cập nhật phiên bản mới

```bash
cd /opt/tai-xiu && git pull
pm2 restart tai-xiu
```

---

## 5. Nơi KHÔNG nên deploy

| Nền tảng | Lý do |
|---|---|
| **GitHub Pages** | Chỉ host file tĩnh — `server.js` không chạy được. Chỉ dùng được nếu bạn tách client và trỏ API sang host khác. |
| **Vercel / Netlify Functions** | Serverless: không giữ được `setInterval` roll ván, SSE bị cắt, state trong RAM mất giữa các request. |
| **Cloudflare Workers** | Không có `net`/`crypto` Node đầy đủ, không chạy `server.js` nguyên bản. |

Nếu chỉ muốn **xem giao diện** mà không cần server: có thể đẩy `tai_xiu.html` lên GitHub Pages (game sẽ chạy offline với kết quả local).

---

## 6. API

| Method | Endpoint | Mô tả |
|---|---|---|
| `GET` | `/` | Trả `tai_xiu.html` |
| `GET` | `/api/state?token=…` | Snapshot ván hiện tại + số dư + lịch sử + BXH |
| `GET` | `/api/stream?token=…` | SSE: tick 1s, kết quả ván |
| `POST` | `/api/register` | `{email, password, name}` |
| `POST` | `/api/login` | `{email, password}` |
| `POST` | `/api/guest` | Tạo tài khoản khách |
| `POST` | `/api/bet` | `{token, side:'tai'|'xiu', amount}` |
| `POST` | `/api/cancel` | Huỷ cược trong thời gian mở cược |
| `POST` | `/api/refill` | Nạp lại tiền demo |
| `POST` | `/api/reward` | Cộng/trừ số dư (vòng quay, VIP, KM) |

---

## 7. Kiểm chứng Provably Fair

1. Trước ván, server công bố `serverSeedHash = SHA-256(serverSeed)`.
2. Khi chốt: `hmac = HMAC-SHA256(serverSeed, "round:<roundId>")`.
3. Xúc xắc lấy từ 4 byte đầu của `hmac` bằng rejection sampling (không lệch xác suất).
4. Sau ván, server mở `serverSeed` → bấm **🔒 FAIR → KIỂM CHỨNG VÁN GẦN NHẤT**.

> ⚠️ Server dùng **chuỗi hex của seed làm key HMAC trực tiếp** (giống `crypto.createHmac('sha256', seedString)`), **không** decode hex. Client dùng `hmacSha256HexStr()` để khớp.

---

## 8. Cấu trúc

```
tai_xiu.html    # toàn bộ client (HTML+CSS+JS), ~190KB
server.js       # HTTP + SSE + game loop + auth + lưu trữ JSON
tx_data.json    # dữ liệu người chơi (tự sinh, đã gitignore)
package.json    # start script cho PaaS
render.yaml     # blueprint deploy Render
```

---

## 9. Lưu ý pháp lý

Đây là **demo kỹ thuật**, tiền trong game là tiền ảo, không có nạp/rút thật. Cờ bạc bằng tiền thật bị pháp luật nhiều nước (trong đó có Việt Nam) nghiêm cấm — chỉ dùng cho mục đích học tập.
