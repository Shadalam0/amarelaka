# AmarElaka — আমার এলাকা
### এলাকার সমস্যা রিপোর্টিং প্ল্যাটফর্ম (Local problem reporting platform)

Citizens report potholes, broken streetlights, garbage and waterlogging with a **photo and map location**, then follow the problem until it is fixed. Admins verify, update and merge reports from a dashboard.

| Feature | Where |
|---|---|
| ছবি ও লোকেশনসহ অভিযোগ (photo + GPS/map location) | `#new` page |
| অগ্রগতি ট্র্যাক (4-step progress + history + tracking code) | report details, `#track` page |
| একই সমস্যার রিপোর্ট একত্র (duplicate warning within 100 m + "I have this problem too" + admin merge) | report form, admin |
| ম্যাপে এলাকার সমস্যা (OpenStreetMap, colour = status, size = how many reported) | home page |
| অ্যাডমিন ড্যাশবোর্ড (stats, queue sorted by severity, status update with "after" photo, user roles) | `#admin` page |
| User & admin login (email + password, JWT) | `#login`, `#register` |

**Tech:** Node.js + Express · MongoDB (Mongoose) · plain HTML/CSS/JS · Leaflet + OpenStreetMap · Hind Siliguri font.
**Cost:** ৳0 — MongoDB Atlas free cluster + Render free web service.

---

## 1. Project structure

```
amarelaka/
├── backend/                 ← the server (API)
│   ├── server.js            ← starts Express, serves the API and the frontend
│   ├── package.json
│   ├── .env.example         ← copy to .env and fill in
│   ├── config/db.js         ← MongoDB connection
│   ├── models/              ← User, Report, Photo
│   ├── middleware/          ← login check (auth.js), photo upload (upload.js)
│   ├── routes/              ← auth, reports, photos, admin
│   ├── utils/helpers.js     ← tracking codes, report "weight", photo saving
│   └── scripts/createAdmin.js
├── frontend/                ← what the user sees in the browser
│   ├── index.html
│   ├── css/style.css
│   └── js/config.js         ← map centre, API address
│       js/api.js            ← talks to the backend, remembers login
│       js/app.js            ← all pages and features
├── render.yaml              ← one-click settings for Render
└── README.md
```

The backend also serves the frontend, so the whole site runs on **one address** (no CORS setup needed).

---

## 2. Install the tools (once)

1. **Node.js** (LTS version, 20 or newer): https://nodejs.org → download → install.
   Check in a terminal: `node -v`
2. **Git**: https://git-scm.com/downloads
3. **VS Code** (editor): https://code.visualstudio.com

---

## 3. Create the free database (MongoDB Atlas)

1. Go to https://www.mongodb.com/cloud/atlas/register and sign up (Google login works).
2. **Create a cluster** → choose **Free** → provider AWS → region **Mumbai (ap-south-1)** or Singapore (closest to Bangladesh) → Create.
3. **Database user**: Security → *Database Access* → *Add New Database User*
   - Username: `amarelaka_user`
   - Password: click *Autogenerate* and **copy it somewhere safe**
   - Role: *Read and write to any database* → Add User
4. **Network access**: Security → *Network Access* → *Add IP Address* → **Allow access from anywhere** (`0.0.0.0/0`) → Confirm.
   (Needed because Render's free servers don't have a fixed IP.)
5. **Connection string**: *Database* → *Connect* → *Drivers* → copy the string. It looks like:
   ```
   mongodb+srv://amarelaka_user:<db_password>@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority
   ```
   Replace `<db_password>` with your password, and add the database name `amarelaka` before the `?`:
   ```
   mongodb+srv://amarelaka_user:YOURPASS@cluster0.abcde.mongodb.net/amarelaka?retryWrites=true&w=majority
   ```
   If the password has symbols like `@ # /`, change it to letters and numbers only, or the link breaks.

---

## 4. Run it on your computer

```bash
cd amarelaka/backend
npm install
```

Create the settings file:

- Windows: `copy .env.example .env`
- Mac/Linux: `cp .env.example .env`

Open `backend/.env` in VS Code and fill in:

| Setting | What to put |
|---|---|
| `MONGODB_URI` | the connection string from step 3 |
| `JWT_SECRET` | a long random text. Generate one: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | your admin login |

