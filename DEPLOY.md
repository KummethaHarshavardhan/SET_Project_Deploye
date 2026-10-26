# Smart Expense Tracker – Deployment Guide

Two parts: **backend** (Node/Express + Socket.io, deployed as a Web Service) and
**frontend** (Vite/React static site). Deploy the backend first, because the
frontend needs its URL at build time.

---

## 1. MongoDB Atlas (database)

1. Go to MongoDB Atlas → your cluster → **Network Access** → **Add IP Address** → `0.0.0.0/0`
   (allow from anywhere, needed for Render/Vercel's dynamic IPs).
2. **Database Access** → create or reset a user password. Use a new password.
3. **Connect** → *Drivers* → copy the `mongodb+srv://...` string and put your user/password in it.

## 2. Backend (Render example – works the same on Railway/Heroku)

1. Push the repo to GitHub.
2. Render → **New → Web Service** → select the repo.
3. Settings:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Runtime:** Node 20 or newer
4. **Environment variables:**

   | Key | Value |
   |---|---|
   | `MONGO_URL` | your Atlas `mongodb+srv://...` string (database name `smart_expense_tracker`) |
   | `JWT_SECRET` | a long random string (32+ chars). Generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
   | `EMAIL_USER` | your Gmail address (for password-reset OTP) |
   | `EMAIL_PASS` | a Gmail **App Password** (16 characters, not your normal password) |
   | `NODE_ENV` | `production` |

   `PORT` is set automatically by Render.
5. Deploy. When it's live, open `https://<your-backend>.onrender.com/`. You should see `API is running...`.
   The logs should show `Database Connected Successfully`.

> **Note on audio recordings:** uploaded audio is saved to the server's local disk
> (`backend/uploads/recordings`). Free hosts reset the disk on each deploy or restart,
> so recordings can disappear. For permanent storage, use a persistent disk (Render paid
> plan) or move uploads to cloud storage such as S3/Cloudinary.

## 3. Frontend (Vercel or Netlify)

The frontend reads its backend address from **`VITE_API_URL`** at build time.

**Vercel:**
1. Vercel → **New Project** → import the repo.
2. **Root Directory:** `frontend`
3. Framework preset: **Vite** (build `npm run build`, output `dist`).
4. **Environment Variables:** `VITE_API_URL` = `https://<your-backend>.onrender.com`
   (no trailing slash and no `/api`; the app adds `/api` itself).
5. Deploy. `frontend/vercel.json` already handles React Router page refreshes.

**Netlify:** same settings. `frontend/public/_redirects` already handles routing.

Afterwards, if you change `VITE_API_URL`, you must **redeploy** the frontend, because
Vite bakes it into the build.

## 4. Local development

```bash
# backend
cd backend
cp .env.example .env        # then fill in real values
npm install
npm start                   # http://localhost:5000

# frontend (new terminal)
cd frontend
cp .env.example .env        # or leave unset to use http://localhost:5000
npm install
npm run dev
```

## Checklist

- [ ] Atlas Network Access allows the host (`0.0.0.0/0`)
- [ ] Backend env vars set; `JWT_SECRET` is not the placeholder
- [ ] Backend root URL returns `API is running...`
- [ ] Frontend `VITE_API_URL` points to the backend origin, then redeployed
- [ ] Register → login works; Socket.io connects (no console errors about websocket)
- [ ] Old credentials that were in `.env.example` have been **rotated** (see SECURITY note)

## SECURITY note

The original `backend/.env.example` contained a real MongoDB password and a Gmail App
Password. Those values are also in this project's git history. **Change them**:
reset the Atlas database user password and revoke the Gmail App Password at
myaccount.google.com/apppasswords, then generate new ones. Never commit `.env` files.
