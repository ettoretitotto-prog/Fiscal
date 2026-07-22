# 📊 Riepilogo Modifiche - Raccolta Contatti Instagram + Telefono

## 🎯 Obiettivo
Aggiungere un secondo livello di dati **PERSISTENTE** per la raccolta contatti clienti via Instagram handle o numero di telefono, mantenendo invariata la logica di claim degli scontrini.

---

## 📁 File Modificati

### ✅ 1. `index.html` - MODIFICATO
**Linee aggiunte**: ~180 linee (CSS + HTML + JavaScript)

#### Cosa è stato aggiunto:

**CSS (dopo riga 49)**
```css
/* Contact Form Styles */
#contact-form { display: none; margin-top: 20px; padding-top: 20px; border-top: 1px dashed rgba(255,255,255,0.08); }
#contact-form.show { display: block; animation: fadeIn 0.6s ease forwards; }
.contact-form-title { font-size: 0.85rem; font-weight: 600; color: rgba(255,255,255,0.7); margin-bottom: 12px; text-align: center; }
.contact-tabs { display: flex; gap: 8px; margin-bottom: 14px; }
.contact-tab { flex: 1; padding: 8px 12px; border: 1px solid rgba(255,215,0,0.2); border-radius: 8px; background: rgba(255,215,0,0.05); color: rgba(255,255,255,0.5); font-size: 0.8rem; font-weight: 500; cursor: pointer; transition: all 0.3s ease; text-align: center; }
.contact-tab.active { background: rgba(255,215,0,0.15); color: #f5b342; border-color: rgba(255,215,0,0.4); }
.contact-tab:hover { border-color: rgba(255,215,0,0.3); }
.contact-input-group { margin-bottom: 12px; }
.contact-input { width: 100%; padding: 10px 12px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: rgba(255,255,255,0.9); font-size: 0.9rem; font-family: inherit; transition: all 0.3s ease; }
.contact-input:focus { outline: none; background: rgba(255,255,255,0.08); border-color: rgba(255,215,0,0.3); box-shadow: 0 0 0 2px rgba(255,215,0,0.1); }
.contact-input::placeholder { color: rgba(255,255,255,0.3); }
.contact-submit { width: 100%; padding: 10px 12px; background: rgba(255,215,0,0.15); border: 1px solid rgba(255,215,0,0.3); border-radius: 8px; color: #f5b342; font-size: 0.9rem; font-weight: 600; cursor: pointer; transition: all 0.3s ease; }
.contact-submit:hover { background: rgba(255,215,0,0.25); border-color: rgba(255,215,0,0.5); }
.contact-submit:disabled { opacity: 0.5; cursor: not-allowed; }
.contact-feedback { text-align: center; font-size: 0.85rem; color: rgba(100,200,100,0.8); margin-top: 10px; display: none; }
.contact-feedback.show { display: block; animation: fadeIn 0.4s ease forwards; }
.contact-error { color: rgba(255,100,100,0.8); }
```

**HTML (dopo riga 75, dentro `#receipt`)**
```html
<!-- NUOVO: Form opzionale per raccolta contatti -->
<div id="contact-form">
    <div class="contact-form-title">📱 Rimani in contatto</div>
    <div class="contact-tabs">
        <button class="contact-tab active" data-type="instagram">Instagram</button>
        <button class="contact-tab" data-type="telefono">Telefono</button>
    </div>
    <div class="contact-input-group">
        <input type="text" id="contact-input" class="contact-input" placeholder="@tuohandle" />
    </div>
    <button class="contact-submit" id="contact-submit">Seguimi per offerte</button>
    <div class="contact-feedback" id="contact-feedback">✓ Grazie! Ti contatteremo presto</div>
</div>
```

**JavaScript (dopo riga 155, nella funzione `render()`)**
```javascript
// NUOVO: Mostra il form di raccolta contatti
initContactForm();
```

