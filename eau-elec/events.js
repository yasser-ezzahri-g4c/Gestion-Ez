import { getActiveModule } from "../shared/router.js";
import {
  ui,
  addPerson, updatePerson, setPersonAppOwner,
  saveElecBillTotal, saveElecMeters, saveWaterMonth,
  markElecPaid, markWaterPaid,
} from "./data.js";
import { render } from "./render.js";

export function setupEvents() {
  document.addEventListener("click", onClick);
  document.addEventListener("submit", onSubmit);
}

function onClick(e) {
  if (getActiveModule() !== "eau-elec") return;

  if (e.target.classList && e.target.classList.contains("overlay")) {
    const type = e.target.dataset.overlayClose;
    if (type === "month") ui.monthPanelOpen = false;
    else if (type === "modal") ui.modal = null;
    render();
    return;
  }

  const target = e.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;

  if (action === "set-subtab") { ui.subTab = target.dataset.tab; render(); }
  else if (action === "open-month-panel") { ui.monthPanelOpen = true; render(); }
  else if (action === "close-month-panel") { ui.monthPanelOpen = false; render(); }
  else if (action === "select-month") {
    ui.viewedMonthKey = target.dataset.month;
    ui.monthPanelOpen = false;
    ui.subTab = "factures";
    render();
  }
  else if (action === "toggle-card") {
    const key = target.dataset.key;
    if (ui.expanded.has(key)) ui.expanded.delete(key);
    else ui.expanded.add(key);
    render();
  }
  else if (action === "open-edit-person") {
    ui.modal = { type: "edit-person", personId: target.dataset.personId };
    render();
  }
  else if (action === "set-app-owner") {
    setPersonAppOwner(target.dataset.personId).then(() => render());
  }
  else if (action === "pay-elec") {
    markElecPaid(target.dataset.monthKey, target.dataset.personId).then(() => render());
  }
  else if (action === "pay-water") {
    markWaterPaid(target.dataset.monthKey, target.dataset.personId).then(() => render());
  }
  else if (action === "close-modal") { ui.modal = null; render(); }
}

async function onSubmit(e) {
  if (getActiveModule() !== "eau-elec") return;
  const form = e.target.closest("[data-form]");
  if (!form) return;
  e.preventDefault();
  const type = form.dataset.form;

  if (type === "add-person") {
    await addPerson(form.first_name.value, form.last_name.value, form.phone.value);
    form.reset();
    render();
  }
  else if (type === "edit-person") {
    const ok = await updatePerson(form.dataset.personId, form.first_name.value, form.last_name.value, form.phone.value);
    if (ok) ui.modal = null;
    render();
  }
  else if (type === "save-elec-bill") {
    await saveElecBillTotal(form.dataset.monthKey, form.bill_total.value);
    render();
  }
  else if (type === "save-elec-meters") {
    await saveElecMeters(form.dataset.monthKey, form.dataset.personId, {
      prevMeter: form.prev_meter?.value,
      currMeter: form.curr_meter?.value,
    });
    render();
  }
  else if (type === "save-water-bill") {
    await saveWaterMonth(form.dataset.monthKey, form.bill_total.value);
    render();
  }
}
