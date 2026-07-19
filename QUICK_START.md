# 🚀 Quick Start - Scontrino Digitale con Raccolta Contatti

## ✅ Stato Attuale

- ✅ **Frontend**: Deployato su Firebase Hosting → https://fiscal-9a0c8.web.app
- ✅ **Database**: Firebase Realtime Database con regole di sicurezza aggiornate
- ✅ **Raccolta Contatti**: Instagram + Telefono implementato
- ⏳ **Backend**: Pronto per il deploy su PythonAnywhere (opzionale per test)

---

## 🎯 Cosa Puoi Fare Adesso

### 1️⃣ Test Immediato (Senza Backend)
Puoi testare il sistema **adesso** senza aspettare il deploy del backend:

1. Apri https://fiscal-9a0c8.web.app/cassa.html
2. Compila il form dello scontrino
3. Clicca "Invia Scontrino"
4. Apri https://fiscal-9a0c8.web.app/?cassa=TV01 in un'altra scheda
5. Dovrebbe apparire lo scontrino
6. Compila il form Instagram/Telefono
7. Verifica su Firebase Console che i dati siano salvati

**Guida completa**: Leggi `TESTING_GUIDE.md`

---

### 2️⃣ Deploy Backend (Opzionale)
Se vuoi che il sistema sia **sempre attivo** 24/7 senza il tuo PC:

1. Registrati su https://www.pythonanywhere.com (gratuito)
2. Segui `BACKEND_DEPLOYMENT_GUIDE.md`
3. Il backend sarà online all'indirizzo: `https://tuousername.pythonanywhere.com`

**Guida completa**: Leggi `BACKEND_DEPLOYMENT_GUIDE.md`

---

### 3️⃣ Programmazione Chip NFC
Quando sei pronto a usare i chip NFC fisici:

1. Scarica l'app "NFC Tools" (iOS o Android)
2. Apri l'app e seleziona "Scrivi"
3. Aggiungi un record "URL/URI"
4. Inserisci: `https://fiscal-9a0c8.web.app/?cassa=TV01`
5. Clicca "Scrivi" e avvicina il chip NFC
6. Fatto! Il chip è programmato

**Nota**: Cambia `TV01` con l'ID della tua cassa

---

## 📋 File Importanti

| File | Descrizione |
|------|-------------|
| `index.html` | Pagina cliente (scontrino + form contatti) |
| `cassa.html` | Pagina cassa (genera scontrini) |
| `main.py` | Backend FastAPI (opzionale) |
| `database.rules.json` | Regole di sicurezza Firebase |
| `firebase-config.js` | Configurazione Firebase |
| `TESTING_GUIDE.md` | Guida test completo |
| `BACKEND_DEPLOYMENT_GUIDE.md` | Guida deploy backend |
| `IMPLEMENTATION_SUMMARY.md` | Documentazione tecnica |

---

## 🔗 URL Importanti

| URL | Descrizione |
|-----|-------------|
| https://fiscal-9a0c8.web.app | Sito principale |
| https://fiscal-9a0c8.web.app/?cassa=TV01 | Scontrino cliente (cassa TV01) |
| https://fiscal-9a0c8.web.app/cassa.html | Pagina cassa (genera scontrini) |
| https://console.firebase.google.com | Firebase Console (monitora dati) |

---

## 🧪 Test Rapido (5 minuti)

### Passo 1: Genera uno scontrino
```
1. Apri https://fiscal-9a0c8.web.app/cassa.html
2. Compila il form:
   - Cassa ID: TV01
   - Nome Negozio: Test
   - Articoli: Caffè (1x €2.50)
3. Clicca "Invia Scontrino"
```

### Passo 2: Ricevi lo scontrino
```
1. Apri https://fiscal-9a0c8.web.app/?cassa=TV01
2. Dovrebbe apparire lo scontrino
```

### Passo 3: Compila il form contatti
```
1. Scorri verso il basso
2. Clicca tab "Instagram"
3. Inserisci: @mario_rossi
4. Clicca "Seguimi per offerte"
5. Dovrebbe apparire: "✓ Grazie! Ti contatteremo presto"
```

### Passo 4: Verifica su Firebase
```
1. Apri https://console.firebase.google.com
2. Vai a Realtime Database
3. Espandi clienti → TV01 → instagram
4. Dovrebbe apparire mario_rossi con i dati
```

---

## 📊 Struttura Dati Firebase

