import { activeMonthKey } from "../shared/utils.js";
import { ensureDefaultWalletCategories, hasOpeningBalance, loadWalletData } from "../shared/wallet.js";
import { ui, fetchStateFromSupabase, loadMaladieLookup } from "./data.js";
import { render } from "./render.js";
import { setupEvents } from "./events.js";

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
  if (!ui.viewedMonthKey) ui.viewedMonthKey = activeMonthKey();
  if (!eventsReady) {
    setupEvents();
    eventsReady = true;
  }
  if (!dataLoaded) {
    await fetchStateFromSupabase();
    dataLoaded = true;
  } else {
    await Promise.all([loadWalletData(), loadMaladieLookup()]);
  }
  if (hasOpeningBalance()) {
    await ensureDefaultWalletCategories();
    await loadWalletData();
  }
  render();
}

export { render };
