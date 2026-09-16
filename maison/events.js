import { isAdmin } from "../shared/auth.js";
import { getActiveModule } from "../shared/router.js";
import {
  ui, state,
  setMonthBudget, setWeekBudget,
  addCategory, updateCategory, deleteCategory,
  addPlace, updatePlace, deletePlace,
  addPurchase, updatePurchase, deletePurchase,
  assignPeriodCategory, unassignPeriodCategory,
} from "./data.js";
import { render } from "./render.js";
import { activeMonthKey, getWeekStart, normalizeName, toISO } from "../shared/utils.js";

export function setupEvents() {
  document.addEventListener("click", onClick);
  document.addEventListener("submit", onSubmit);
}

async function onClick(e) {
  if (getActiveModule() !== "maison") return;
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
    ui.subTab = "budget";
    render();
  }
  else if (action === "toggle-card") {
    const key = target.dataset.key;
    if (ui.expanded.has(key)) ui.expanded.delete(key);
    else ui.expanded.add(key);
    render();
  }
  else if (action === "pick-cat-type") {
    if (target.disabled) return;
    const form = target.closest("form");
    form.querySelectorAll("[data-action='pick-cat-type']").forEach(b => b.classList.remove("active-week", "active-month"));
    target.classList.add(target.dataset.value === "hebdo" ? "active-week" : "active-month");
    form.querySelector("[name='type']").value = target.dataset.value;
  }
  else if (action === "assign-category") {
    const type = target.dataset.type;
    const periodKey = type === "mensuel" ? target.dataset.monthKey : target.dataset.weekStart;
    await assignPeriodCategory(type, periodKey, target.dataset.categoryId);
    render();
  }
  else if (action === "unassign-category") {
    const type = target.dataset.type;
    const periodKey = type === "mensuel" ? target.dataset.monthKey : target.dataset.weekStart;
    await unassignPeriodCategory(type, periodKey, target.dataset.categoryId);
    render();
  }
  else if (action === "open-add-purchase") {
    ui.modal = {
      type: "add",
      categoryId: target.dataset.categoryId,
      type_: target.dataset.type,
      monthKey: target.dataset.monthKey || null,
      weekStart: target.dataset.weekStart || null,
    };
    render();
  }
  else if (action === "open-details") {
    const type = target.dataset.type;
    const monthKey = target.dataset.monthKey || null;
    const weekStart = target.dataset.weekStart || null;
    const editable = type === "mensuel"
      ? monthKey === activeMonthKey()
      : weekStart === toISO(getWeekStart(new Date()));
    const categoryId = target.dataset.categoryId || null;
    const displayName = target.dataset.categoryName
      || state.categories.find(c => c.id === categoryId)?.name
      || "";
    ui.modal = {
      type: "details",
      categoryId,
      displayName,
      periodType: type,
      monthKey,
      weekStart,
      editable,
    };
    render();
  }
  else if (action === "open-edit-budget") {
    if (target.dataset.budgetType === "month") {
      ui.modal = { type: "edit-budget", budgetType: "month", monthKey: target.dataset.monthKey };
    } else {
      ui.modal = { type: "edit-budget", budgetType: "week", weekStart: target.dataset.weekStart };
    }
    render();
  }
  else if (action === "open-edit-category") {
    ui.modal = { type: "edit-category", categoryId: target.dataset.categoryId };
    render();
  }
  else if (action === "open-edit-place") {
    ui.modal = { type: "edit-place", placeId: target.dataset.placeId };
    render();
  }
  else if (action === "open-edit-purchase") {
    const prev = ui.modal && ui.modal.type === "details" ? { ...ui.modal } : null;
    ui.modal = { type: "edit-purchase", purchaseId: target.dataset.purchaseId, returnTo: prev };
    render();
  }
  else if (action === "open-delete-confirm") {
    const prev = ui.modal && ui.modal.type === "details" ? { ...ui.modal } : null;
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
  if (entity === "purchase") ok = await deletePurchase(id);
  else if (entity === "category") ok = await deleteCategory(id);
  else if (entity === "place") ok = await deletePlace(id);

  if (!ok) return;

  if (entity === "purchase" && returnTo) {
    ui.modal = returnTo;
  } else {
    ui.modal = null;
  }
  render();
}

async function onSubmit(e) {
  if (getActiveModule() !== "maison") return;
  const form = e.target.closest("[data-form]");
  if (!form) return;
  e.preventDefault();
  const type = form.dataset.form;

  if (type === "set-month-budget") {
    const n = parseFloat(form.amount.value);
    if (!isNaN(n) && n >= 0) await setMonthBudget(ui.viewedMonthKey, n);
    render();
  }
  else if (type === "set-week-budget") {
    const n = parseFloat(form.amount.value);
    if (!isNaN(n) && n >= 0) await setWeekBudget(form.dataset.weekStart, n);
    render();
  }
  else if (type === "edit-budget") {
    const n = parseFloat(form.amount.value);
    if (isNaN(n) || n < 0) return;
    let ok;
    if (form.dataset.budgetType === "month") ok = await setMonthBudget(form.dataset.monthKey, n);
    else ok = await setWeekBudget(form.dataset.weekStart, n);
    if (ok) ui.modal = null;
    render();
  }
  else if (type === "add-category") {
    const name = normalizeName(form.name.value);
    const t = form.type.value;
    if (name) await addCategory(name, t);
    form.reset();
    render();
  }
  else if (type === "edit-category") {
    const name = normalizeName(form.name.value);
    const t = form.type.value;
    if (name) {
      const ok = await updateCategory(form.dataset.categoryId, name, t);
      if (ok) ui.modal = null;
    }
    render();
  }
  else if (type === "add-place") {
    const name = normalizeName(form.name.value);
    if (name) await addPlace(name);
    form.reset();
    render();
  }
  else if (type === "edit-place") {
    const name = normalizeName(form.name.value);
    if (name) {
      const ok = await updatePlace(form.dataset.placeId, name);
      if (ok) ui.modal = null;
    }
    render();
  }
  else if (type === "add-purchase") {
    const price = parseFloat(form.price.value);
    const place_id = form.place.value;
    const categoryId = form.dataset.categoryId;
    const cat = state.categories.find(c => c.id === categoryId);
    if (!cat || isNaN(price) || price < 0 || !place_id) return;
    const ok = await addPurchase({ categoryId: cat.id, type: cat.type, place_id, price });
    if (ok) ui.modal = null;
    render();
  }
  else if (type === "edit-purchase") {
    const price = parseFloat(form.price.value);
    const place_id = form.place.value;
    if (isNaN(price) || price < 0 || !place_id) return;
    const returnTo = ui.modal && ui.modal.returnTo;
    const ok = await updatePurchase(form.dataset.purchaseId, { price, place_id });
    if (ok) ui.modal = returnTo || null;
    render();
  }
}
