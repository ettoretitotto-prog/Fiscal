import { Link } from "react-router";
import { MARKETING_TEXT } from "../lib/privacy";

/**
 * Testo privacy (nessuna spunta per il servizio) + consenso marketing separato,
 * facoltativo e NON preselezionato. Il testo è salvato con ogni consenso.
 */
export function PrivacyNotice({ marketing, onMarketing }: { marketing: boolean; onMarketing: (v: boolean) => void }) {
  return (
    <div className="space-y-3 rounded-xl bg-stone-50 p-4">
      <p className="text-sm text-stone-700">
        Continuando accetti l'
        <Link to="/privacy" target="_blank" className="font-semibold text-brand underline">Informativa privacy</Link>.
      </p>
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={marketing}
          onChange={(e) => onMarketing(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 accent-brand"
        />
        <span className="text-sm text-stone-700">
          {MARKETING_TEXT} <span className="text-stone-400">(facoltativo)</span>
        </span>
      </label>
    </div>
  );
}
