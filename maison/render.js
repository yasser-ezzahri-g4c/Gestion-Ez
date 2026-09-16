import {
  state, ui,
  monthSpentTotal, weekSpentTotal, achatsRecap, isPurchaseEditable,
  getPeriodDisplayRows, getAvailableCategoriesForPeriod,
  isPeriodCategoryAssigned, totalForPeriodRow, purchasesForPeriodRow,
} from "./data.js";
import { isAdmin } from "../shared/auth.js";
import {
  activeMonthKey, addDays, esc, formatDateFull, formatDateShort,
  getWeekNumberInMonth, getWeekStart, getWeeksOfMonth, monthChipLabel,
  monthLabel, monthsRange, money, parseISODate, toISO,
} from "../shared/utils.js";

export function render() {
  const controls = document.getElementById("maison-controls");
  if (controls) controls.style.display = ui.subTab === "categories" ? "none" : "flex";

  document.getElementById("header-title").textContent =
    ui.subTab === "budget" ? "Gestion course"
      : ui.subTab === "categories" ? "Catégories & lieux"
        : "Enregistrer un achat";
  document.getElementById("month-btn-label").textContent = monthChipLabel(ui.viewedMonthKey);

  document.getElementById("subtabs").innerHTML = `
    <button class="subtab ${ui.subTab === "budget" ? "active" : ""}" data-action="set-subtab" data-tab="budget">Budget</button>
    <button class="subtab ${ui.subTab === "categories" ? "active" : ""}" data-action="set-subtab" data-tab="categories">Catégories</button>
    <button class="subtab ${ui.subTab === "achats" ? "active" : ""}" data-action="set-subtab" data-tab="achats">Achats</button>`;

  const main = document.getElementById("main");
  if (ui.subTab === "budget") main.innerHTML = renderBudgetTab();
  else if (ui.subTab === "categories") main.innerHTML = renderCategoriesTab();
  else main.innerHTML = renderAchatsTab();

  document.getElementById("modal-root").innerHTML =
    ui.monthPanelOpen ? renderMonthPanel() : (ui.modal ? renderModal() : "");
}

function renderBudgetProgress(budget, total, colorVar) {
  const pct = Math.min(100, (total / Number(budget)) * 100);
  const over = total > Number(budget);
  return `
    <div class="progress-row">
      <div class="progress-track">
        <div class="progress-fill" style="width:${pct}%;background:${over ? "var(--danger)" : colorVar}"></div>
      </div>
    </div>
    ${over ? `<div class="small-label danger">Budget dépassé de ${money(total - Number(budget))} DH</div>` : ""}`;
}

function renderBudgetProgressRow(budget, total, colorVar, editBtnHtml) {
  return `
    <div class="progress-edit-row">
      <div class="progress-edit-track">${renderBudgetProgress(budget, total, colorVar)}</div>
      ${editBtnHtml || ""}
    </div>`;
}

function renderBudgetEditBtn(budgetType, attrs) {
  if (!isAdmin) return "";
  return `<button type="button" class="icon-btn edit" data-action="open-edit-budget" data-budget-type="${budgetType}" ${attrs} title="Modifier">✏️</button>`;
}

function renderExpandableAddCard(key, title, bodyHtml) {
  const open = ui.expanded.has(key);
  return `
    <div class="card card-add">
      <div class="card-head" data-action="toggle-card" data-key="${key}">
        <div class="card-title">${title}</div>
        <span class="chevron">${open ? "▲" : "▼"}</span>
      </div>
      <div class="card-body ${open ? "open" : ""}">${bodyHtml}</div>
    </div>`;
}

function renderBudgetTab() {
  return renderMonthAccordion(ui.viewedMonthKey);
}

