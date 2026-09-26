import { ui } from "./data.js";
import {
  getFinancialHistory, getFinancialOverview, getUserWalletCategories,
  getMovements, getWalletCategories, hasOpeningBalance, SOURCE_LABELS, totalForCategory,
} from "../shared/wallet.js";
import { esc, money } from "../shared/utils.js";
import {
  areFinanceEventsAvailable, getActiveFinanceEvent, getFinanceEvents,
} from "./finance-events.js";

const FALLBACK_ICONS = { depense: "💳", revenue: "💰" };
const ICONS = ["", "💧", "⚡", "📶", "🏠", "🛒", "🚌", "💼", "🎁", "🍽️", "🎓", "💊", "💰"];

export function render() {
  const controls = document.getElementById("maison-controls");
  if (controls) controls.style.display = "none";
  document.getElementById("header-title").textContent = "Mes finances";
  document.getElementById("subtabs").innerHTML = `
    <button class="subtab ${ui.subTab === "dashboard" ? "active" : ""}" data-action="set-subtab" data-tab="dashboard">Vue globale</button>
    <button class="subtab ${ui.subTab === "events" ? "active" : ""}" data-action="set-subtab" data-tab="events">Événements</button>
    <button class="subtab ${ui.subTab === "history" ? "active" : ""}" data-action="set-subtab" data-tab="history">Historique</button>`;
  document.getElementById("main").innerHTML = ui.subTab === "history"
    ? renderHistory()
    : ui.subTab === "events" ? renderEventsTab() : renderDashboard();
  document.getElementById("modal-root").innerHTML = !hasOpeningBalance()
    ? renderInitialBalanceModal()
    : (ui.modal ? renderModal() : "");
}

function renderInitialBalanceModal() {
  return `
    <div class="overlay finance-required-overlay">
      <div class="sheet finance-sheet finance-welcome-sheet">
        <div class="finance-welcome-icon">💰</div>
        <div class="sheet-title finance-welcome-title">Bienvenue dans vos finances</div>
        <p class="finance-help">Quel est le montant d’argent que vous avez actuellement&nbsp;?</p>
        <form class="form-col" data-form="set-initial-balance">
          <label class="finance-field-label" for="initial-balance">Solde initial</label>
          <div class="money-field"><input class="field" id="initial-balance" name="amount" type="number" min="0" step="0.01" inputmode="decimal" placeholder="8 000" autofocus required /><span>MAD</span></div>
          <button type="submit" class="btn-primary">Commencer</button>
        </form>
      </div>
    </div>`;
}

function renderDashboard() {
  const summary = getFinancialOverview();
  return `
    <div class="finance-dashboard">
      <section class="balance-hero">
        <div class="balance-hero-label">Solde actuel</div>
        <div class="balance-hero-value">${money(summary.currentBalance)} <small>MAD</small></div>
        <div class="balance-hero-grid">
          <div><span>Solde initial</span><strong>${money(summary.initialBalance)} MAD</strong></div>
          <div class="finance-positive"><span>Revenus cumulés</span><strong>+${money(summary.totalRevenue)} MAD</strong></div>
          <div class="finance-negative"><span>Dépenses cumulées</span><strong>−${money(summary.totalExpense)} MAD</strong></div>
        </div>
      </section>
      ${renderCategorySection("Dépenses", "depense", sortedCategories("depense"), summary.totalExpense)}
      ${renderCategorySection("Revenus", "revenue", sortedCategories("revenue"), summary.totalRevenue)}
      <section class="finance-analysis-section">
        <div class="finance-section-head"><div><h2>Analyse globale</h2><span>Répartition calculée depuis l’historique</span></div></div>
        ${renderBreakdown("depense", getFinancialHistory())}
        ${renderBreakdown("revenue", getFinancialHistory())}
      </section>
    </div>`;
}

function sortedCategories(direction) {
  return getUserWalletCategories().filter(category => (category.direction || "depense") === direction)
    .slice().sort((a, b) => Number(Boolean(b.is_fixed)) - Number(Boolean(a.is_fixed))
      || a.name.localeCompare(b.name, "fr", { sensitivity: "base" }));
}

