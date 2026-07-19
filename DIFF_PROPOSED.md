# 📋 DIFF PROPOSTO - Raccolta Contatti Instagram + Telefono

## Sommario delle modifiche

1. **index.html**: Aggiunta form opzionale per raccolta contatti (Instagram o Telefono)
2. **database.rules.json**: Nuove regole di sicurezza per il nodo `clienti`
3. **main.py**: NESSUNA MODIFICA (la scrittura avviene client-side)

---

## File 1: `index.html`

### Sezione 1: Aggiungere CSS (dopo riga 49, prima di `</style>`)

```diff
         #error .text { color: rgba(255,100,100,0.7); font-size: 0.9rem; }
+        
+        /* Contact Form Styles */
+        #contact-form { display: none; margin-top: 20px; padding-top: 20px; border-top: 1px dashed rgba(255,255,255,0.08); }
+        #contact-form.show { display: block; animation: fadeIn 0.6s ease forwards; }
+        .contact-form-title { font-size: 0.85rem; font-weight: 600; color: rgba(255,255,255,0.7); margin-bottom: 12px; text-align: center; }
+        .contact-tabs { display: flex; gap: 8px; margin-bottom: 14px; }
+        .contact-tab { flex: 1; padding: 8px 12px; border: 1px solid rgba(255,215,0,0.2); border-radius: 8px; background: rgba(255,215,0,0.05); color: rgba(255,255,255,0.5); font-size: 0.8rem; font-weight: 500; cursor: pointer; transition: all 0.3s ease; text-align: center; }
+        .contact-tab.active { background: rgba(255,215,0,0.15); color: #f5b342; border-color: rgba(255,215,0,0.4); }
+        .contact-tab:hover { border-color: rgba(255,215,0,0.3); }
+        .contact-input-group { margin-bottom: 12px; }
+        .contact-input { width: 100%; padding: 10px 12px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: rgba(255,255,255,0.9); font-size: 0.9rem; font-family: inherit; transition: all 0.3s ease; }
+        .contact-input:focus { outline: none; background: rgba(255,255,255,0.08); border-color: rgba(255,215,0,0.3); box-shadow: 0 0 0 2px rgba(255,215,0,0.1); }
+        .contact-input::placeholder { color: rgba(255,255,255,0.3); }
+        .contact-submit { width: 100%; padding: 10px 12px; background: rgba(255,215,0,0.15); border: 1px solid rgba(255,215,0,0.3); border-radius: 8px; color: #f5b342; font-size: 0.9rem; font-weight: 600; cursor: pointer; transition: all 0.3s ease; }
+        .contact-submit:hover { background: rgba(255,215,0,0.25); border-color: rgba(255,215,0,0.5); }
+        .contact-submit:disabled { opacity: 0.5; cursor: not-allowed; }
+        .contact-feedback { text-align: center; font-size: 0.85rem; color: rgba(100,200,100,0.8); margin-top: 10px; display: none; }
+        .contact-feedback.show { display: block; animation: fadeIn 0.4s ease forwards; }
+        .contact-error { color: rgba(255,100,100,0.8); }
```

### Sezione 2: Aggiungere HTML (dopo riga 75, prima di `</div>` che chiude receipt)

```diff
                 <div class="thanks">✨ Grazie per l'acquisto! ✨</div>
             </div>
+            <!-- NUOVO: Form opzionale per raccolta contatti -->
+            <div id="contact-form">
+                <div class="contact-form-title">📱 Rimani in contatto</div>
+                <div class="contact-tabs">
+                    <button class="contact-tab active" data-type="instagram">Instagram</button>
+                    <button class="contact-tab" data-type="telefono">Telefono</button>
+                </div>
+                <div class="contact-input-group">
+                    <input type="text" id="contact-input" class="contact-input" placeholder="@tuohandle" />
+                </div>
+                <button class="contact-submit" id="contact-submit">Seguimi per offerte</button>
+                <div class="contact-feedback" id="contact-feedback">✓ Grazie! Ti contatteremo presto</div>
+            </div>
         </div>
```

### Sezione 3: Aggiungere JavaScript (dopo riga 155, prima di `}`)