function renderMonthAccordion(monthKey) {
  const isActiveMonth = monthKey === activeMonthKey();
  const monthBudget = state.monthlyBudgets[monthKey];
  const monthTotal = monthSpentTotal(monthKey);
  const monthKeyStr = "month:" + monthKey;
  const monthOpen = ui.expanded.has(monthKeyStr);
  const canEditMonth = isActiveMonth && monthBudget !== undefined;

  const monthCard = `
    <div class="card" style="border-color:var(--month)">
      <div class="card-head" data-action="${monthBudget === undefined ? "toggle-card" : ""}" data-key="${monthKeyStr}">
        <div>
          <div class="card-title" style="color:var(--month)">Budget mensuel</div>
          <div class="card-range">${monthLabel(monthKey)}</div>
          <span class="badge ${isActiveMonth ? "badge-current" : "badge-past"}">${isActiveMonth ? "Mois en cours" : "Consultation"}</span>
          ${monthBudget !== undefined && monthTotal > Number(monthBudget) ? `<span class="badge badge-danger">Dépassé</span>` : ""}
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <div class="card-preview">${monthBudget !== undefined ? money(monthBudget) + " DH<br><span class=\"small-label\">Consommé : " + money(monthTotal) + " DH</span>" : "budget non défini"}</div>
          ${monthBudget === undefined ? `<span class="chevron">${monthOpen ? "▲" : "▼"}</span>` : ""}
        </div>
      </div>
      <div class="card-body ${monthBudget !== undefined || monthOpen ? "open" : ""}">
        ${monthBudget === undefined ? (
    isActiveMonth ? `
          <form class="inline-form" data-form="set-month-budget">
            <input class="field" name="amount" type="number" min="0" step="0.01" placeholder="Définir le budget en DH" required />
            <button type="submit" class="btn-small" style="background:var(--month)">Fixer</button>
          </form>` : `<div class="small-label">Budget non défini pour ce mois.</div>`
  ) : `
          ${renderBudgetProgressRow(monthBudget, monthTotal, "var(--month)", canEditMonth ? renderBudgetEditBtn("month", `data-month-key="${monthKey}"`) : "")}
        `}
      </div>
    </div>`;

  const weeks = getWeeksOfMonth(monthKey);
  const todayWeekISO = toISO(getWeekStart(new Date()));

  const weekCards = weeks.map(wStart => {
    const isoWs = toISO(wStart), isoWe = toISO(addDays(wStart, 6));
    const n = getWeekNumberInMonth(wStart);
    let status;
    if (!isActiveMonth) status = "past";
    else if (isoWs === todayWeekISO) status = "current";
    else if (isoWs < todayWeekISO) status = "past";
    else status = "future";

    const budget = state.weeklyBudgets[isoWs];
    const total = weekSpentTotal(isoWs, isoWe);
    const key = "week:" + isoWs;
    const canToggle = status !== "future" && budget === undefined;
    const open = budget !== undefined ? status !== "future" : (canToggle && ui.expanded.has(key));
    const canEditWeek = status === "current" && budget !== undefined;

    return `
      <div class="card ${status === "future" ? "disabled" : ""}" style="border-color:var(--week)">
        <div class="card-head" data-action="${canToggle ? "toggle-card" : ""}" data-key="${key}">
          <div>
            <div class="card-title" style="color:var(--week)">Semaine ${n}</div>
            <div class="card-range">${formatDateShort(wStart)} → ${formatDateShort(addDays(wStart, 6))}</div>
            <span class="badge ${status === "current" ? "badge-current" : status === "past" ? "badge-past" : "badge-future"}">${status === "current" ? "Semaine active" : status === "past" ? "Consultation" : "Verrouillée"}</span>
            ${budget !== undefined && total > Number(budget) ? `<span class="badge badge-danger">Dépassé</span>` : ""}
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="card-preview">${budget !== undefined ? money(budget) + " DH<br><span class=\"small-label\">Consommé : " + money(total) + " DH</span>" : "budget non défini"}</div>
            ${canToggle ? `<span class="chevron">${open ? "▲" : "▼"}</span>` : ""}
          </div>
        </div>
        <div class="card-body ${open ? "open" : ""}">
          ${budget === undefined ? (
      status === "current" ? `
            <form class="inline-form" data-form="set-week-budget" data-week-start="${isoWs}">
              <input class="field" name="amount" type="number" min="0" step="0.01" placeholder="Définir le budget en DH" required />
              <button type="submit" class="btn-small" style="background:var(--week)">Fixer</button>
            </form>` : `<div class="small-label">Budget non défini pour cette semaine.</div>`
    ) : `
            ${renderBudgetProgressRow(budget, total, "var(--week)", canEditWeek ? renderBudgetEditBtn("week", `data-week-start="${isoWs}"`) : "")}
          `}
        </div>
      </div>`;
  }).join("");

  return `<div class="stack">${monthCard}${weekCards}</div>`;
}

