import { currentCalendarMonthKey, flash } from "../shared/utils.js";
import { loadWalletData, repairManualMovementMonthKeys } from "../shared/wallet.js";
import { ui, fetchStateFromSupabase, loadMaladieLookup } from "./data.js";
import { render } from "./render.js";
import { setupEvents } from "./events.js";
import { loadFinanceEvents } from "./finance-events.js";

let eventsReady = false;
let dataLoaded = false;

export function deactivate() {
  ui.modal = null;
  ui.monthPanelOpen = false;
}

export function resetModule() {
  dataLoaded = false;
}

export async function activate() {
  if (!ui.viewedMonthKey) ui.viewedMonthKey = currentCalendarMonthKey();
  if (!eventsReady) {
    setupEvents();
    eventsReady = true;
  }
  if (!dataLoaded) {
    await fetchStateFromSupabase();
    dataLoaded = true;
  } else {
    await Promise.all([loadWalletData(), loadMaladieLookup(), loadFinanceEvents()]);
  }
  const repaired = await repairManualMovementMonthKeys();
  render();
  if (repaired > 0) {
    flash(`${repaired} transaction${repaired > 1 ? "s ont" : " a"} été replacée${repaired > 1 ? "s" : ""} dans le bon mois.`);
  }
}

export { render };