function renderCategorySection(title, direction, categories, total) {
  return `
    <section class="finance-section">
      <div class="finance-section-head">
        <div><h2>${title}</h2><span>${money(total)} MAD au total</span></div>
        <button type="button" class="finance-add-btn" data-action="open-add-category" data-direction="${direction}">＋ Ajouter</button>
      </div>
      ${categories.length ? `<div class="finance-card-grid">${categories.map(renderCategoryCard).join("")}</div>` : `
        <button type="button" class="finance-empty" data-action="open-add-category" data-direction="${direction}">
          <span>${direction === "depense" ? "💳" : "💰"}</span><strong>Aucune catégorie</strong>
          <small>Touchez ici pour en ajouter une</small>
        </button>`}
    </section>`;
}

function renderCategoryCard(category) {
  const direction = category.direction || "depense";
  return `
    <div class="finance-category-wrap">
      <button type="button" class="finance-category-card ${direction}" data-action="open-quick-amount" data-category-id="${category.id}">
        <span class="finance-category-icon">${esc(category.icon || FALLBACK_ICONS[direction])}</span>
        ${category.is_fixed ? `<span class="finance-fixed-badge">Fixe</span>` : ""}
        <span class="finance-category-name">${esc(category.name)}</span>
        <strong>${money(totalForCategory(category.id))} MAD</strong>
        <small>${direction === "depense" ? "dépensé" : "reçu"}</small>
      </button>
      <button type="button" class="finance-category-manage" data-action="open-edit-category" data-category-id="${category.id}" aria-label="Modifier ${esc(category.name)}" title="Modifier">•••</button>
    </div>`;
}

function breakdownRows(direction, movements) {
  const rows = new Map();
  movements
    .filter(movement => movement.source_type !== "manual_cancelled")
    .filter(movement => direction === "depense" ? Number(movement.amount) < 0 : Number(movement.amount) > 0)
    .forEach(movement => {
      const category = getWalletCategories().find(item => item.id === movement.category_id);
      const key = category ? `category:${category.id}` : `source:${movement.source_type}`;
      const current = rows.get(key) || {
        name: category?.name || SOURCE_LABELS[movement.source_type] || movement.label || "Autre",
        icon: category?.icon || FALLBACK_ICONS[direction],
        total: 0,
        count: 0,
      };
      current.total += Math.abs(Number(movement.amount));
      current.count += 1;
      rows.set(key, current);
    });
  return [...rows.values()].sort((a, b) => b.total - a.total);
}

function renderBreakdown(direction, movements) {
  const rows = breakdownRows(direction, movements);
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  const title = direction === "depense" ? "Récapitulatif des dépenses" : "Récapitulatif des revenus";
  if (!rows.length) return `<div class="finance-breakdown"><div class="finance-breakdown-head"><strong>${title}</strong><span>0,00 MAD</span></div><div class="finance-breakdown-empty">Aucune donnée pour cette sélection.</div></div>`;
  return `<div class="finance-breakdown ${direction}">
    <div class="finance-breakdown-head"><strong>${title}</strong><span>${money(total)} MAD · ${rows.reduce((sum, row) => sum + row.count, 0)} opération${rows.reduce((sum, row) => sum + row.count, 0) > 1 ? "s" : ""}</span></div>
    ${rows.map(row => {
      const percentage = total > 0 ? (row.total / total) * 100 : 0;
      return `<div class="finance-breakdown-row">
        <span class="finance-breakdown-icon">${esc(row.icon)}</span>
        <div class="finance-breakdown-main"><div><strong>${esc(row.name)}</strong><span>${money(row.total)} MAD · ${Math.round(percentage)}%</span></div><div class="finance-breakdown-track"><i style="width:${percentage}%"></i></div></div>
      </div>`;
    }).join("")}
  </div>`;
}

function eventStatus(event) {
  const now = Date.now();
  if (now < new Date(event.starts_at).getTime()) return { key: "upcoming", label: "À venir" };
  if (now > new Date(event.ends_at).getTime()) return { key: "ended", label: "Terminé" };
  return { key: "active", label: "En cours" };
}

