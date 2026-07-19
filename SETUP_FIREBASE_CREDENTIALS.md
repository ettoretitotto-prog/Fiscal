# 🔐 Come Configurare serviceAccountKey.json

## Passo 1: Accedi a Firebase Console

1. Vai a: **https://console.firebase.google.com**
2. Seleziona il progetto **"fiscal-9a0c8"**

## Passo 2: Scarica le Credenziali

1. Clicca sull'**icona dell'ingranaggio** (⚙️) in alto a sinistra
2. Seleziona **"Impostazioni progetto"**
3. Vai alla scheda **"Account di servizio"**
4. Clicca il bottone **"Genera nuova chiave privata"**
5. Verrà scaricato un file JSON (es: `fiscal-9a0c8-xxxxx.json`)

## Passo 3: Posiziona il File

1. **Rinomina** il file scaricato in: `serviceAccountKey.json`
2. **Sposta** il file nella cartella del progetto:
   ```
   /Users/ettoretitotto/Desktop/PROGRAMMI/Fiscal/serviceAccountKey.json
   ```

## Passo 4: Verifica

Dopo aver posizionato il file, esegui:

```bash
cd /Users/ettoretitotto/Desktop/PROGRAMMI/Fiscal
ls -la serviceAccountKey.json
```

Dovresti vedere il file elencato.

## ⚠️ IMPORTANTE: Sicurezza

- **NON** condividere mai questo file
- **NON** commitarlo su GitHub
- Mantienilo privato e al sicuro
- È già nel `.gitignore` del progetto

## Prossimo Step

Una volta posizionato il file, puoi testare con:

```bash
node test-interactive.js
```

Scegli l'opzione 2 (Test Invio a Firebase) per verificare che tutto funziona!
