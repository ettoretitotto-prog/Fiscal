import { useEffect, useState } from "react";
import { LogoutButton, RequireRole } from "../../components/Auth";
import { Brand, Card, Page } from "../../components/ui";
import { useSession } from "../../lib/session";
import { getShop } from "../../lib/shops";
import type { Shop } from "../../lib/types";

function ShopPlaceholder() {
  const { profile } = useSession();
  const [shop, setShop] = useState<Shop | null>(null);
  useEffect(() => {
    if (profile?.shopId) getShop(profile.shopId).then(setShop);
  }, [profile?.shopId]);
  return (
    <Page>
      <div className="flex items-start justify-between">
        <Brand subtitle="Area negozio" />
        <LogoutButton />
      </div>
      <Card>
        <h1 className="text-xl font-bold">{shop?.name ?? "Il tuo negozio"}</h1>
        <p className="mt-2 text-stone-600">Accesso riuscito. La scansione delle prove regalo e le impostazioni arrivano al passo 5 del pilota.</p>
      </Card>
    </Page>
  );
}

export default function ShopHome() {
  return (
    <RequireRole role="shop" title="Accesso negozio" subtitle="Area negozio · Pilota Natale">
      <ShopPlaceholder />
    </RequireRole>
  );
}
