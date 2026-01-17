# Netstat Map BE

Starter boilerplate untuk Express.js dengan dotenv.

## Instalasi

1. Jalankan `npm install` untuk menginstall dependencies.

## Menjalankan

- `npm start` untuk menjalankan server.
- `npm run dev` untuk development dengan nodemon.

Server akan berjalan di port yang ditentukan di .env (default 3000).

## Endpoint

- GET / : Mengembalikan "Hello World"
- GET /health : Health check dengan status dan last fetch
  - Response: JSON { status: "ok", last_fetch: "...", source: "cloudflare_radar" }
- POST /validate-token : Validasi token Cloudflare Radar API
  - Header: Authorization: Bearer your_token_here
  - Response: JSON dari Cloudflare API
- GET /aggregate-data : Agregasi data outages dari Cloudflare Radar API, menampilkan status semua negara (NORMAL jika tidak ada outage). Response di-cache selama 10 menit.
  - Header: Authorization: Bearer your_token_here
  - Response: JSON dengan struktur { generated_at: "...", countries: { "CODE": { status: "NORMAL" | { status, severity, scope, cause, since, source } } } }

## Troubleshooting

- Pastikan Node.js terinstall.
- Jika port sudah digunakan, ubah PORT di .env.
- Untuk validasi token, pastikan access_token valid dan account ID benar di .env.