Create the admin account, then start the server:

```bash
npm run create-admin
npm start
```

Open **http://localhost:5000** in your browser.
- Log in with the admin email/password → the **অ্যাডমিন** menu appears.
- Open a private/incognito window → **নতুন অ্যাকাউন্ট খুলুন** → you are a normal citizen user.

`npm run dev` restarts the server automatically when you edit backend files.

**Change the map location:** edit `frontend/js/config.js` → `MAP_CENTER: [latitude, longitude]`. (Find coordinates by right-clicking a place in Google Maps.)

---

## 5. Put the code on GitHub

1. On https://github.com create a new repository named `amarelaka` (Public or Private).
2. In the project folder:
   ```bash
   cd amarelaka
   git init
   git add .
   git commit -m "AmarElaka first version"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/amarelaka.git
   git push -u origin main
   ```
   The `.gitignore` file keeps `.env` (your passwords) and `node_modules` off GitHub. **Never upload `.env`.**

---

## 6. Put it online for free (Render)

1. Go to https://render.com → sign up **with GitHub**.
2. **New +** → **Web Service** → select your `amarelaka` repository.
3. Fill in:
   | Field | Value |
   |---|---|
   | Name | `amarelaka` (your site becomes `https://amarelaka.onrender.com`) |
   | Root Directory | `backend` |
   | Runtime | Node |
   | Build Command | `npm install` |
   | Start Command | `npm start` |
   | Instance Type | **Free** |
4. **Environment Variables** → add:
   - `MONGODB_URI` = your Atlas connection string
   - `JWT_SECRET` = your long random text
   - `NODE_VERSION` = `22`
5. Click **Deploy Web Service**. Wait until the log shows `AmarElaka running…`, then open your `.onrender.com` link.

The admin account you created in step 4 is already in the Atlas database, so it works online too.

(Alternative: **New + → Blueprint** uses `render.yaml` to fill most of this automatically; you still paste `MONGODB_URI`.)

**Updating the site later:** change the code → `git add . && git commit -m "update" && git push` → Render redeploys automatically.

---

## 7. Free plan limits — what to expect

- **Render free** stops the server after **15 minutes with no visitors**. The next visit takes **about 1 minute** to wake it up; after that it is fast. Fine for a university project/demo. Open the site a minute before you present it.
- Render's disk is wiped on every restart — that's why **photos are saved inside MongoDB**, not on disk.
- **MongoDB Atlas free** = **512 MB**. Photos are shrunk to about 100–400 KB in the browser before upload, so expect room for roughly **1,500–3,000 photos**. For more, move photos to Cloudinary (free 25 GB) later.
- Atlas may pause a free database that is unused for a long time. Log in to Atlas occasionally.

---

## 7b. Email verification codes (free, with Brevo)

New users get a 6-digit code by email after sign-up and must enter it before they can log in.
Set `LOGIN_OTP=true` to also email a code on **every** login.

Render's free plan **blocks SMTP ports** (25/465/587), so Gmail SMTP / Nodemailer does not work there.
AmarElaka sends mail through **Brevo's HTTPS API** instead — free, 300 emails/day.

1. Sign up at https://www.brevo.com (free, no card).
2. **Senders, Domains & Dedicated IPs → Senders → Add a sender**: add your Gmail address and click the confirmation link Brevo emails you.
3. **SMTP & API → API Keys → Generate a new API key** → copy it (starts with `xkeysib-`).
4. On Render → **Environment**, add:
   | Key | Value |
   |---|---|
   | `BREVO_API_KEY` | the key from step 3 |
   | `MAIL_FROM_EMAIL` | the sender email from step 2 |
   | `MAIL_FROM_NAME` | `AmarElaka` |
   | `LOGIN_OTP` | `false` (or `true` for a code on every login) |
5. Save → Render redeploys.

Locally, leave `BREVO_API_KEY` empty: the code is printed in the terminal instead of emailed.

Codes expire after 10 minutes, allow 5 wrong tries, can be re-sent once a minute, and are stored hashed.
Mail sent from a Gmail address through Brevo may land in **Spam** at first; with your own domain verified in Brevo it lands in the inbox.

