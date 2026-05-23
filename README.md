# Heinz Portfolio App — PWA

A progressive web app for your retirement portfolio dashboard and bond ladder tracker. Works on iPhone (Safari → Add to Home Screen) and any desktop browser.

---

## Deploy in ~10 minutes

### Step 1 — GitHub

1. Go to [github.com](https://github.com) → sign in or create a free account
2. Click **New repository** → name it `retirement-app` → **Create repository**
3. On your Windows PC, install [Git for Windows](https://git-scm.com/download/win) if you don't have it
4. Open a terminal (PowerShell or Command Prompt) and run:

```bash
cd path\to\this\folder
git init
git add .
git commit -m "Initial deploy"
git remote add origin https://github.com/YOUR_USERNAME/retirement-app.git
git push -u origin main
```

### Step 2 — Vercel

1. Go to [vercel.com](https://vercel.com) → **Sign up with GitHub** (free)
2. Click **Add New Project** → select your `retirement-app` repository
3. Leave all settings as default → click **Deploy**
4. In ~60 seconds you'll get a URL like `https://retirement-app-xyz.vercel.app`

That's it — it auto-deploys every time you push to GitHub.

### Step 3 — iPhone

1. Open the Vercel URL in **Safari** on your iPhone
2. Tap the **Share** button (box with arrow) at the bottom
3. Scroll down → tap **Add to Home Screen**
4. Name it `Portfolio` → tap **Add**

It will appear on your home screen like a native app, with no browser chrome.

### Step 4 — Windows PC

Just open the Vercel URL in Chrome or Edge. Optionally, Chrome will offer to "Install" it as a desktop app too.

---

## Updating prices

Data is stored locally per device in `localStorage`. To update prices:

1. Tell Claude the latest quotes (or paste a screenshot)
2. Claude updates `LATEST_PRICES` in `src/PortfolioDashboard.jsx`
3. Push to GitHub: `git add . && git commit -m "Update prices May 2026" && git push`
4. Vercel auto-deploys in ~30 seconds
5. Reload the app on any device

---

## Project structure

```
retirement-app/
├── src/
│   ├── main.jsx              # Entry point
│   ├── App.jsx               # Bottom tab navigation
│   ├── index.css             # Global styles + CSS variables
│   ├── storage.js            # localStorage adapter
│   ├── PortfolioDashboard.jsx
│   └── BondLadderTracker.jsx
├── public/
│   ├── icon-192.png          # App icon (replace with your own)
│   └── icon-512.png          # App icon large
├── index.html
├── vite.config.js            # Vite + PWA config
└── package.json
```

---

## Local development

```bash
npm install
npm run dev
```
Opens at `http://localhost:5173`