function renderRemainingLabel(budget, spent) {
  const remaining = Number(budget) - spent;
  const cls = remaining < 0 ? "danger" : "success";
  return `<div class="small-label ${cls}">Reste : ${money(remaining)} DH</div>`;
}

function renderPeriodCategoryPicker(type, periodKey) {
  if (!isAdmin) return "";
  const available = getAvailableCategoriesForPeriod(type, periodKey);
  if (available.length === 0) return "";
  const ctxAttr = type === "mensuel" ? `data-month-key="${periodKey}"` : `data-week-start="${periodKey}"`;
  const chipClass = type === "mensuel" ? "chip-pick-month" : "chip-pick-week";
  return `
    <div class="period-cat-picker">
      <div class="chip-row period-cat-scroll">
        ${available.map(c => `
          <button type="button" class="chip chip-pick ${chipClass}" data-action="assign-category" data-category-id="${c.id}" data-type="${type}" ${ctxAttr}>${esc(c.name)}</button>
        `).join("")}
      </div>
    </div>`;
}

function renderPeriodRow(row, type, editable, ctx, pastOnly = false) {
  const periodKey = type === "mensuel" ? ctx.monthKey : ctx.weekStart;
  const total = totalForPeriodRow(row, type, periodKey);
  if (pastOnly && total === 0) return "";
  const ctxAttr = type === "mensuel" ? `data-month-key="${ctx.monthKey}"` : `data-week-start="${ctx.weekStart}"`;
  const idAttr = row.categoryId ? `data-category-id="${row.categoryId}"` : `data-category-name="${esc(row.name)}"`;
  const canAdd = editable && !pastOnly && row.categoryId;
  const canUnassign = editable && !pastOnly && row.categoryId
    && isPeriodCategoryAssigned(type, periodKey, row.categoryId)
    && total === 0;
  return `
    <li class="item-row${row.orphanOnly ? " item-row-orphan" : ""}">
      <div class="item-name">${esc(row.name)}</div>
      <div class="item-amount">${money(total)} DH</div>
      <div class="item-actions">
        <button type="button" class="icon-btn" data-action="open-details" data-type="${type}" ${idAttr} ${ctxAttr} title="Détails">🧾</button>
        ${canAdd ? `<button type="button" class="icon-btn add" data-action="open-add-purchase" data-category-id="${row.categoryId}" data-type="${type}" ${ctxAttr} title="Ajouter">＋</button>` : ""}
        ${canUnassign ? `<button type="button" class="btn-delete" data-action="unassign-category" data-category-id="${row.categoryId}" data-type="${type}" ${ctxAttr} title="Retirer">✕</button>` : ""}
      </div>
    </li>`;
}

function renderCategoryRow(c) {
  return `
    <li class="list-item">
      <div class="list-item-name">${esc(c.name)}</div>
      <div class="list-item-right">
        <button class="icon-btn edit" data-action="open-edit-category" data-category-id="${c.id}" title="Modifier">✏️</button>
        ${isAdmin ? `<button class="btn-delete" data-action="open-delete-confirm" data-entity="category" data-id="${c.id}" data-label="${esc(c.name)}" title="Supprimer">🗑️</button>` : ""}
      </div>
    </li>`;
}

function renderPlaceRow(p) {
  const canDelete = !state.purchases.some(x => x.place_id === p.id);
  return `
    <li class="list-item">
      <div class="list-item-name">${esc(p.name)}</div>
      <div class="list-item-right">
        <button class="icon-btn edit" data-action="open-edit-place" data-place-id="${p.id}" title="Modifier">✏️</button>
        ${canDelete ? `<button class="btn-delete" data-action="open-delete-confirm" data-entity="place" data-id="${p.id}" data-label="${esc(p.name)}" title="Supprimer">🗑️</button>` : ""}
      </div>
    </li>`;
}

