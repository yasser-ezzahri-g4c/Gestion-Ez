import { getActiveModule } from "../shared/router.js";
import { addManualExpense, addManualRevenue, addWalletCategory, cancelManualMovement, deleteWalletCategory, ensureDefaultWalletCategories, loadWalletData, setOpeningBalance, updateWalletCategory } from "../shared/wallet.js";
import { activeMonthKey, flash } from "../shared/utils.js";
import { ui } from "./data.js";
import { render } from "./render.js";
import { createFinanceEvent, loadFinanceEvents } from "./finance-events.js";

export function setupEvents() {
  document.addEventListener("click", onClick);
  document.addEventListener("submit", onSubmit);
}

async function onClick(event) {
  if (getActiveModule() !== "tresorerie") return;
  if (event.target.classList?.contains("overlay") && event.target.dataset.overlayClose === "modal") {
    ui.modal = null; render(); return;
  }
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  if (action === "set-subtab") { ui.subTab = target.dataset.tab; render(); }
  else if (action === "open-quick-amount") { ui.modal = { type: "quick-amount", categoryId: target.dataset.categoryId }; render(); }
  else if (action === "open-add-category") { ui.modal = { type: "add-category", direction: target.dataset.direction }; render(); }
  else if (action === "open-edit-category") { ui.modal = { type: "edit-category", categoryId: target.dataset.categoryId }; render(); }
  else if (action === "open-delete-category") { ui.modal = { type: "delete-category", categoryId: target.dataset.categoryId }; render(); }
  else if (action === "open-cancel-transaction") { ui.modal = { type: "cancel-transaction", movementId: target.dataset.movementId }; render(); }
  else if (action === "open-add-event") { ui.modal = { type: "add-event" }; render(); }
  else if (action === "open-event-details") { ui.modal = { type: "event-details", eventId: target.dataset.eventId }; render(); }
  else if (action === "confirm-delete-category") {
    const deleted = await deleteWalletCategory(target.dataset.categoryId);
    if (!deleted) return;
    ui.modal = null; await loadWalletData(); render();
  }
  else if (action === "confirm-cancel-transaction") {
    const cancelled = await cancelManualMovement(target.dataset.movementId);
    if (!cancelled) return;
    ui.modal = null; await loadWalletData(); render();
  }
  else if (action === "close-modal") { ui.modal = null; render(); }
  else if (action === "pick-wallet-direction") setSegmentValue(target, "direction", "active-month", "active-week");
  else if (action === "pick-fixed") setSegmentValue(target, "is_fixed", "active-month", "active-month");
}

function setSegmentValue(target, inputName, firstClass, secondClass) {
  const form = target.closest("form");
  if (!form) return;
  const buttons = [...target.parentElement.querySelectorAll(".segment")];
  buttons.forEach(button => button.classList.remove("active-month", "active-week"));
  target.classList.add(target === buttons[1] ? secondClass : firstClass);
  form.querySelector(`[name="${inputName}"]`).value = target.dataset.value;
}

async function addAmount(categoryId, direction, amount, label) {
  return direction === "revenue"
    ? addManualRevenue(activeMonthKey(), categoryId, amount, label)
    : addManualExpense(activeMonthKey(), categoryId, amount, label);
}

async function onSubmit(event) {
  if (getActiveModule() !== "tresorerie") return;
  const form = event.target.closest("[data-form]");
  if (!form) return;
  event.preventDefault();
  const submit = form.querySelector("[type='submit']");
  if (submit?.disabled) return;
  if (submit) submit.disabled = true;
  try {
    if (form.dataset.form === "set-initial-balance") {
      const saved = await setOpeningBalance(activeMonthKey(), form.amount.value);
      if (!saved) return;
      await loadWalletData();
      await ensureDefaultWalletCategories();
      await loadWalletData();
      render();
    } else if (form.dataset.form === "add-quick-amount") {
      const saved = await addAmount(form.dataset.categoryId, form.dataset.direction, form.amount.value, form.label.value);
      if (!saved) return;
      ui.modal = null; await loadWalletData(); render();
    } else if (form.dataset.form === "add-finance-category") {
      const initialAmount = Number(form.amount.value) || 0;
      const initialLabel = form.label.value.trim();
      const created = await addWalletCategory(form.name.value, form.direction.value, form.is_fixed.value === "true", form.icon.value);
      if (!created) return;
      if (initialAmount > 0) {
        const saved = await addAmount(created.id, form.direction.value, initialAmount, initialLabel);
        if (!saved) {
          flash("La catégorie a été créée, mais le montant n’a pas pu être ajouté.", true);
          await loadWalletData(); render(); return;
        }
      }
      ui.modal = null; await loadWalletData(); render();
    } else if (form.dataset.form === "edit-finance-category") {
      const updated = await updateWalletCategory(
        form.dataset.categoryId,
        form.name.value,
        form.dataset.direction,
        form.is_fixed.value === "true",
        form.icon.value,
      );
      if (!updated) return;
      ui.modal = null; await loadWalletData(); render();
    } else if (form.dataset.form === "add-finance-event") {
      const created = await createFinanceEvent({
        name: form.name.value,
        icon: form.icon.value,
        startsAt: form.starts_at.value,
        endsAt: form.ends_at.value,
      });
      if (!created) return;
      ui.modal = null;
      await Promise.all([loadFinanceEvents(), loadWalletData()]);
      render();
    }
  } finally {
    if (submit) submit.disabled = false;
  }
}