---

## 7c. Videos up to 2 minutes (free, with Cloudinary)

Users can attach one video (up to **2 minutes / 100 MB**) to a report. Videos are too big for the free MongoDB (512 MB), so they go to **Cloudinary**:
the browser uploads straight to Cloudinary with a one-time signature from the backend, so videos never pass through Render.
The backend then asks Cloudinary for the video's real length and size before saving the report, and deletes the video when an admin deletes the report.

1. Sign up at https://cloudinary.com (free, no card).
2. Console → **Settings → API Keys** (or the Dashboard): copy **Cloud name**, **API Key**, **API Secret**.
3. On Render → **Environment**, add `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` → Save.

Without these three values the video option simply stays hidden.
Free plan: 25 credits a month shared by storage, bandwidth and video processing, and at most 100 MB per video. Watch usage in the Cloudinary dashboard.

---

## 8. Making more admins

Log in as admin → **অ্যাডমিন** → **ব্যবহারকারী** tab → change a user's role to **অ্যাডমিন**. (You cannot change your own role.)

Or set `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env` to that person's email and run `npm run create-admin` again.

---

## 9. API reference

| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | anyone | create user account |
| POST | `/api/auth/login` | anyone | log in → token |
| POST | `/api/auth/verify` | anyone | email + 6-digit code → token |
| POST | `/api/auth/resend` | anyone | send the code again (once a minute) |
| POST | `/api/auth/forgot` | anyone | email a password-reset code |
| POST | `/api/auth/reset` | anyone | email + code + new password → token |
| GET | `/api/auth/me` | logged in | current user |
| GET | `/api/reports` | anyone | map list (`?category=`, `?mine=1`) |
| GET | `/api/reports/nearby?lat&lng&category` | anyone | duplicate suggestions |
| GET | `/api/reports/:id` · `/api/reports/code/:code` | anyone | details + history |
| POST | `/api/reports` | user | new report (multipart, `photo`) |
| POST | `/api/reports/:id/support` | user | "আমারও একই সমস্যা" |
| GET | `/api/photos/:id` | anyone | photo |
| GET | `/api/reports/video-config` | anyone | is video upload on, limits |
| POST | `/api/reports/video-signature` | user | one-time signature to upload a video to Cloudinary |
| GET | `/api/admin/stats` | admin | dashboard numbers |
| GET | `/api/admin/reports` | admin | queue (`?status&category&sort`) |
| GET | `/api/admin/reports/:id/merge-candidates` | admin | same category within 2 km |
| PATCH | `/api/admin/reports/:id/status` | admin | `status`, `note`, `mergedInto`, `afterPhoto` |
| DELETE | `/api/admin/reports/:id` | admin | delete a fake report and its photos (reports merged into it become open again) |
| GET | `/api/admin/users` | admin | user list |
| PATCH | `/api/admin/users/:id/role` | admin | make admin / user |

Statuses: `new` (জমা হয়েছে) → `verified` (যাচাই হয়েছে) → `progress` (কাজ চলছে) → `resolved` (সমাধান হয়েছে), plus `rejected` (বাতিল, reason required) and `merged` (একত্রিত).

---

## 10. Troubleshooting

| Problem | Fix |
|---|---|
| `MONGODB_URI is missing` | You didn't create `backend/.env`, or you're not inside the `backend` folder. |
| `bad auth : authentication failed` | Wrong database password in the connection string (step 3.5). |
| `querySrv ENOTFOUND` / timeout | Check internet; in Atlas → Network Access make sure `0.0.0.0/0` is added. |
| Map is grey | No internet (map tiles come from OpenStreetMap), or zoomed far away — check `MAP_CENTER`. |
| "আমার বর্তমান লোকেশন" doesn't work | Browsers only allow GPS on `https://` or `localhost`. Render gives you https automatically. |
| Verification email never arrives | Check Spam; check `BREVO_API_KEY` and that `MAIL_FROM_EMAIL` is a confirmed Brevo sender; Render Logs show `Brevo email failed (…)` with the reason. |
| Site very slow at first | Render free server waking up (about 1 minute). |
| `EADDRINUSE` | Another program uses port 5000 — change `PORT` in `.env`. |
