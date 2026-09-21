import { ui } from "./data.js";
import {
  getFinancialHistory, getFinancialOverview, getUserWalletCategories,
  getWalletCategories, hasOpeningBalance, SOURCE_LABELS, totalForCategory,
} from "../shared/wallet.js";
import { esc, money } from "../shared/utils.js";

const FALLBACK_ICONS = { depense: "💳", revenue: "💰" };

export function render() {
  const controls = document.getElementById("maison-controls");
  if (controls) controls.style.display = "none";
  document.getElementById("header-title").textContent = "Mes finances";
  document.getElementById("subtabs").innerHTML = `
    <button class="subtab ${ui.subTab === "dashboard" ? "active" : ""}" data-action="set-subtab" data-tab="dashboard">Vue globale</button>
    <button class="subtab ${ui.subTab === "history" ? "active" : ""}" data-action="set-subtab" data-tab="history">Historique</button>`;
  document.getElementById("main").innerHTML = ui.subTab === "history" ? renderHistory() : renderDashboard();
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
    <button type="button" class="finance-category-card ${direction}" data-action="open-quick-amount" data-category-id="${category.id}">
      <span class="finance-category-icon">${esc(category.icon || FALLBACK_ICONS[direction])}</span>
      ${category.is_fixed ? `<span class="finance-fixed-badge">Fixe</span>` : ""}
      <span class="finance-category-name">${esc(category.name)}</span>
      <strong>${money(totalForCategory(category.id))} MAD</strong>
      <small>${direction === "depense" ? "dépensé" : "reçu"}</small>
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
  return `<div class="finance-history-item"><span class="finance-history-icon ${direction}">${esc(category?.icon || FALLBACK_ICONS[direction])}</span><div class="finance-history-copy"><strong>${esc(name)}</strong><span>${esc(date)}</span></div><strong class="finance-history-amount ${direction}">${amount < 0 ? "−" : "+"}${money(Math.abs(amount))} MAD</strong></div>`;
}

function renderModal() {
  if (ui.modal.type === "quick-amount") return renderQuickAmountModal(ui.modal);
  if (ui.modal.type === "add-category") return renderAddCategoryModal(ui.modal);
  return "";
}

function renderQuickAmountModal(modal) {
  const category = getWalletCategories().find(item => item.id === modal.categoryId);
  if (!category) return "";
  const direction = category.direction || "depense";
  return `<div class="overlay" data-overlay-close="modal"><div class="sheet finance-sheet">
    <div class="sheet-title"><span>${esc(category.icon || FALLBACK_ICONS[direction])} ${esc(category.name)}</span><button class="close-btn" data-action="close-modal">✕</button></div>
    <p class="finance-help">${direction === "depense" ? "Ajouter une dépense" : "Ajouter un revenu"} à cette catégorie.</p>
    <form class="form-col" data-form="add-quick-amount" data-category-id="${category.id}" data-direction="${direction}">
      <label class="finance-field-label" for="quick-amount">Montant</label><div class="money-field"><input class="field" id="quick-amount" name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" autofocus required /><span>MAD</span></div>
      <button type="submit" class="btn-primary">Ajouter</button>
    </form></div></div>`;
}

function renderAddCategoryModal(modal) {
  const direction = modal.direction || "depense";
  return `<div class="overlay" data-overlay-close="modal"><div class="sheet finance-sheet">
    <div class="sheet-title"><span>Nouvelle catégorie</span><button class="close-btn" data-action="close-modal">✕</button></div>
    <form class="form-col" data-form="add-finance-category">
      <label class="finance-field-label">Nom</label><input class="field" name="name" maxlength="60" placeholder="Ex. Abonnement" required />
      <label class="finance-field-label">Montant initial</label><div class="money-field"><input class="field" name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" required /><span>MAD</span></div>
      <label class="finance-field-label">Type</label><div class="segment-row">
        <button type="button" class="segment ${direction === "depense" ? "active-month" : ""}" data-action="pick-wallet-direction" data-value="depense">Dépense</button>
        <button type="button" class="segment ${direction === "revenue" ? "active-week" : ""}" data-action="pick-wallet-direction" data-value="revenue">Revenu</button></div>
      <input type="hidden" name="direction" value="${direction}" />
      <label class="finance-field-label">Cet élément est-il fixe&nbsp;?</label><div class="segment-row">
        <button type="button" class="segment active-month" data-action="pick-fixed" data-value="true">Oui</button>
        <button type="button" class="segment" data-action="pick-fixed" data-value="false">Non</button></div>
      <input type="hidden" name="is_fixed" value="true" />
      <label class="finance-field-label">Icône <span>(facultatif)</span></label><select class="field" name="icon">
        <option value="">Icône automatique</option><option>💧</option><option>⚡</option><option>📶</option><option>🏠</option><option>🛒</option><option>🚌</option><option>💼</option><option>🎁</option><option>🍽️</option><option>🎓</option><option>💊</option><option>💰</option></select>
      <button type="submit" class="btn-primary">Créer et ajouter</button>
    </form></div></div>`;
}
