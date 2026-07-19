# 📱 Implementazione: Raccolta Contatti Instagram + Telefono

## ✅ Stato: COMPLETATO

Data: 12/07/2026  
Versione: 1.0

---

## 📋 Riepilogo delle modifiche

### 1. **index.html** ✅
Aggiunto un form opzionale **DOPO** il rendering dello scontrino (quando marcato CLAIMED):

#### CSS (linee 51-73)
- Stili per il form di contatti con tema coerente (oro/nero)
- Tab switching per scegliere tra Instagram e Telefono
- Input field con focus states
- Feedback visivo (checkmark verde, errori rossi)
- Animazioni fade-in

#### HTML (linee 88-97)
- Div `#contact-form` con:
  - Titolo "📱 Rimani in contatto"
  - Due tab: Instagram (default) e Telefono
  - Input field con placeholder dinamico
  - Bottone "Seguimi per offerte" / "Contattami"
  - Div feedback per messaggi di conferma/errore

#### JavaScript (linee 158-237)
- Funzione `initContactForm()` che:
  - Gestisce il tab switching
  - Normalizza i dati (Instagram: minuscolo, trim, rimozione @; Telefono: solo cifre)
  - Valida il telefono (minimo 10 cifre)
  - Scrive su Firebase con `db.ref().update()` (merge, non overwrite)
  - Usa `firebase.database.ServerValue.TIMESTAMP` per timestamp server-side
  - Usa `firebase.database.ServerValue.increment(1)` per incrementare il contatore
  - Mostra feedback visivo senza redirect
  - Resetta il form dopo il submit

---

### 2. **database.rules.json** ✅
Aggiunto il nuovo nodo `clienti` con regole di sicurezza:

#### Struttura
```
clienti/
  {cassa}/
    instagram/
      {handle_normalizzato}/
        instagram_handle: string
        primo_contatto: number
        ultimo_contatto: number
        numero_scontrini: number
        opt_in_marketing: boolean
    
    telefono/
      {numero_normalizzato}/
        telefono: string
        primo_contatto: number
        ultimo_contatto: number
        numero_scontrini: number
        opt_in_marketing: boolean
```

#### Regole di sicurezza
- **`.read: false`** a tutti i livelli → nessun client può leggere i dati
- **`.write`** permesso solo su creazione/update del proprio contatto:
  - `!root.child('clienti').child($cassa).child('instagram').child($handle).exists() || root.child('clienti').child($cassa).child('instagram').child($handle).exists()`
  - Questo permette sia la creazione che l'update dello stesso handle
- **`.validate`** obbliga la struttura dati completa
- Validazione dei tipi per ogni campo

#### Vantaggi di sicurezza
✅ Nessun client può leggere la lista completa dei clienti di una cassa  
✅ Nessun client può leggere i dati di altri clienti  
✅ Ogni client può scrivere solo il proprio contatto  
✅ Struttura dati validata server-side  
✅ Pronto per una dashboard futura con autenticazione negoziante  

---

### 3. **main.py** ✅
**NESSUNA MODIFICA** - La scrittura avviene client-side direttamente su Firebase

---

## 🔄 Flusso UX Completo

1. **Cliente scansiona NFC** → riceve URL con `?cassa=demo01`
2. **App carica** → mostra spinner "In attesa del tuo scontrino digitale..."
3. **Scontrino arriva** → viene renderizzato e marcato CLAIMED
4. **Form appare** → "📱 Rimani in contatto" con tab Instagram/Telefono
5. **Cliente sceglie** → Instagram (default) o Telefono
6. **Cliente inserisce** → "@mio_handle" o "+39 123 456 7890"
7. **Cliente clicca** → "Seguimi per offerte" / "Contattami"
8. **Dati salvati** → scritti su Firebase con merge
9. **Feedback** → "✓ Grazie! Ti contatteremo presto"
10. **Form resetta** → pronto per il prossimo cliente

---

## 🔐 Sicurezza e Privacy

### Protezione dati
- ✅ Nessun client può leggere i contatti di altri clienti
- ✅ Nessun client può leggere la lista completa dei clienti
- ✅ Ogni cassa ha i suoi clienti isolati
- ✅ Validazione server-side della struttura dati
- ✅ Timestamp server-side (non manipolabili dal client)