function renderCategoriesTab() {
  const hebdo = state.categories.filter(c => c.type === "hebdo");
  const mensuel = state.categories.filter(c => c.type === "mensuel");
  const hebdoOpen = ui.expanded.has("cats:hebdo");
  const mensuelOpen = ui.expanded.has("cats:mensuel");
  const placesOpen = ui.expanded.has("places:list");

  const addCatForm = `
    <form class="form-col" data-form="add-category">
      <input class="field" name="name" placeholder="Nom de la catégorie" required />
      <div class="segment-row">
        <button type="button" class="segment active-month" data-action="pick-cat-type" data-value="mensuel">Mensuel</button>
        <button type="button" class="segment" data-action="pick-cat-type" data-value="hebdo">Hebdo</button>
      </div>
      <input type="hidden" name="type" value="mensuel" />
      <button type="submit" class="btn-primary">Ajouter la catégorie</button>
    </form>`;

  const addPlaceForm = `
    <form class="inline-form" data-form="add-place">
      <input class="field" name="name" placeholder="Nom du lieu" required />
      <button type="submit" class="btn-small" style="background:var(--month)">Ajouter</button>
    </form>`;

  return `
    <div class="stack">
      ${renderExpandableAddCard("cats:add", "Ajouter une catégorie", addCatForm)}
      <div class="card" style="border-color:var(--month)">
        <div class="card-head" data-action="toggle-card" data-key="cats:mensuel">
          <div class="card-title" style="color:var(--month)">Catégories mensuelles</div>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="card-preview">${mensuel.length} catégorie${mensuel.length > 1 ? "s" : ""}</div>
            <span class="chevron">${mensuelOpen ? "▲" : "▼"}</span>
          </div>
        </div>
        <div class="card-body ${mensuelOpen ? "open" : ""}">
          ${mensuel.length === 0 ? `<div class="small-label">Aucune catégorie mensuelle.</div>` : `<ul class="list">${mensuel.map(renderCategoryRow).join("")}</ul>`}
        </div>
      </div>
      <div class="card" style="border-color:var(--week)">
        <div class="card-head" data-action="toggle-card" data-key="cats:hebdo">
          <div class="card-title" style="color:var(--week)">Catégories hebdo</div>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="card-preview">${hebdo.length} catégorie${hebdo.length > 1 ? "s" : ""}</div>
            <span class="chevron">${hebdoOpen ? "▲" : "▼"}</span>
          </div>
        </div>
        <div class="card-body ${hebdoOpen ? "open" : ""}">
          ${hebdo.length === 0 ? `<div class="small-label">Aucune catégorie hebdo.</div>` : `<ul class="list">${hebdo.map(renderCategoryRow).join("")}</ul>`}
        </div>
      </div>
      ${renderExpandableAddCard("places:add", "Ajouter un lieu", addPlaceForm)}
      <div class="card card-list-neutral">
        <div class="card-head" data-action="toggle-card" data-key="places:list">
          <div class="card-title">Lieux d'achat</div>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="card-preview">${state.places.length} lieu${state.places.length > 1 ? "x" : ""}</div>
            <span class="chevron">${placesOpen ? "▲" : "▼"}</span>
          </div>
        </div>
        <div class="card-body ${placesOpen ? "open" : ""}">
          ${state.places.length === 0 ? `<div class="small-label">Aucun lieu créé.</div>` : `<ul class="list">${state.places.map(renderPlaceRow).join("")}</ul>`}
        </div>
      </div>
    </div>`;
}

function renderUtilityKvRow(label, value, bold = false) {
  return `
    <div class="utility-kv-row${bold ? " utility-kv-row-bold" : ""}">
      <span>${label}</span>
      <span>${value}</span>
    </div>`;
}

