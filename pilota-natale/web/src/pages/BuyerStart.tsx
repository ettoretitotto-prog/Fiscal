import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { getShop } from "../lib/shops";
import type { Shop } from "../lib/types";
import { Alert, Brand, Card, Page, Spinner } from "../components/ui";

export default function BuyerStart() {
  const { shopId = "" } = useParams();
  const [shop, setShop] = useState<Shop | null | undefined>(undefined);
  useEffect(() => {
    getShop(shopId).then(setShop).catch(() => setShop(null));
  }, [shopId]);

  if (shop === undefined) return <Spinner />;
  return (
    <Page>
      <Brand subtitle="Prova d'acquisto regalo" />
      {!shop || !shop.active ? (
        <Alert>Questo QR non è attivo. Chiedi al personale del negozio.</Alert>
      ) : (
        <Card>
          <p className="text-sm text-stone-500">Stai acquistando da</p>
          <h1 className="text-2xl font-bold">{shop.name}</h1>
          {shop.address && <p className="text-sm text-stone-500">{shop.address}</p>}
          <p className="mt-4 text-stone-700">Qui potrai fotografare lo scontrino e creare la prova d'acquisto regalo. Disponibile dal passo 2 del pilota.</p>
        </Card>
      )}
    </Page>
  );
}
