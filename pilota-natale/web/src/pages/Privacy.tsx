import { Brand, Page } from "../components/ui";
import { PRIVACY_VERSION } from "../lib/privacy";

// Testo da far rileggere a un consulente privacy.
// Quando cambi il testo, aggiorna PRIVACY_VERSION in lib/privacy.ts.

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-6 text-lg font-bold">{children}</h2>;
}

export default function Privacy() {
  return (
    <Page>
      <Brand subtitle="Informativa privacy" />
      <h1 className="text-2xl font-bold">Informativa privacy</h1>
      <p className="mt-1 text-sm text-stone-500">Versione {PRIVACY_VERSION} · Servizio “Prova d'acquisto regalo” (pilota)</p>

      <div className="space-y-3 text-[15px] leading-relaxed text-stone-800">
        <H>Chi tratta i tuoi dati</H>
        <p>
          Titolare del trattamento è <strong>Ettore Titotto</strong>, persona fisica che gestisce il progetto sperimentale
          Fiscal, Via Leon Battista Alberti 25, Treviso (TV). Contatto:{" "}
          <a href="mailto:ettoretitotto@icloud.com" className="text-brand underline">ettoretitotto@icloud.com</a>.
        </p>
        <p>
          I negozi aderenti ricevono solo i dati delle prove d'acquisto create presso di loro (inclusa la foto dello
          scontrino) e li usano, come titolari autonomi, per gestire cambi e sconti nel proprio negozio.
        </p>

        <H>Quali dati trattiamo</H>
        <ul className="list-disc space-y-1 pl-5">
          <li>Chi fa il regalo: email, foto dello scontrino, descrizione dell'articolo, data e negozio.</li>
          <li>Email del destinatario inserita da chi regala: usata <strong>solo</strong> per consegnare il regalo.</li>
          <li>Chi riceve il regalo e lo salva: la sua email.</li>
          <li>Dati tecnici di utilizzo (es. apertura del link regalo, cambio effettuato) per il funzionamento e le statistiche del servizio.</li>
        </ul>

        <H>Perché e su quale base</H>
        <ul className="list-disc space-y-1 pl-5">
          <li>Fornire il servizio richiesto (creare, inviare e verificare la prova d'acquisto): esecuzione del servizio (art. 6.1.b GDPR).</li>
          <li>Consegnare il regalo all'email indicata da chi regala: legittimo interesse a consegnare quanto richiesto (art. 6.1.f). Mai per marketing.</li>
          <li>Inviarti novità da Fiscal: solo se spunti la casella facoltativa, sulla base del tuo consenso (art. 6.1.a), revocabile in ogni momento.</li>
        </ul>

        <H>Chi vede la foto dello scontrino</H>
        <p>
          Solo chi l'ha caricata (tramite il proprio link privato) e il negozio in cui è stato fatto l'acquisto. Chi riceve
          il regalo non vede mai la foto né il prezzo.
        </p>

        <H>Fornitori</H>
        <p>
          Usiamo Google Firebase (hosting, database, archiviazione, server in UE dove disponibile) e un fornitore di invio email.
          Agiscono come responsabili del trattamento.
        </p>

        <H>Per quanto tempo</H>
        <p>
          Le foto degli scontrini sono cancellate automaticamente 180 giorni dopo la creazione della prova d'acquisto
          (cioè ben oltre la scadenza dei cambi dei negozi del pilota). L'email del destinatario inserita da chi regala è
          cancellata 30 giorni dopo la consegna. I consensi sono conservati finché non li revochi e per il tempo necessario
          a dimostrarli.
        </p>

        <H>I tuoi diritti</H>
        <p>
          Puoi chiedere accesso, rettifica, cancellazione, limitazione, opposizione e portabilità dei dati, e revocare il consenso,
          scrivendo a ettoretitotto@icloud.com. Puoi proporre reclamo al Garante per la protezione dei dati personali.
        </p>
      </div>
    </Page>
  );
}
