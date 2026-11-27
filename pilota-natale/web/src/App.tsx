import { lazy, Suspense } from "react";
import { Route, Routes, Link } from "react-router";
import BuyerStart from "./pages/BuyerStart";
import GiftPage from "./pages/GiftPage";
import OwnerCopy from "./pages/OwnerCopy";
import Privacy from "./pages/Privacy";
import { Brand, Page, Spinner } from "./components/ui";

// Le aree admin e negozio vengono scaricate solo quando servono:
// la pagina cliente resta leggera sul telefono.
const AdminHome = lazy(() => import("./pages/admin/AdminHome"));
const AdminNewShop = lazy(() => import("./pages/admin/AdminNewShop"));
const AdminShop = lazy(() => import("./pages/admin/AdminShop"));
const ShopHome = lazy(() => import("./pages/negozio/ShopHome"));

function Home() {
  return (
    <Page>
      <Brand subtitle="Prova d'acquisto regalo digitale" />
      <h1 className="text-2xl font-bold">Il regalo senza scontrino di carta</h1>
      <p className="mt-3 text-stone-600">
        Nei negozi aderenti inquadra il QR alla cassa: ricevi la prova d'acquisto regalo da inviare a chi vuoi.
      </p>
      <div className="mt-8 space-y-2 text-sm">
        <Link to="/negozio" className="block text-brand underline">Area negozio</Link>
        <Link to="/privacy" className="block text-brand underline">Informativa privacy</Link>
      </div>
    </Page>
  );
}

function NotFound() {
  return (
    <Page>
      <Brand />
      <h1 className="text-xl font-bold">Pagina non trovata</h1>
      <p className="mt-2 text-stone-600">Controlla il link o inquadra di nuovo il QR.</p>
    </Page>
  );
}

export default function App() {
  return (
    <Suspense fallback={<Spinner />}>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/n/:shopId" element={<BuyerStart />} />
      <Route path="/c/:token" element={<OwnerCopy />} />
      <Route path="/r/:token" element={<GiftPage />} />
      <Route path="/negozio" element={<ShopHome />} />
      <Route path="/admin" element={<AdminHome />} />
      <Route path="/admin/negozi/nuovo" element={<AdminNewShop />} />
      <Route path="/admin/negozi/:shopId" element={<AdminShop />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
    </Suspense>
  );
}
