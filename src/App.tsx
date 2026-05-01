import { useState } from "react";
import { Layout } from "./components/Layout";
import type { Page } from "./components/Layout";
import { OrderNowView } from "./views/OrderNowView";
import { InventoryView, ComponentInventoryView } from "./views/InventoryView";
import { RetailView } from "./views/RetailView";
import { ForecastView } from "./views/ForecastView";
import { CashView } from "./views/CashView";
import { ProfitView } from "./views/ProfitView";
import { MarketingView } from "./views/MarketingView";
import { DataView } from "./views/DataView";
import { SettingsView } from "./views/SettingsView";

function App() {
  const [page, setPage] = useState<Page>("order-now");

  return (
    <Layout page={page} setPage={setPage}>
      {page === "order-now" && <OrderNowView />}
      {page === "inventory" && <InventoryView />}
      {page === "components" && <ComponentInventoryView />}
      {page === "retail" && <RetailView />}
      {page === "forecast" && <ForecastView />}
      {page === "cash" && <CashView />}
      {page === "profit" && <ProfitView />}
      {page === "marketing" && <MarketingView />}
      {page === "data" && <DataView />}
      {page === "settings" && <SettingsView />}
    </Layout>
  );
}

export default App;