function formatEventDate(value) {
  return new Date(value).toLocaleString("fr-FR", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function movementsForEvent(eventId) {
  return getFinancialHistory().filter(movement => movement.event_id === eventId);
}

function eventSummary(eventId) {
  const movements = movementsForEvent(eventId).filter(movement => movement.source_type !== "manual_cancelled");
  const revenue = movements.filter(movement => Number(movement.amount) > 0).reduce((sum, movement) => sum + Number(movement.amount), 0);
  const expense = movements.filter(movement => Number(movement.amount) < 0).reduce((sum, movement) => sum + Math.abs(Number(movement.amount)), 0);
  return { movements, revenue, expense, net: revenue - expense };
}

function renderEventsTab() {
  if (!areFinanceEventsAvailable()) {
    return `<div class="finance-event-setup"><span>🗓️</span><h2>Configuration nécessaire</h2><p>Exécutez <strong>supabase/events_upgrade.sql</strong> dans Supabase pour activer les événements.</p></div>`;
  }
  const events = getFinanceEvents();
  return `<div class="finance-events-page">
    <div class="finance-events-header"><div><h2>Mes événements</h2><p>Regroupez les mouvements d’une période précise.</p></div><button type="button" class="finance-add-btn" data-action="open-add-event">＋ Ajouter</button></div>
    ${events.length ? `<div class="finance-events-list">${events.map(renderEventCard).join("")}</div>` : `<button type="button" class="finance-empty" data-action="open-add-event"><span>🗓️</span><strong>Aucun événement</strong><small>Créez par exemple un voyage ou une fête</small></button>`}
  </div>`;
}

function renderEventCard(event) {
  const status = eventStatus(event);
  const summary = eventSummary(event.id);
  return `<button type="button" class="finance-event-card" data-action="open-event-details" data-event-id="${event.id}">
    <div class="finance-event-card-head"><span class="finance-event-icon">${esc(event.icon || "🗓️")}</span><div><strong>${esc(event.name)}</strong><span>${formatEventDate(event.starts_at)} → ${formatEventDate(event.ends_at)}</span></div><em class="${status.key}">${status.label}</em></div>
    <div class="finance-event-kpis"><span><small>Revenus</small><b class="revenue">+${money(summary.revenue)}</b></span><span><small>Dépenses</small><b class="depense">−${money(summary.expense)}</b></span><span><small>Résultat</small><b class="${summary.net < 0 ? "depense" : "revenue"}">${summary.net < 0 ? "−" : "+"}${money(Math.abs(summary.net))}</b></span></div>
  </button>`;
}

function renderHistory() {
  const history = getFinancialHistory();
  if (!history.length) return `<div class="finance-history-empty"><span>🧾</span><h2>Aucune transaction</h2><p>Les montants ajoutés depuis vos cards apparaîtront ici.</p></div>`;
  return `<div class="finance-history"><div class="finance-history-title"><h2>Dernières transactions</h2><span>${history.length} mouvement${history.length > 1 ? "s" : ""}</span></div><div class="finance-history-list">${history.map(renderHistoryItem).join("")}</div></div>`;
}

function renderHistoryItem(movement) {
  const amount = Number(movement.amount);
  const category = getWalletCategories().find(item => item.id === movement.category_id);
  const direction = amount < 0 ? "depense" : "revenue";
  const name = category?.name || SOURCE_LABELS[movement.source_type] || movement.label || "Transaction";
  const rawDate = movement.occurred_at || movement.created_at || `${movement.movement_date}T12:00:00`;
  const parsedDate = new Date(rawDate);
  const date = Number.isNaN(parsedDate.getTime()) ? movement.movement_date : parsedDate.toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const label = movement.label || "Sans libellé";
  const isCancelled = movement.source_type === "manual_cancelled";
  return `<div class="finance-history-item ${isCancelled ? "is-cancelled" : ""}">
    <span class="finance-history-icon ${direction}">${esc(category?.icon || FALLBACK_ICONS[direction])}</span>
    <div class="finance-history-copy"><strong>${esc(name)}</strong>${isCancelled ? `<span class="finance-cancelled-badge">Annulé</span>` : ""}<span class="finance-history-label">${esc(label)}</span><span>${esc(date)}</span></div>
    <div class="finance-history-right">
      <strong class="finance-history-amount ${direction}">${amount < 0 ? "−" : "+"}${money(Math.abs(amount))} MAD</strong>
      ${movement.source_type === "manual" ? `<button type="button" class="finance-history-cancel" data-action="open-cancel-transaction" data-movement-id="${movement.id}" aria-label="Annuler cette transaction" title="Annuler">↩</button>` : ""}
    </div>
  </div>`;
}

function renderModal() {
  if (ui.modal.type === "quick-amount") return renderQuickAmountModal(ui.modal);
  if (ui.modal.type === "add-category") return renderAddCategoryModal(ui.modal);
  if (ui.modal.type === "edit-category") return renderEditCategoryModal(ui.modal);
  if (ui.modal.type === "delete-category") return renderDeleteCategoryModal(ui.modal);
  if (ui.modal.type === "cancel-transaction") return renderCancelTransactionModal(ui.modal);
  if (ui.modal.type === "add-event") return renderAddEventModal();
  if (ui.modal.type === "event-details") return renderEventDetailsModal(ui.modal);
  return "";
}

function renderQuickAmountModal(modal) {
  const category = getWalletCategories().find(item => item.id === modal.categoryId);
  if (!category) return "";
  const direction = category.direction || "depense";
  const activeEvent = getActiveFinanceEvent();
  return `<div class="overlay" data-overlay-close="modal"><div class="sheet finance-sheet">
    <div class="sheet-title"><span>${esc(category.icon || FALLBACK_ICONS[direction])} ${esc(category.name)}</span><button class="close-btn" data-action="close-modal">✕</button></div>
    <p class="finance-help">${direction === "depense" ? "Ajouter une dépense" : "Ajouter un revenu"} à cette catégorie.</p>
    <form class="form-col" data-form="add-quick-amount" data-category-id="${category.id}" data-direction="${direction}">
      <label class="finance-field-label" for="quick-amount">Montant</label><div class="money-field"><input class="field" id="quick-amount" name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" autofocus required /><span>MAD</span></div>
      <label class="finance-field-label" for="quick-label">Libellé <span>(facultatif)</span></label><input class="field" id="quick-label" name="label" maxlength="120" placeholder="Ex. Facture septembre" />
      ${activeEvent ? `<div class="finance-event-context">${esc(activeEvent.icon || "🗓️")} Sera ajouté à l’événement <strong>${esc(activeEvent.name)}</strong></div>` : ""}
      <button type="submit" class="btn-primary">Ajouter</button>
    </form></div></div>`;
}

function renderAddCategoryModal(modal) {
  const direction = modal.direction || "depense";
  return `<div class="overlay" data-overlay-close="modal"><div class="sheet finance-sheet">
    <div class="sheet-title"><span>Nouvelle catégorie</span><button class="close-btn" data-action="close-modal">✕</button></div>
    <form class="form-col" data-form="add-finance-category">
      <label class="finance-field-label">Nom</label><input class="field" name="name" maxlength="60" placeholder="Ex. Abonnement" required />
      <label class="finance-field-label">Montant initial <span>(facultatif)</span></label><div class="money-field"><input class="field" name="amount" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0" /><span>MAD</span></div>
      <label class="finance-field-label">Libellé <span>(facultatif)</span></label><input class="field" name="label" maxlength="120" placeholder="Ex. Première opération" />
      <div class="finance-zero-hint">Laissez vide pour créer la card avec un montant de 0 MAD.</div>
      <label class="finance-field-label">Type</label><div class="segment-row">
        <button type="button" class="segment ${direction === "depense" ? "active-month" : ""}" data-action="pick-wallet-direction" data-value="depense">Dépense</button>
        <button type="button" class="segment ${direction === "revenue" ? "active-week" : ""}" data-action="pick-wallet-direction" data-value="revenue">Revenu</button></div>
      <input type="hidden" name="direction" value="${direction}" />
      <label class="finance-field-label">Cet élément est-il fixe&nbsp;?</label><div class="segment-row">
        <button type="button" class="segment active-month" data-action="pick-fixed" data-value="true">Oui</button>
        <button type="button" class="segment" data-action="pick-fixed" data-value="false">Non</button></div>
      <input type="hidden" name="is_fixed" value="true" />
      <label class="finance-field-label">Icône de votre choix <span>(facultatif)</span></label>${renderIconField("add-category-icon")}
      <button type="submit" class="btn-primary">Créer la catégorie</button>
    </form></div></div>`;
}

function renderIconField(listId, selected = "") {
  const suggestions = ICONS.filter(Boolean).map(icon => `<option value="${esc(icon)}"></option>`).join("");
  return `<div class="finance-icon-field">
    <input class="field" name="icon" value="${esc(selected)}" list="${listId}" maxlength="24" placeholder="Ex. 🎮, 🐱 ou ⭐" autocomplete="off" />
    <datalist id="${listId}">${suggestions}</datalist>
  </div>`;
}

function renderEditCategoryModal(modal) {
  const category = getWalletCategories().find(item => item.id === modal.categoryId);
  if (!category) return "";
  const direction = category.direction || "depense";
  return `<div class="overlay" data-overlay-close="modal"><div class="sheet finance-sheet">
    <div class="sheet-title"><span>Modifier la catégorie</span><button class="close-btn" data-action="close-modal">✕</button></div>
    <form class="form-col" data-form="edit-finance-category" data-category-id="${category.id}" data-direction="${direction}">
      <label class="finance-field-label">Nom</label><input class="field" name="name" maxlength="60" value="${esc(category.name)}" required />
      <label class="finance-field-label">Type</label><div class="finance-readonly-type ${direction}">${direction === "depense" ? "Dépense" : "Revenu"}</div>
      <label class="finance-field-label">Cet élément est-il fixe&nbsp;?</label><div class="segment-row">
        <button type="button" class="segment ${category.is_fixed ? "active-month" : ""}" data-action="pick-fixed" data-value="true">Oui</button>
        <button type="button" class="segment ${category.is_fixed ? "" : "active-month"}" data-action="pick-fixed" data-value="false">Non</button></div>
      <input type="hidden" name="is_fixed" value="${category.is_fixed ? "true" : "false"}" />
      <label class="finance-field-label">Icône de votre choix <span>(facultatif)</span></label>${renderIconField("edit-category-icon", category.icon || "")}
      <button type="submit" class="btn-primary">Enregistrer les modifications</button>
      <button type="button" class="finance-delete-category" data-action="open-delete-category" data-category-id="${category.id}">Supprimer cette catégorie</button>
    </form></div></div>`;
}

function renderDeleteCategoryModal(modal) {
  const category = getWalletCategories().find(item => item.id === modal.categoryId);
  if (!category) return "";
  const hasTransactions = getMovements().some(movement => movement.category_id === category.id);
  return `<div class="overlay" data-overlay-close="modal"><div class="sheet finance-sheet">
    <div class="sheet-title"><span>Supprimer ${esc(category.name)} ?</span><button class="close-btn" data-action="close-modal">✕</button></div>
    ${hasTransactions
      ? `<div class="finance-delete-warning"><strong>Suppression impossible</strong><p>Cette catégorie contient des transactions. Vous pouvez la renommer ou modifier son statut fixe, mais son historique doit être conservé.</p></div>`
      : `<p class="finance-help">Cette catégorie n’a aucune transaction. Sa suppression sera définitive.</p>`}
    <div class="btn-row">
      ${hasTransactions ? "" : `<button type="button" class="btn-danger" data-action="confirm-delete-category" data-category-id="${category.id}">Supprimer définitivement</button>`}
      <button type="button" class="btn-secondary" data-action="close-modal">${hasTransactions ? "Fermer" : "Annuler"}</button>
    </div></div></div>`;
}

function renderCancelTransactionModal(modal) {
  const movement = getMovements().find(item => item.id === modal.movementId);
  if (!movement || movement.source_type !== "manual") return "";
  const category = getWalletCategories().find(item => item.id === movement.category_id);
  const amount = Number(movement.amount);
  const direction = amount < 0 ? "dépense" : "revenu";
  return `<div class="overlay" data-overlay-close="modal"><div class="sheet finance-sheet">
    <div class="sheet-title"><span>Annuler cette transaction&nbsp;?</span><button class="close-btn" data-action="close-modal">✕</button></div>
    <div class="finance-transaction-confirm">
      <strong>${esc(category?.name || "Transaction")}</strong>
      <span>${esc(movement.label || "Sans libellé")}</span>
      <b class="${amount < 0 ? "depense" : "revenue"}">${amount < 0 ? "−" : "+"}${money(Math.abs(amount))} MAD</b>
    </div>
    <p class="finance-help">La transaction restera visible dans l’historique avec le statut <strong>Annulé</strong>, mais elle sera retirée du calcul du solde et de tous les totaux.</p>
    <div class="btn-row">
      <button type="button" class="btn-danger" data-action="confirm-cancel-transaction" data-movement-id="${movement.id}">Confirmer l’annulation</button>
      <button type="button" class="btn-secondary" data-action="close-modal">Conserver</button>
    </div></div></div>`;
}

function datetimeLocalValue(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function renderAddEventModal() {
  const start = new Date();
  start.setMinutes(Math.ceil(start.getMinutes() / 15) * 15, 0, 0);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return `<div class="overlay" data-overlay-close="modal"><div class="sheet finance-sheet">
    <div class="sheet-title"><span>Nouvel événement</span><button class="close-btn" data-action="close-modal">✕</button></div>
    <p class="finance-help">Les dépenses et revenus enregistrés pendant cette période seront regroupés automatiquement.</p>
    <form class="form-col" data-form="add-finance-event">
      <label class="finance-field-label">Nom</label><input class="field" name="name" maxlength="80" placeholder="Ex. Voyage à Marrakech" required />
      <label class="finance-field-label">Icône <span>(facultatif)</span></label>${renderIconField("add-event-icon")}
      <label class="finance-field-label">Début</label><input class="field" name="starts_at" type="datetime-local" value="${datetimeLocalValue(start)}" required />
      <label class="finance-field-label">Fin</label><input class="field" name="ends_at" type="datetime-local" value="${datetimeLocalValue(end)}" required />
      <button type="submit" class="btn-primary">Créer l’événement</button>
    </form></div></div>`;
}

function renderEventDetailsModal(modal) {
  const event = getFinanceEvents().find(item => item.id === modal.eventId);
  if (!event) return "";
  const summary = eventSummary(event.id);
  const history = movementsForEvent(event.id);
  const status = eventStatus(event);
  return `<div class="overlay" data-overlay-close="modal"><div class="sheet finance-sheet finance-event-detail-sheet">
    <div class="sheet-title"><span>${esc(event.icon || "🗓️")} ${esc(event.name)}</span><button class="close-btn" data-action="close-modal">✕</button></div>
    <div class="finance-event-detail-period"><span class="finance-event-status ${status.key}">${status.label}</span><p>${formatEventDate(event.starts_at)}<br>→ ${formatEventDate(event.ends_at)}</p></div>
    <div class="finance-event-detail-kpis"><div><span>Revenus</span><strong class="revenue">+${money(summary.revenue)} MAD</strong></div><div><span>Dépenses</span><strong class="depense">−${money(summary.expense)} MAD</strong></div><div><span>Résultat</span><strong class="${summary.net < 0 ? "depense" : "revenue"}">${summary.net < 0 ? "−" : "+"}${money(Math.abs(summary.net))} MAD</strong></div></div>
    ${renderBreakdown("depense", history)}
    ${renderBreakdown("revenue", history)}
    <div class="finance-event-history-title">Transactions <span>${history.length}</span></div>
    ${history.length ? `<div class="finance-history-list">${history.map(renderHistoryItem).join("")}</div>` : `<div class="finance-breakdown-empty">Aucune transaction associée.</div>`}
  </div></div>`;
}
