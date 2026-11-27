import "./styles.css";
import { loadConfig } from "./lib/config";

// Prima la configurazione Firebase, poi il resto dell'app.
const root = document.getElementById("root")!;
loadConfig()
  .then(() => import("./boot"))
  .then((m) => m.mount(root))
  .catch((e) => {
    console.error(e);
    root.innerHTML =
      '<div style="font-family:system-ui;padding:32px;max-width:420px;margin:auto"><h1 style="font-size:20px">Servizio non disponibile</h1><p>Controlla la connessione e ricarica la pagina.</p></div>';
  });