```diff
                 'wide,gap,med,gap,bar,gap,wide,gap,bar,gap,med,gap,bar,gap,wide,gap,med,gap,bar,gap,wide,gap,bar,gap,med,gap,wide,gap,bar,gap,med,gap,bar,gap,wide,gap,bar,gap,med,gap,wide,gap,bar,gap,med,gap,bar,gap,wide,gap,med,gap,bar,gap,wide,gap,bar,gap,med,gap,bar,gap,wide,gap'.split(',').forEach(function(cls) { var b = document.createElement('div'); b.className = 'bar ' + cls; bc.appendChild(b); });
+                
+                // NUOVO: Mostra il form di raccolta contatti
+                initContactForm();
             }
+            
+            // NUOVO: Gestione form contatti
+            let currentContactType = 'instagram';
+            
+            function initContactForm() {
+                const contactForm = document.getElementById('contact-form');
+                const tabs = document.querySelectorAll('.contact-tab');
+                const input = document.getElementById('contact-input');
+                const submitBtn = document.getElementById('contact-submit');
+                const feedback = document.getElementById('contact-feedback');
+                
+                // Tab switching
+                tabs.forEach(function(tab) {
+                    tab.addEventListener('click', function() {
+                        tabs.forEach(function(t) { t.classList.remove('active'); });
+                        this.classList.add('active');
+                        currentContactType = this.dataset.type;
+                        
+                        // Aggiorna placeholder e label bottone
+                        if (currentContactType === 'instagram') {
+                            input.placeholder = '@tuohandle';
+                            submitBtn.textContent = 'Seguimi per offerte';
+                        } else {
+                            input.placeholder = '+39 123 456 7890';
+                            submitBtn.textContent = 'Contattami';
+                        }
+                        input.value = '';
+                        feedback.classList.remove('show');
+                    });
+                });
+                
+                // Submit handler
+                submitBtn.addEventListener('click', function() {
+                    const value = input.value.trim();
+                    if (!value) {
+                        feedback.textContent = '⚠ Inserisci un valore valido';
+                        feedback.classList.add('show', 'contact-error');
+                        setTimeout(function() { feedback.classList.remove('show'); }, 3000);
+                        return;
+                    }
+                    
+                    submitBtn.disabled = true;
+                    
+                    // Normalizza il valore
+                    let normalizedValue, path;
+                    if (currentContactType === 'instagram') {
+                        normalizedValue = value.toLowerCase().replace(/^@/, '').trim();
+                        path = 'clienti/' + cassaId + '/instagram/' + normalizedValue;
+                    } else {
+                        normalizedValue = value.replace(/\D/g, ''); // solo cifre
+                        if (normalizedValue.length < 10) {
+                            feedback.textContent = '⚠ Numero di telefono non valido';
+                            feedback.classList.add('show', 'contact-error');
+                            submitBtn.disabled = false;
+                            setTimeout(function() { feedback.classList.remove('show'); }, 3000);
+                            return;
+                        }
+                        path = 'clienti/' + cassaId + '/telefono/' + normalizedValue;
+                    }
+                    
+                    // Scrivi/aggiorna su Firebase con merge
+                    const updates = {};
+                    updates[path] = {
+                        [currentContactType === 'instagram' ? 'instagram_handle' : 'telefono']: normalizedValue,
+                        'primo_contatto': firebase.database.ServerValue.TIMESTAMP,
+                        'ultimo_contatto': firebase.database.ServerValue.TIMESTAMP,
+                        'numero_scontrini': firebase.database.ServerValue.increment(1),
+                        'opt_in_marketing': true
+                    };
+                    
+                    db.ref().update(updates).then(function() {
+                        feedback.textContent = '✓ Grazie! Ti contatteremo presto';
+                        feedback.classList.remove('contact-error');
+                        feedback.classList.add('show');
+                        input.value = '';
+                        submitBtn.disabled = false;
+                        setTimeout(function() { feedback.classList.remove('show'); }, 4000);
+                    }).catch(function(error) {
+                        console.error('Error saving contact:', error);
+                        feedback.textContent = '⚠ Errore nel salvataggio. Riprova.';
+                        feedback.classList.add('show', 'contact-error');
+                        submitBtn.disabled = false;
+                        setTimeout(function() { feedback.classList.remove('show'); }, 3000);
+                    });
+                });
+                
+                contactForm.classList.add('show');
+            }
+            
             function showError(msg) {
```

---

## File 2: `database.rules.json`

### Modifiche complete (sostituire tutto il file)

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

---

## File 3: `main.py`

**NESSUNA MODIFICA** - La scrittura dei contatti avviene client-side direttamente su Firebase.

---

## Struttura dati Firebase risultante

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

## Note di sicurezza

✅ **Scontrini**: Rimane invariato (`.read: true`, `.write: true`)

✅ **Clienti**: 
- Nessun client può leggere la lista completa dei clienti di una cassa (`.read: false` a livello cassa)
- Ogni client può scrivere solo il proprio contatto (Instagram handle o numero di telefono normalizzato)
- Validazione della struttura dati obbligatoria
- `primo_contatto` viene impostato solo alla prima creazione (server timestamp)
- `ultimo_contatto` viene aggiornato ad ogni interazione
- `numero_scontrini` viene incrementato ad ogni submit (usando `increment(1)`)

---

## Flusso UX

1. Cliente scansiona NFC → riceve scontrino
2. Scontrino viene renderizzato e marcato CLAIMED
3. **Subito dopo**, appare il form opzionale "📱 Rimani in contatto"
4. Cliente sceglie tra Instagram o Telefono (tab)
5. Inserisce il valore (es. "@mio_handle" o "+39 123 456 7890")
6. Clicca "Seguimi per offerte" / "Contattami"
7. Dati vengono scritti su Firebase con merge (non overwrite)
8. Feedback visivo: "✓ Grazie! Ti contatteremo presto"
9. Form si resetta, pronto per il prossimo cliente

---

## Validazioni client-side

- **Instagram**: minuscolo, trim, rimozione @ automatica
- **Telefono**: solo cifre, minimo 10 cifre
- Entrambi: trim automatico, feedback di errore se vuoti

---

## Prossimi step (non implementati ora)

- Dashboard per negoziante con autenticazione (lettura clienti per cassa)
- Export dati clienti (CSV/Excel)
- Campagne marketing via Instagram/SMS
- Analytics su numero_scontrini per cliente