### Scontrini (Effimeri - 45 secondi)
```
scontrini/
  {receipt_id}/
    cassa_id: "TV01"
    timestamp: 1720777200000
    status: "UNCLAIMED" | "CLAIMED"
    data: {...}
```

### Clienti (Persistenti)
```
clienti/
  TV01/
    instagram/
      mario_rossi/
        instagram_handle: "mario_rossi"
        primo_contatto: 1720777200000
        ultimo_contatto: 1720777200000
        numero_scontrini: 1
        opt_in_marketing: true
    
    telefono/
      3201234567/
        telefono: "3201234567"
        primo_contatto: 1720777200000
        ultimo_contatto: 1720777200000
        numero_scontrini: 1
        opt_in_marketing: true
```

---

## 🔐 Sicurezza

✅ **Scontrini**: Pubblici (`.read: true`, `.write: true`)
- Chiunque può leggere/scrivere
- TTL di 45 secondi per evitare abusi
- Status CLAIMED per evitare duplicati

✅ **Clienti**: Privati (`.read: false`, `.write: limitato`)
- Nessun client può leggere i dati
- Ogni client può scrivere solo il proprio contatto
- Validazione server-side della struttura

---

## 🎯 Flusso Completo

```
1. Negoziante genera scontrino (cassa.html)
   ↓
2. Scontrino salvato su Firebase (status: UNCLAIMED)
   ↓
3. Cliente scansiona NFC (o apre link)
   ↓
4. App cerca scontrino UNCLAIMED per quella cassa
   ↓
5. Scontrino trovato e marcato CLAIMED
   ↓
6. Scontrino visualizzato al cliente
   ↓
7. Form contatti appare (Instagram/Telefono)
   ↓
8. Cliente compila form e clicca bottone
   ↓
9. Dati salvati su Firebase (nodo clienti)
   ↓
10. Feedback visivo: "✓ Grazie! Ti contatteremo presto"
```

---

## 🚀 Prossimi Step

### Fase 1: Test (Adesso)
- [ ] Leggi `TESTING_GUIDE.md`
- [ ] Testa il sistema usando cassa.html
- [ ] Verifica i dati su Firebase Console
- [ ] Testa la raccolta contatti (Instagram + Telefono)

### Fase 2: Deploy Backend (Opzionale)
- [ ] Leggi `BACKEND_DEPLOYMENT_GUIDE.md`
- [ ] Registrati su PythonAnywhere
- [ ] Deploy main.py
- [ ] Testa l'API

### Fase 3: Programmazione NFC
- [ ] Scarica "NFC Tools" (iOS/Android)
- [ ] Programma i chip NFC con l'URL
- [ ] Testa con i chip fisici

### Fase 4: Integrazione Cassa
- [ ] Integra il sistema con la tua cassa POS
- [ ] Configura l'invio automatico degli scontrini
- [ ] Monitora i dati su Firebase Console

---

## 📞 Supporto

### Problemi Comuni

**Q: Lo scontrino non appare**
A: Verifica che:
1. Lo scontrino sia stato creato su Firebase Console
2. Il `cassa_id` sia lo stesso (TV01)
3. Il timestamp sia recente (meno di 45 secondi fa)

**Q: Il form contatti non appare**
A: Verifica che:
1. Lo scontrino sia stato marcato CLAIMED
2. Apri la console del browser (F12) e cerca errori
3. Il CSS sia caricato correttamente

**Q: I dati non vengono salvati su Firebase**
A: Verifica che:
1. Le Firebase Rules siano pubblicate
2. Il nodo `clienti` sia presente
3. Apri la console del browser e cerca errori

---

## 📚 Documentazione Completa

- **`TESTING_GUIDE.md`**: Guida test completo (10 test dettagliati)
- **`BACKEND_DEPLOYMENT_GUIDE.md`**: Guida deploy backend su PythonAnywhere
- **`IMPLEMENTATION_SUMMARY.md`**: Documentazione tecnica dettagliata
- **`CHANGES_SUMMARY.md`**: Riepilogo delle modifiche
- **`DEPLOYMENT_CHECKLIST.md`**: Checklist deployment

---

## 🎉 Sei Pronto!

Il sistema è **completamente funzionante** e pronto per il test. Inizia con `TESTING_GUIDE.md` e segui i 10 test per verificare che tutto funzioni correttamente.

**Buona fortuna!** 🚀

---

**Ultima modifica**: 12/07/2026  
**Versione**: 1.0  
**Status**: ✅ Pronto per il test