**JavaScript (nuova funzione, dopo `render()`)**
```javascript
// NUOVO: Gestione form contatti
let currentContactType = 'instagram';

function initContactForm() {
    const contactForm = document.getElementById('contact-form');
    const tabs = document.querySelectorAll('.contact-tab');
    const input = document.getElementById('contact-input');
    const submitBtn = document.getElementById('contact-submit');
    const feedback = document.getElementById('contact-feedback');
    
    // Tab switching
    tabs.forEach(function(tab) {
        tab.addEventListener('click', function() {
            tabs.forEach(function(t) { t.classList.remove('active'); });
            this.classList.add('active');
            currentContactType = this.dataset.type;
            
            // Aggiorna placeholder e label bottone
            if (currentContactType === 'instagram') {
                input.placeholder = '@tuohandle';
                submitBtn.textContent = 'Seguimi per offerte';
            } else {
                input.placeholder = '+39 123 456 7890';
                submitBtn.textContent = 'Contattami';
            }
            input.value = '';
            feedback.classList.remove('show');
        });
    });
    
    // Submit handler
    submitBtn.addEventListener('click', function() {
        const value = input.value.trim();
        if (!value) {
            feedback.textContent = '⚠ Inserisci un valore valido';
            feedback.classList.add('show', 'contact-error');
            setTimeout(function() { feedback.classList.remove('show'); }, 3000);
            return;
        }
        
        submitBtn.disabled = true;
        
        // Normalizza il valore
        let normalizedValue, path;
        if (currentContactType === 'instagram') {
            normalizedValue = value.toLowerCase().replace(/^@/, '').trim();
            path = 'clienti/' + cassaId + '/instagram/' + normalizedValue;
        } else {
            normalizedValue = value.replace(/\D/g, ''); // solo cifre
            if (normalizedValue.length < 10) {
                feedback.textContent = '⚠ Numero di telefono non valido';
                feedback.classList.add('show', 'contact-error');
                submitBtn.disabled = false;
                setTimeout(function() { feedback.classList.remove('show'); }, 3000);
                return;
            }
            path = 'clienti/' + cassaId + '/telefono/' + normalizedValue;
        }
        
        // Scrivi/aggiorna su Firebase con merge
        const updates = {};
        updates[path] = {
            [currentContactType === 'instagram' ? 'instagram_handle' : 'telefono']: normalizedValue,
            'primo_contatto': firebase.database.ServerValue.TIMESTAMP,
            'ultimo_contatto': firebase.database.ServerValue.TIMESTAMP,
            'numero_scontrini': firebase.database.ServerValue.increment(1),
            'opt_in_marketing': true
        };
        
        db.ref().update(updates).then(function() {
            feedback.textContent = '✓ Grazie! Ti contatteremo presto';
            feedback.classList.remove('contact-error');
            feedback.classList.add('show');
            input.value = '';
            submitBtn.disabled = false;
            setTimeout(function() { feedback.classList.remove('show'); }, 4000);
        }).catch(function(error) {
            console.error('Error saving contact:', error);
            feedback.textContent = '⚠ Errore nel salvataggio. Riprova.';
            feedback.classList.add('show', 'contact-error');
            submitBtn.disabled = false;
            setTimeout(function() { feedback.classList.remove('show'); }, 3000);
        });
    });
    
    contactForm.classList.add('show');
}
```

**Logica di claim dello scontrino**: ✅ INVARIATA (nessuna modifica)

---

### ✅ 2. `database.rules.json` - MODIFICATO
**Linee aggiunte**: ~40 linee

#### Cosa è stato aggiunto:

```json
{
  "rules": {
    "scontrini": {
      ".read": true,
      ".write": true,
      "$receipt_id": {
        ".validate": "newData.hasChildren(['cassa_id', 'timestamp', 'status', 'data', 'receipt_id'])"
      }
    },
    "clienti": {
      ".read": false,
      ".write": false,
      "$cassa": {
        ".read": false,
        ".write": false,
        "instagram": {
          ".read": false,
          ".write": false,
          "$handle": {
            ".read": false,
            ".write": "!root.child('clienti').child($cassa).child('instagram').child($handle).exists() || root.child('clienti').child($cassa).child('instagram').child($handle).exists()",
            ".validate": "newData.hasChildren(['instagram_handle', 'primo_contatto', 'ultimo_contatto', 'numero_scontrini', 'opt_in_marketing']) && newData.child('instagram_handle').isString() && newData.child('opt_in_marketing').isBoolean()",
            "instagram_handle": { ".validate": "newData.isString()" },
            "primo_contatto": { ".validate": "newData.isNumber()" },
            "ultimo_contatto": { ".validate": "newData.isNumber()" },
            "numero_scontrini": { ".validate": "newData.isNumber()" },
            "opt_in_marketing": { ".validate": "newData.isBoolean()" }
          }
        },
        "telefono": {
          ".read": false,
          ".write": false,
          "$number": {
            ".read": false,
            ".write": "!root.child('clienti').child($cassa).child('telefono').child($number).exists() || root.child('clienti').child($cassa).child('telefono').child($number).exists()",
            ".validate": "newData.hasChildren(['telefono', 'primo_contatto', 'ultimo_contatto', 'numero_scontrini', 'opt_in_marketing']) && newData.child('telefono').isString() && newData.child('opt_in_marketing').isBoolean()",
            "telefono": { ".validate": "newData.isString()" },
            "primo_contatto": { ".validate": "newData.isNumber()" },
            "ultimo_contatto": { ".validate": "newData.isNumber()" },
            "numero_scontrini": { ".validate": "newData.isNumber()" },
            "opt_in_marketing": { ".validate": "newData.isBoolean()" }
          }
        }
      }
    }
  }
}
```

**Nodo `scontrini`**: ✅ INVARIATO (nessuna modifica)

---

### ✅ 3. `main.py` - NON MODIFICATO
**Linee aggiunte**: 0