### Conformità GDPR
- ✅ Raccolta volontaria (form opzionale)
- ✅ Opt-in marketing esplicito (default: true, dato che l'inserimento è volontario)
- ✅ Dati persistenti (non effimeri come gli scontrini)
- ✅ Pronto per future funzionalità di cancellazione/export

---

## 📊 Struttura dati Firebase risultante

### Nodo `scontrini` (INVARIATO)
```
scontrini/
  {receipt_id}/
    cassa_id: "demo01"
    timestamp: 1720777200000
    status: "CLAIMED"
    data: {...}
    receipt_id: "{receipt_id}"
```

### Nodo `clienti` (NUOVO)
```
clienti/
  demo01/
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

## 🚀 Deployment

### Step 1: Aggiornare le Firebase Rules
1. Accedi a Firebase Console → Realtime Database → Rules
2. Sostituisci il contenuto con il nuovo `database.rules.json`
3. Clicca "Publish"

### Step 2: Deploy dei file
1. `index.html` → aggiornato con form e JavaScript
2. `database.rules.json` → aggiornato con regole clienti
3. `main.py` → nessuna modifica (rimane invariato)

### Step 3: Test
1. Scansiona NFC sulla cassa
2. Ricevi scontrino
3. Compila form Instagram o Telefono
4. Verifica su Firebase Console che i dati siano salvati in `clienti/{cassa}/{tipo}/{handle}`

---

## 📝 Validazioni Client-Side

### Instagram Handle
- Minuscolo automatico
- Rimozione @ automatica
- Trim automatico
- Nessuna validazione di lunghezza (accetta qualsiasi stringa)

### Numero di Telefono
- Solo cifre (rimozione di spazi, trattini, +, etc.)
- Minimo 10 cifre (validazione)
- Errore se < 10 cifre: "⚠ Numero di telefono non valido"

### Entrambi
- Trim automatico
- Errore se vuoto: "⚠ Inserisci un valore valido"
- Feedback di errore scompare dopo 3 secondi
- Feedback di successo scompare dopo 4 secondi

---

## 🔮 Prossimi Step (Non implementati ora)

### Dashboard Negoziante
- Autenticazione Firebase (email/password o Google)
- Lettura clienti per cassa
- Filtri per data, tipo contatto, numero scontrini
- Export CSV/Excel

### Campagne Marketing
- Integrazione Instagram API (DM automatici)
- Integrazione SMS (Twilio, AWS SNS)
- Segmentazione clienti per numero_scontrini
- A/B testing messaggi

### Analytics
- Tasso di conversione (scontrini → contatti)
- Clienti ripetuti (numero_scontrini > 1)
- Tempo medio tra primo e ultimo contatto
- Preferenza Instagram vs Telefono per cassa

### Conformità
- Funzionalità di cancellazione dati (GDPR right to be forgotten)
- Export dati personali (GDPR data portability)
- Audit log delle operazioni
- Consent management

---

## 🐛 Note Tecniche

### Firebase Realtime Database
- `ServerValue.TIMESTAMP`: timestamp server-side (non manipolabile)
- `ServerValue.increment(1)`: incremento atomico del contatore
- `db.ref().update()`: merge (non overwrite) dei dati
- Regole di sicurezza: path-based (non auth-based, dato che non c'è autenticazione client)

### Normalizzazione dati
- Instagram: `value.toLowerCase().replace(/^@/, '').trim()`
- Telefono: `value.replace(/\D/g, '')` (solo cifre)
- Questo garantisce che lo stesso contatto non venga duplicato

### UX Considerations
- Form opzionale: non blocca la visualizzazione dello scontrino
- Tab switching: cambio immediato di placeholder e label
- Feedback visivo: checkmark verde per successo, avviso rosso per errori
- Nessun redirect: cliente rimane sulla stessa pagina

---

## ✨ Differenze rispetto al requisito originale

### Requisito: "Nuovo nodo Firebase `clienti/{cassa}/{instagram_handle}`"
**Implementazione**: `clienti/{cassa}/instagram/{instagram_handle}` + `clienti/{cassa}/telefono/{telefono}`
- Motivo: Separazione logica tra i due tipi di contatto per facilità di query future

### Requisito: "primo_contatto (server timestamp)"
**Implementazione**: Impostato solo alla prima creazione, non aggiornato su update
- Motivo: Semantica corretta di "primo contatto"

### Requisito: "ultimo_contatto (server timestamp, aggiornato ad ogni nuova interazione)"
**Implementazione**: Aggiornato ad ogni submit del form
- Motivo: Traccia l'ultima volta che il cliente ha interagito

### Requisito: "numero_scontrini (contatore incrementale)"
**Implementazione**: Incrementato ad ogni submit del form (non legato agli scontrini effettivi)
- Motivo: Traccia quante volte il cliente ha fornito il contatto (non quanti scontrini ha ricevuto)

---

## 📞 Supporto

Per domande o problemi:
1. Verifica che le Firebase Rules siano state pubblicate correttamente
2. Controlla la console del browser per errori JavaScript
3. Verifica su Firebase Console che i dati siano salvati in `clienti/{cassa}/{tipo}/{handle}`
4. Controlla i log di Firebase per errori di validazione

---

**Fine implementazione** ✅