function renderAchatsRecapCard(monthKey) {
  const key = "achat-recap:" + monthKey;
  const open = ui.expanded.has(key);
  const r = achatsRecap(monthKey);

  return `
    <div class="card">
      <div class="card-head" data-action="toggle-card" data-key="${key}">
        <div class="card-title">Récapitulatif</div>
        <span class="chevron">${open ? "▲" : "▼"}</span>
      </div>
      <div class="card-body ${open ? "open" : ""}">
        <div class="utility-recap-block">
          <div class="utility-recap-section-title">Gain Mensuel</div>
          ${renderUtilityKvRow("Consommation", `${money(r.monthConso)} DH`)}
          ${renderUtilityKvRow("Gain", `${money(r.monthGain)} DH`)}
          <hr class="utility-recap-sep" />
          <div class="utility-recap-section-title">Gain Semaines</div>
          ${renderUtilityKvRow("Consommation", `${money(r.weekConso)} DH`)}
          ${renderUtilityKvRow("Gain", `${money(r.weekGain)} DH`)}
          <hr class="utility-recap-sep" />
          ${renderUtilityKvRow("Total Consommation", `${money(r.totalConso)} DH`, true)}
          ${renderUtilityKvRow("Total Gain", `${money(r.totalGain)} DH`, true)}
        </div>
      </div>
    </div>`;
}

