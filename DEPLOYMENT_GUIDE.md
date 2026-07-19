# 🚀 Deployment Guide — Quick Start

## What Was Fixed

✅ **Real-time listener bug** — Receipts now sync instantly between PC and phone  
✅ **Database rules** — Switched from Firestore to proper Realtime Database rules  
✅ **Browser cache** — Added cache-busting to prevent stale code  

---

## Deploy Now (3 Steps)

### 1️⃣ Deploy to Firebase
```bash
cd /Users/ettoretitotto/Desktop/PROGRAMMI/Fiscal
firebase deploy
```

**What this does:**
- Uploads updated `index.html` and `cassa.html`
- Deploys new `database.rules.json` to your Realtime Database
- Updates Firebase Hosting

### 2️⃣ Clear Browser Cache

**On PC (cassa.html):**
```
Mac: Cmd + Shift + R
Windows: Ctrl + Shift + R
```

**On Phone (index.html):**
```
Android: Ctrl + Shift + R (or close browser completely)
iPhone: Settings → Safari → Clear History and Website Data
```

### 3️⃣ Test It

**PC (Cassa):**
```
https://fiscal-9a0c8.web.app/cassa.html?cassa=demo01
```

**Phone (Cliente):**
```
https://fiscal-9a0c8.web.app/?cassa=demo01
```

**Test Flow:**
1. Add items on PC
2. Click "Invia scontrino al cliente"
3. Receipt appears **instantly** on phone ✅

---

## If Something Goes Wrong

### Receipt not appearing?
- [ ] Both pages have same `?cassa=ID`
- [ ] Hard refresh both pages
- [ ] Check browser console (F12 → Console) for errors
- [ ] Check Firebase Console → Realtime Database to see if receipt was written

### Still seeing old code?
- [ ] Increment cache-buster in HTML files: `?v=1` → `?v=2`
- [ ] Hard refresh
- [ ] Clear browser cache completely

### Database rules error?
- [ ] Run `firebase deploy` again
- [ ] Check Firebase Console → Realtime Database → Rules tab

---

## Files Changed

| File | Status |
|------|--------|
| `index.html` | ✅ Fixed listener + cache-busting |
| `cassa.html` | ✅ Added cache-busting |
| `firebase.json` | ✅ Updated to use database rules |
| `database.rules.json` | ✅ NEW — Realtime DB rules |
| `FIXES_APPLIED.md` | 📖 Detailed explanation |

---

## Next Steps (Optional)

- **Auto-cleanup:** Add Firebase Cloud Functions to delete old receipts
- **Security:** Tighten database rules (currently allows all read/write)
- **Hardware:** Connect physical ESC/POS printers

---

**Ready to deploy! 🎉**