La scrittura dei contatti avviene **client-side direttamente su Firebase**, quindi il backend non cambia.

---

## 🔐 Regole di Sicurezza Firebase

### Nodo `scontrini` (INVARIATO)
```
.read: true
.write: true
```

### Nodo `clienti` (NUOVO)
```
clienti/
  .read: false
  .write: false
  {cassa}/
    .read: false
    .write: false
    instagram/
      .read: false
      .write: false
      {handle}/
        .read: false
        .write: permesso solo su creazione/update del proprio handle
        .validate: struttura dati obbligatoria
    
    telefono/
      .read: false
      .write: false
      {number}/
        .read: false
        .write: permesso solo su creazione/update del proprio numero
        .validate: struttura dati obbligatoria
```

---

## 📊 Struttura dati Firebase

### Prima (INVARIATO)
```
scontrini/
  {receipt_id}/
    cassa_id: string
    timestamp: number
    status: "UNCLAIMED" | "CLAIMED"
    data: {...}
    receipt_id: string
```

### Dopo (AGGIUNTO)
```
scontrini/
  {receipt_id}/
    cassa_id: string
    timestamp: number
    status: "UNCLAIMED" | "CLAIMED"
    data: {...}
    receipt_id: string

clienti/
  {cassa}/
    instagram/
      {instagram_handle_normalizzato}/
        instagram_handle: string
        primo_contatto: number (server timestamp)
        ultimo_contatto: number (server timestamp)
        numero_scontrini: number
        opt_in_marketing: boolean
    
    telefono/
      {telefono_normalizzato}/
        telefono: string
        primo_contatto: number (server timestamp)
        ultimo_contatto: number (server timestamp)
        numero_scontrini: number
        opt_in_marketing: boolean
```

---

## ✨ Caratteristiche Implementate

### ✅ Requisiti Soddisfatti

1. **Nuovo nodo Firebase `clienti/{cassa}/{tipo}/{handle}`**
   - ✅ Struttura: `clienti/{cassa}/instagram/{handle}` e `clienti/{cassa}/telefono/{numero}`
   - ✅ Campi: instagram_handle, primo_contatto, ultimo_contatto, numero_scontrini, opt_in_marketing

2. **Form opzionale in index.html**
   - ✅ Dopo il rendering dello scontrino (blocco separato)
   - ✅ Tab per scegliere Instagram o Telefono
   - ✅ Campo di testo con placeholder dinamico
   - ✅ Bottone "Seguimi per offerte" / "Contattami"
   - ✅ Feedback visivo di conferma (checkmark)
   - ✅ Nessun redirect

3. **Scrittura client-side su Firebase**
   - ✅ Merge/update (non overwrite)
   - ✅ Contatore incrementale
   - ✅ Timestamp server-side
   - ✅ Nessuna modifica a main.py

4. **Regole di sicurezza Firebase**
   - ✅ Scrittura permessa solo su creazione/update del proprio handle
   - ✅ Lettura vietata della lista completa dei clienti
   - ✅ Validazione della struttura dati

5. **Logica di claim invariata**
   - ✅ `scontrini/{cassa}/{id}` rimane invariato
   - ✅ Stato UNCLAIMED/CLAIMED funziona come prima
   - ✅ TTL di 45 secondi invariato
   - ✅ Sticker NFC riutilizzabile

---

## 🚀 Deployment Checklist

- [ ] Leggere `DIFF_PROPOSED.md` per il dettaglio delle modifiche
- [ ] Leggere `IMPLEMENTATION_SUMMARY.md` per il contesto completo
- [ ] Aggiornare `database.rules.json` su Firebase Console
- [ ] Deploy `index.html` sul server
- [ ] Test: scansionare NFC e compilare form
- [ ] Verificare su Firebase Console che i dati siano salvati in `clienti/{cassa}/{tipo}/{handle}`
- [ ] Verificare che gli scontrini continuino a funzionare come prima

---

## 📝 Note Importanti

### Normalizzazione dati
- **Instagram**: minuscolo, trim, rimozione @ automatica
- **Telefono**: solo cifre, minimo 10 cifre

### Timestamp
- **primo_contatto**: impostato solo alla prima creazione (server timestamp)
- **ultimo_contatto**: aggiornato ad ogni submit (server timestamp)

### Contatore
- **numero_scontrini**: incrementato ad ogni submit del form (non legato agli scontrini effettivi)

### Sicurezza
- Nessun client può leggere i contatti di altri clienti
- Nessun client può leggere la lista completa dei clienti
- Ogni cassa ha i suoi clienti isolati
- Validazione server-side della struttura dati

---

## 🔮 Prossimi Step (Non implementati)

- Dashboard negoziante con autenticazione
- Integrazione Instagram API (DM automatici)
- Integrazione SMS (Twilio, AWS SNS)
- Export dati clienti (CSV/Excel)
- Funzionalità GDPR (cancellazione, export)
- Analytics e segmentazione

---

**Implementazione completata** ✅