function renderAchatsTab() {
  const monthKey = ui.viewedMonthKey;
  const isActiveMonth = monthKey === activeMonthKey();
  const monthBudget = state.monthlyBudgets[monthKey];
  const monthTotal = monthSpentTotal(monthKey);
  const monthKeyStr = "achat-month:" + monthKey;
  const monthOpen = monthBudget !== undefined && ui.expanded.has(monthKeyStr);
  const monthRows = getPeriodDisplayRows("mensuel", monthKey);
  const monthOver = monthBudget !== undefined && monthTotal > Number(monthBudget);
  const monthRemaining = monthBudget !== undefined ? Number(monthBudget) - monthTotal : 0;
  const monthRemCls = monthRemaining < 0 ? "danger" : "success";

  const monthCard = `
    <div class="card" style="border-color:var(--month)">
      <div class="card-head" data-action="${monthBudget !== undefined ? "toggle-card" : ""}" data-key="${monthKeyStr}">
        <div>
          <div class="card-title" style="color:var(--month)">Achat Mensuel</div>
          <div class="card-range">${monthLabel(monthKey)}</div>
          <span class="badge ${isActiveMonth ? "badge-current" : "badge-past"}">${isActiveMonth ? "Mois en cours" : "Consultation"}</span>
          ${monthOver ? `<span class="badge badge-danger">Dépassé</span>` : ""}
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <div class="card-preview">${monthBudget !== undefined ? `<span class="small-label">Consommé : ${money(monthTotal)} DH</span>` : "Budget non défini"}${monthBudget !== undefined ? `<br><span class="small-label ${monthRemCls}">Reste : ${money(monthRemaining)} DH</span>` : ""}</div>
          ${monthBudget !== undefined ? `<span class="chevron">${monthOpen ? "▲" : "▼"}</span>` : ""}
        </div>
      </div>
      ${monthBudget === undefined ? `
        <div style="padding:0 16px 16px" class="small-label">Définis d'abord le budget de ce mois dans l'onglet Budget.</div>
      ` : `
        <div class="card-body ${monthOpen ? "open" : ""}">
          ${monthOver ? `<div class="alert-banner">Budget mensuel dépassé !</div>` : ""}
          ${renderPeriodCategoryPicker("mensuel", monthKey)}
          ${state.categories.filter(c => c.type === "mensuel").length === 0 && monthRows.length === 0 ? `<div class="small-label">Aucune catégorie mensuelle créée.</div>` : monthRows.length === 0 ? `<div class="small-label">Sélectionne une catégorie ci-dessus.</div>` : `
            <ul class="list">${monthRows.map(r => renderPeriodRow(r, "mensuel", isActiveMonth, { monthKey })).join("")}</ul>`}
        </div>
      `}
    </div>`;

  const weeks = getWeeksOfMonth(monthKey);
  const todayWeekISO = toISO(getWeekStart(new Date()));
  const weekCards = weeks.map(wStart => {
    const isoWs = toISO(wStart), isoWe = toISO(addDays(wStart, 6));
    const n = getWeekNumberInMonth(wStart);
    let status;
    if (!isActiveMonth) status = "past";
    else if (isoWs === todayWeekISO) status = "current";
    else if (isoWs < todayWeekISO) status = "past";
    else status = "future";

    const budget = state.weeklyBudgets[isoWs];
    const total = weekSpentTotal(isoWs, isoWe);
    const key = "achat-week:" + isoWs;
    const isPast = status === "past";
    const canExpand = status !== "future" && budget !== undefined;
    const open = canExpand && ui.expanded.has(key);
    const weekOver = budget !== undefined && total > Number(budget);
    const remaining = budget !== undefined ? Number(budget) - total : 0;
    const remCls = remaining < 0 ? "danger" : "success";
    const weekRows = getPeriodDisplayRows("hebdo", isoWs);
    const catRows = weekRows.map(r => renderPeriodRow(r, "hebdo", status === "current", { weekStart: isoWs }, isPast)).filter(Boolean).join("");
    const hasCatRows = catRows.length > 0;
    const hasPurchases = total > 0;
    const isCurrent = status === "current";
    const canShowWeekBody = canExpand && (isCurrent || hasCatRows || hasPurchases);

    return `
      <div class="card ${status === "future" ? "disabled" : ""}" style="border-color:var(--week)">
        <div class="card-head" data-action="${canShowWeekBody ? "toggle-card" : ""}" data-key="${key}">
          <div>
            <div class="card-title" style="color:var(--week)">Achat Semaine ${n}</div>
            <div class="card-range">${formatDateShort(wStart)} → ${formatDateShort(addDays(wStart, 6))}</div>
            <span class="badge ${status === "current" ? "badge-current" : status === "past" ? "badge-past" : "badge-future"}">${status === "current" ? "Semaine active" : status === "past" ? "Consultation" : "Verrouillée"}</span>
            ${weekOver ? `<span class="badge badge-danger">Dépassé</span>` : ""}
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="card-preview">${status === "future" ? "" : budget !== undefined ? `<span class="small-label">Consommé : ${money(total)} DH</span><br><span class="small-label ${remCls}">Reste : ${money(remaining)} DH</span>` : "Budget non défini"}</div>
            ${canShowWeekBody ? `<span class="chevron">${open ? "▲" : "▼"}</span>` : ""}
          </div>
        </div>
        ${status !== "future" && budget === undefined ? `
          <div style="padding:0 16px 16px" class="small-label">Définis d'abord le budget de cette semaine dans l'onglet Budget.</div>
        ` : status !== "future" && isCurrent ? `
          <div class="card-body ${open ? "open" : ""}">
            ${weekOver ? `<div class="alert-banner">Budget hebdo dépassé !</div>` : ""}
            ${renderPeriodCategoryPicker("hebdo", isoWs)}
            ${state.categories.filter(c => c.type === "hebdo").length === 0 && weekRows.length === 0 ? `<div class="small-label">Aucune catégorie hebdo créée.</div>` : weekRows.length === 0 ? `<div class="small-label">Sélectionne une catégorie ci-dessus.</div>` : `
              <ul class="list">${catRows}</ul>`}
          </div>
        ` : status !== "future" && isPast && canShowWeekBody ? `
          <div class="card-body ${open ? "open" : ""}">
            ${weekOver ? `<div class="alert-banner">Budget hebdo dépassé !</div>` : ""}
            <ul class="list">${catRows}</ul>
          </div>
        ` : status !== "future" && isPast ? `
          <div style="padding:0 16px 16px" class="small-label">Aucun achat enregistré.</div>
        ` : ""}
      </div>`;
  }).join("");

  return `<div class="stack">${monthCard}${weekCards}${renderAchatsRecapCard(monthKey)}</div>`;
}

