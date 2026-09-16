import { getActiveModule } from "../shared/router.js";
import { loadWalletData } from "../shared/wallet.js";
import { activeMonthKey } from "../shared/utils.js";
import {
  ui, setOpeningBalance, setSalary,
  addManualExpense, addManualRevenue, updateManualMovement, deleteManualMovement,
  addWalletCategory, updateWalletCategory,
  pinSaisieCategory, unpinSaisieCategory, loadMaladieLookup,
} from "./data.js";
import { render } from "./render.js";

export function setupEvents() {
  document.addEventListener("click", onClick);
  document.addEventListener("submit", onSubmit);
}

async function onClick(e) {
  if (getActiveModule() !== "tresorerie") return;

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
    render();
  }
  else if (action === "toggle-card") {
    const key = target.dataset.key;
    if (ui.expanded.has(key)) ui.expanded.delete(key);
    else ui.expanded.add(key);
    render();
  }
  else if (action === "pick-wallet-direction") {
    const form = target.closest("form");
    if (!form) return;
    form.querySelectorAll("[data-action='pick-wallet-direction']").forEach(b => {
      b.classList.remove("active-month", "active-week");
    });
    target.classList.add(target.dataset.value === "revenue" ? "active-week" : "active-month");
    form.querySelector("[name='direction']").value = target.dataset.value;
  }
  else if (action === "open-edit-wallet-category") {
    ui.modal = { type: "edit-wallet-category", categoryId: target.dataset.categoryId };
    render();
  }
  else if (action === "assign-saisie-category") {
    pinSaisieCategory(target.dataset.monthKey, target.dataset.direction, target.dataset.categoryId);
    render();
  }
  else if (action === "unassign-saisie-category") {
    unpinSaisieCategory(target.dataset.monthKey, target.dataset.direction, target.dataset.categoryId);
    render();
  }
  else if (action === "open-add-manual-movement") {
    ui.modal = {
      type: "add-manual-movement",
      categoryId: target.dataset.categoryId,
      monthKey: target.dataset.monthKey,
      direction: target.dataset.direction,
    };
    render();
  }
  else if (action === "open-wallet-system-details") {
    ui.modal = {
      type: "wallet-system-details",
      monthKey: target.dataset.monthKey,
      sourceType: target.dataset.sourceType,
    };
    render();
  }
  else if (action === "open-wallet-manual-details") {
    ui.modal = {
      type: "wallet-manual-details",
      monthKey: target.dataset.monthKey,
      categoryId: target.dataset.categoryId,
      editable: target.dataset.monthKey === activeMonthKey(),
    };
    render();
  }
  else if (action === "open-edit-manual-movement") {
    const prev = ui.modal && ui.modal.type === "wallet-manual-details" ? { ...ui.modal } : null;
    ui.modal = { type: "edit-manual-movement", movementId: target.dataset.movementId, returnTo: prev };
    render();
  }
  else if (action === "open-delete-confirm") {
    const prev = ui.modal && ui.modal.type === "wallet-manual-details" ? { ...ui.modal } : null;
    ui.modal = {
      type: "confirm-delete",
      entity: target.dataset.entity,
      id: target.dataset.id,
      label: target.dataset.label,
      returnTo: prev,
    };
    render();
  }
  else if (action === "confirm-delete") {
    handleConfirmDelete(target.dataset.entity, target.dataset.id);
  }
  else if (action === "close-modal") { ui.modal = null; render(); }
}

async function handleConfirmDelete(entity, id) {
  const returnTo = ui.modal && ui.modal.returnTo;
  let ok = false;
  if (entity === "manual-movement") ok = await deleteManualMovement(id);

  if (!ok) return;

  if (entity === "manual-movement" && returnTo) {
    ui.modal = returnTo;
  } else {
    ui.modal = null;
  }
  await Promise.all([loadWalletData(), loadMaladieLookup()]);
  render();
}

async function onSubmit(e) {
  if (getActiveModule() !== "tresorerie") return;
  const form = e.target.closest("[data-form]");
  if (!form) return;
  e.preventDefault();

  if (form.dataset.form === "set-opening") {
    const ok = await setOpeningBalance(ui.viewedMonthKey, form.amount.value);
    if (ok) { await Promise.all([loadWalletData(), loadMaladieLookup()]); render(); }
  }
  else if (form.dataset.form === "set-salary") {
    const ok = await setSalary(form.dataset.monthKey, form.amount.value);
    if (ok) { await Promise.all([loadWalletData(), loadMaladieLookup()]); render(); }
  }
  else if (form.dataset.form === "add-wallet-category") {
    const ok = await addWalletCategory(form.name.value, form.direction.value);
    if (ok) render();
  }
  else if (form.dataset.form === "edit-wallet-category") {
    const ok = await updateWalletCategory(
      form.dataset.categoryId,
      form.name.value,
      form.direction.value,
    );
    if (ok) { ui.modal = null; render(); }
  }
  else if (form.dataset.form === "add-manual-movement") {
    const { monthKey, categoryId, direction } = form.dataset;
    const ok = direction === "revenue"
      ? await addManualRevenue(monthKey, categoryId, form.amount.value, form.label.value)
      : await addManualExpense(monthKey, categoryId, form.amount.value, form.label.value);
    if (ok) {
      ui.modal = null;
      await Promise.all([loadWalletData(), loadMaladieLookup()]);
      render();
    }
  }
  else if (form.dataset.form === "edit-manual-movement") {
    const ok = await updateManualMovement(
      form.dataset.movementId,
      form.amount.value,
      form.label.value,
    );
    if (ok) {
      const returnTo = ui.modal && ui.modal.returnTo;
      ui.modal = returnTo || null;
      await Promise.all([loadWalletData(), loadMaladieLookup()]);
      render();
    }
  }
}