function renderMonthPanel() {
  const active = activeMonthKey();
  const months = monthsRange();
  return `
    <div class="overlay" data-overlay-close="month">
      <div class="sheet">
        <div class="sheet-title">Choisir un mois <button class="close-btn" data-action="close-month-panel">✕</button></div>
        <div class="chip-row">
          ${months.map(mk => {
    const isFuture = mk > active;
    const isActive = mk === active;
    const isSelected = mk === ui.viewedMonthKey && !isActive;
    const cls = isFuture ? "chip is-disabled" : isActive ? "chip is-active" : isSelected ? "chip is-selected" : "chip";
    return `<button class="${cls}" ${isFuture ? "" : `data-action="select-month" data-month="${mk}"`}>${monthChipLabel(mk)}</button>`;
  }).join("")}
        </div>
      </div>
    </div>`;
}

function renderModal() {
  const m = ui.modal;
  if (m.type === "confirm-delete") return renderConfirmDeleteModal(m);
  if (m.type === "edit-budget") return renderEditBudgetModal(m);
  if (m.type === "edit-category") return renderEditCategoryModal(m);
  if (m.type === "edit-place") return renderEditPlaceModal(m);
  if (m.type === "edit-purchase") return renderEditPurchaseModal(m);

  if (m.type === "add") {
    const cat = state.categories.find(c => c.id === m.categoryId);
    if (!cat) return "";
    return `
      <div class="overlay" data-overlay-close="modal">
        <div class="sheet">
          <div class="sheet-title">${esc(cat.name)} <button class="close-btn" data-action="close-modal">✕</button></div>
          ${state.places.length === 0 ? `<div class="small-label">Ajoute d'abord un lieu d'achat dans l'onglet Catégories.</div>` : `
            <form class="form-col" data-form="add-purchase" data-category-id="${cat.id}">
              <input class="field" name="price" type="number" min="0" step="0.01" placeholder="Prix en DH" required />
              <select class="field" name="place" required>
                <option value="">Choisir un lieu…</option>
                ${state.places.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}
              </select>
              <div class="small-label">Date : aujourd'hui (${formatDateFull(new Date())})</div>
              <button type="submit" class="btn-primary">Enregistrer</button>
            </form>`}
        </div>
      </div>`;
  }

  if (m.type === "details") {
    const periodKey = m.periodType === "mensuel" ? m.monthKey : m.weekStart;
    const row = m.categoryId
      ? { name: state.categories.find(c => c.id === m.categoryId)?.name || m.displayName, categoryId: m.categoryId, orphanOnly: false }
      : { name: m.displayName, categoryId: null, orphanOnly: true };
    if (!row.name) return "";

    const list = purchasesForPeriodRow(row, m.periodType, periodKey);
    const total = list.reduce((s, p) => s + Number(p.price), 0);

    return `
      <div class="overlay" data-overlay-close="modal">
        <div class="sheet">
          <div class="sheet-title">${esc(row.name)} — ${money(total)} DH <button class="close-btn" data-action="close-modal">✕</button></div>
          <ul class="list">
            ${list.map(p => {
    const placeName = esc(state.places.find(pl => pl.id === p.place_id)?.name || "Inconnu");
    const editable = m.editable && isPurchaseEditable(p);
    return `
              <li class="list-item" style="flex-direction:column;align-items:stretch;gap:4px">
                <div class="purchase-detail-row">
                  <div>
                    <div class="list-item-name">${money(p.price)} DH — ${placeName}</div>
                    <div class="small-label">${formatDateFull(parseISODate(p.date))}</div>
                  </div>
                  ${editable ? `
                  <div class="purchase-detail-actions">
                    <button class="icon-btn edit" data-action="open-edit-purchase" data-purchase-id="${p.id}" title="Modifier">✏️</button>
                    <button class="btn-delete" data-action="open-delete-confirm" data-entity="purchase" data-id="${p.id}" data-label="${money(p.price)} DH" title="Supprimer">🗑️</button>
                  </div>` : ""}
                </div>
              </li>`;
  }).join("")}
          </ul>
        </div>
      </div>`;
  }

  return "";
}

function renderEditBudgetModal(m) {
  const isMonth = m.budgetType === "month";
  const current = isMonth ? state.monthlyBudgets[m.monthKey] : state.weeklyBudgets[m.weekStart];
  const title = isMonth ? "Modifier budget mensuel" : "Modifier budget hebdo";
  return `
    <div class="overlay" data-overlay-close="modal">
      <div class="sheet">
        <div class="sheet-title">${title} <button class="close-btn" data-action="close-modal">✕</button></div>
        <form class="form-col" data-form="edit-budget" data-budget-type="${m.budgetType}" ${isMonth ? `data-month-key="${m.monthKey}"` : `data-week-start="${m.weekStart}"`}>
          <input class="field" name="amount" type="number" min="0" step="0.01" value="${current}" placeholder="Budget en DH" required />
          <button type="submit" class="btn-primary">Enregistrer</button>
        </form>
      </div>
    </div>`;
}

function renderEditCategoryModal(m) {
  const cat = state.categories.find(c => c.id === m.categoryId);
  if (!cat) return "";
  return `
    <div class="overlay" data-overlay-close="modal">
      <div class="sheet">
        <div class="sheet-title">Modifier catégorie <button class="close-btn" data-action="close-modal">✕</button></div>
        <form class="form-col" data-form="edit-category" data-category-id="${cat.id}">
          <input class="field" name="name" value="${esc(cat.name)}" required />
          <div class="segment-row">
            <button type="button" class="segment ${cat.type === "hebdo" ? "active-week" : ""}" data-action="pick-cat-type" data-value="hebdo">Hebdo</button>
            <button type="button" class="segment ${cat.type === "mensuel" ? "active-month" : ""}" data-action="pick-cat-type" data-value="mensuel">Mensuel</button>
          </div>
          <input type="hidden" name="type" value="${cat.type}" />
          <button type="submit" class="btn-primary">Enregistrer</button>
        </form>
      </div>
    </div>`;
}

function renderEditPlaceModal(m) {
  const place = state.places.find(p => p.id === m.placeId);
  if (!place) return "";
  return `
    <div class="overlay" data-overlay-close="modal">
      <div class="sheet">
        <div class="sheet-title">Modifier lieu <button class="close-btn" data-action="close-modal">✕</button></div>
        <form class="form-col" data-form="edit-place" data-place-id="${place.id}">
          <input class="field" name="name" value="${esc(place.name)}" required />
          <button type="submit" class="btn-primary">Enregistrer</button>
        </form>
      </div>
    </div>`;
}

function renderEditPurchaseModal(m) {
  const p = state.purchases.find(x => x.id === m.purchaseId);
  if (!p) return "";
  return `
    <div class="overlay" data-overlay-close="modal">
      <div class="sheet">
        <div class="sheet-title">Modifier achat <button class="close-btn" data-action="close-modal">✕</button></div>
        <form class="form-col" data-form="edit-purchase" data-purchase-id="${p.id}">
          <input class="field" name="price" type="number" min="0" step="0.01" value="${p.price}" required />
          <select class="field" name="place" required>
            ${state.places.map(pl => `<option value="${pl.id}" ${pl.id === p.place_id ? "selected" : ""}>${esc(pl.name)}</option>`).join("")}
          </select>
          <div class="small-label">Date : ${formatDateFull(parseISODate(p.date))}</div>
          <button type="submit" class="btn-primary">Enregistrer</button>
        </form>
      </div>
    </div>`;
}

function renderConfirmDeleteModal(m) {
  const labels = { purchase: "cet achat", category: "cette catégorie", place: "ce lieu" };
  return `
    <div class="overlay" data-overlay-close="modal">
      <div class="sheet">
        <div class="sheet-title">Confirmer la suppression</div>
        <p class="confirm-text">Voulez-vous vraiment supprimer ${labels[m.entity] || "cet élément"} <strong>${esc(m.label)}</strong> ? Cette action est irréversible.</p>
        <div class="btn-row">
          <button type="button" class="btn-danger" data-action="confirm-delete" data-entity="${m.entity}" data-id="${m.id}">Supprimer</button>
          <button type="button" class="btn-secondary" data-action="close-modal">Annuler</button>
        </div>
      </div>
    </div>`;
}
