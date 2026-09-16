import {
  state, ui,
  personName, getBill, elecReading, waterShare,
  getPrevMeter, isFirstEauMonth, isPrevMonthElecComplete, hasElecSharesCalculated, calcElecConso,
  monthElecStats, monthWaterStats, personRecap, personGlobalSummary,
  recapBadge,
} from "./data.js";
import { isAdmin } from "../shared/auth.js";
import {
  activeMonthKey, esc, EAU_START_MONTH, monthChipLabel, monthLabel,
  monthsRangeFrom, money, previousMonthKey,
} from "../shared/utils.js";

function renderDualProgress(paid, total, paidElec, paidWater) {
  const pct = total > 0 ? Math.min(100, (paid / total) * 100) : 0;
  const elecPct = total > 0 ? Math.min(100, (paidElec / total) * 100) : 0;
  const waterPct = total > 0 ? Math.min(100 - elecPct, (paidWater / total) * 100) : 0;
  return `
    <div class="progress-row">
      <div class="progress-track progress-dual">
        <div class="progress-seg progress-cnss" style="width:${elecPct}%"></div>
        <div class="progress-seg progress-ass" style="width:${waterPct}%"></div>
      </div>
    </div>
    <div class="progress-legend">
      <span><i class="dot dot-cnss"></i> Électricité ${money(paidElec)} DH</span>
      <span><i class="dot dot-ass"></i> Eau ${money(paidWater)} DH</span>
      <span><i class="dot dot-paid"></i> ${money(paid)} DH</span>
    </div>`;
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

function renderPersonSummaryCard(p) {
  const s = personGlobalSummary(p.id);
  return `
    <div class="card" style="border-color:var(--month)">
      <div class="card-head">
        <div>
          <div class="card-title" style="color:var(--month)">Charge à payer</div>
          <span class="badge badge-current">${esc(personName(p))}</span>
        </div>
        <div class="card-preview" style="text-align:right">
          <div><span class="small-label">Électricité :</span> ${money(s.totalElec)} DH</div>
          <div><span class="small-label">Eau :</span> ${money(s.totalWater)} DH</div>
        </div>
      </div>
      <div class="card-body open">
        ${renderDualProgress(s.paidTotal, s.grandTotal, s.paidElec, s.paidWater)}
      </div>
    </div>`;
}

function renderSyntheseTab() {
  if (state.persons.length === 0) {
    return `<div class="small-label">Ajoutez des personnes dans le Référentiel.</div>`;
  }
  return `<div class="stack">${state.persons.map(renderPersonSummaryCard).join("")}</div>`;
}

function renderPersonRow(p) {
  return `
    <li class="list-item">
      <div>
        <div class="list-item-name">${esc(personName(p))}${p.is_app_owner ? ` <span class="badge badge-current">Propriétaire</span>` : ""}</div>
        <div class="small-label">${esc(p.phone || "—")}</div>
      </div>
      <div class="list-item-right">
        ${isAdmin && !p.is_app_owner ? `<button class="icon-btn" data-action="set-app-owner" data-person-id="${p.id}" title="Définir propriétaire app">👤</button>` : ""}
        ${isAdmin ? `<button class="icon-btn edit" data-action="open-edit-person" data-person-id="${p.id}" title="Modifier">✏️</button>` : ""}
      </div>
    </li>`;
}

function renderReferentielTab() {
  const listOpen = ui.expanded.has("ref:persons");
  const addForm = `
    <form class="form-col" data-form="add-person">
      <input class="field" name="first_name" placeholder="Prénom" required />
      <input class="field" name="last_name" placeholder="Nom" required />
      <input class="field" name="phone" placeholder="Numéro de téléphone" />
      <button type="submit" class="btn-primary">Ajouter la personne</button>
    </form>`;

  return `
    <div class="stack">
      ${isAdmin ? renderExpandableAddCard("ref:add-person", "Ajouter une personne", addForm) : ""}
      <div class="card" style="border-color:var(--month)">
        <div class="card-head" data-action="toggle-card" data-key="ref:persons">
          <div class="card-title" style="color:var(--month)">Personnes</div>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="card-preview">${state.persons.length} personne${state.persons.length > 1 ? "s" : ""}</div>
            <span class="chevron">${listOpen ? "▲" : "▼"}</span>
          </div>
        </div>
        <div class="card-body ${listOpen ? "open" : ""}">
          ${state.persons.length === 0
            ? `<div class="small-label">Aucune personne.</div>`
            : `<ul class="list">${state.persons.map(renderPersonRow).join("")}</ul>`}
        </div>
      </div>
    </div>`;
}

function meterPeriodLabels(monthKey) {
  const prevKey = previousMonthKey(monthKey);
  return { prev: monthLabel(prevKey), curr: monthLabel(monthKey) };
}

function renderUtilityKvRow(label, value, bold = false) {
  return `
    <div class="utility-kv-row${bold ? " utility-kv-row-bold" : ""}">
      <span>${label}</span>
      <span>${value}</span>
    </div>`;
}

function renderElecMeterLines(monthKey, prev, curr, labels) {
  if (prev == null && curr == null) return "";
  const lines = [];
  if (prev != null) lines.push(renderUtilityKvRow(`${labels.prev} :`, `${prev} kWh`));
  if (curr != null) lines.push(renderUtilityKvRow(`${labels.curr} :`, `${curr} kWh`));
  return lines.join("");
}

function renderElecPersonBlock(monthKey, p, bill) {
  const reading = bill ? elecReading(bill.id, p.id) : null;
  const isPaid = !!(reading && reading.paid_at);
  const hasMeters = !!(reading && reading.curr_meter != null);
  const labels = meterPeriodLabels(monthKey);
  const prev = hasMeters ? Number(reading.prev_meter) : getPrevMeter(monthKey, p.id);
  const curr = hasMeters ? Number(reading.curr_meter) : null;
  const share = reading ? Number(reading.share_amount) : 0;
  const canEdit = isAdmin && !isPaid;
  const showPrevInput = isFirstEauMonth(monthKey);
  const prevReady = isFirstEauMonth(monthKey) || prev != null;
  const sharesReady = hasElecSharesCalculated(monthKey);

  const meterLines = hasMeters
    ? renderElecMeterLines(monthKey, prev, curr, labels)
    : (!showPrevInput && prev != null ? renderUtilityKvRow(`${labels.prev} :`, `${prev} kWh`) : "");

  const consoLine = hasMeters && prev != null && curr != null
    ? renderUtilityKvRow("Conso :", `${calcElecConso(prev, curr)} kWh`)
    : "";

  const meterForm = !hasMeters && canEdit && prevReady ? `
    <form class="form-col utility-meter-col" data-form="save-elec-meters" data-month-key="${monthKey}" data-person-id="${p.id}">
      ${showPrevInput ? `<input class="field" name="prev_meter" type="number" min="0" step="1" placeholder="${esc(labels.prev)}" value="" required />` : ""}
      <input class="field" name="curr_meter" type="number" min="0" step="1" placeholder="${esc(labels.curr)}" value="" required />
      <button type="submit" class="btn-small" style="background:var(--month)">Enregistrer</button>
    </form>` : "";

  const partLine = sharesReady && share > 0
    ? renderUtilityKvRow("Part :", `${money(share)} DH`, true)
    : "";

  const payBtn = hasMeters && sharesReady && share > 0 && canEdit
    ? `<button type="button" class="btn-small" style="background:var(--month);margin-top:6px;width:100%" data-action="pay-elec" data-month-key="${monthKey}" data-person-id="${p.id}">Payer</button>`
    : "";

  const paidBadge = isPaid ? `<span class="badge badge-current" style="margin-top:6px">Payé</span>` : "";

  return `
    <div class="reimb-block" style="border-color:var(--month)">
      <div class="reimb-title" style="color:var(--month)">${esc(personName(p))}</div>
      ${meterLines}
      ${consoLine}
      ${meterForm}
      ${partLine}
      ${isPaid ? paidBadge : payBtn}
    </div>`;
}

function renderWaterPersonBlock(monthKey, p, bill) {
  const shareRow = bill ? waterShare(bill.id, p.id) : null;
  const isPaid = !!(shareRow && shareRow.paid_at);
  const hasBill = bill?.water_bill_total != null;
  const share = hasBill && shareRow && shareRow.share_amount != null ? Number(shareRow.share_amount) : 0;
  const canEdit = isAdmin && !isPaid;

  const partLine = renderUtilityKvRow("Part :", `${money(share)} DH`, true);

  const payBtn = hasBill && shareRow && canEdit
    ? `<button type="button" class="btn-small" style="background:var(--week);margin-top:6px;width:100%" data-action="pay-water" data-month-key="${monthKey}" data-person-id="${p.id}">Payer</button>`
    : "";

  const paidBadge = isPaid ? `<span class="badge badge-current" style="margin-top:6px">Payé</span>` : "";

  return `
    <div class="reimb-block" style="border-color:var(--week)">
      <div class="reimb-title" style="color:var(--week)">${esc(personName(p))}</div>
      ${partLine}
      ${isPaid ? paidBadge : payBtn}
    </div>`;
}

function renderUtilityCardHead(title, colorVar, monthKey, stats, open, canToggle = true) {
  const isCurrentMonth = monthKey === activeMonthKey();
  return `
    <div class="card-head" data-action="${canToggle ? "toggle-card" : ""}" data-key="${open.key}">
      <div>
        <div class="card-title" style="color:${colorVar}">${title}</div>
        <div class="card-range">${monthLabel(monthKey)}</div>
        ${isCurrentMonth ? `<span class="badge badge-current">Mois en cours</span>` : ""}
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <div class="card-preview">
          À payer : ${money(stats.total)} DH
          <br><span class="small-label success">Payé : ${money(stats.paid)} DH</span>
        </div>
        ${canToggle ? `<span class="chevron">${open.isOpen ? "▲" : "▼"}</span>` : ""}
      </div>
    </div>`;
}

function renderBillForm(monthKey, billTotal, formName, colorVar) {
  if (billTotal != null || !isAdmin) return "";
  return `
    <form class="inline-form" data-form="${formName}" data-month-key="${monthKey}" style="margin-bottom:12px">
      <input class="field" name="bill_total" type="number" min="0" step="0.01" placeholder="Montant facture" required />
      <button type="submit" class="btn-check" style="background:${colorVar}" title="Enregistrer">✓</button>
    </form>`;
}

function renderElecCard(monthKey) {
  const key = "elec:" + monthKey;
  const open = ui.expanded.has(key);
  const bill = getBill(monthKey);
  const stats = monthElecStats(monthKey);
  const prevComplete = isPrevMonthElecComplete(monthKey);
  const prevKey = previousMonthKey(monthKey);

  if (!prevComplete) {
    return `
      <div class="card" style="border-color:var(--month)">
        ${renderUtilityCardHead("Électricité", "var(--month)", monthKey, stats, { key, isOpen: false }, false)}
        <div style="padding:0 16px 16px" class="small-label">Complétez d'abord le mois ${monthLabel(prevKey)}.</div>
      </div>`;
  }

  const openBody = state.persons.length === 0
    ? `<div class="small-label">Ajoutez des personnes dans le Référentiel.</div>`
    : `
      ${renderBillForm(monthKey, bill?.elec_bill_total, "save-elec-bill", "var(--month)")}
      <div class="reimb-grid">
        ${state.persons.map(p => renderElecPersonBlock(monthKey, p, bill)).join("")}
      </div>`;

  return `
    <div class="card" style="border-color:var(--month)">
      ${renderUtilityCardHead("Électricité", "var(--month)", monthKey, stats, { key, isOpen: open })}
      <div class="card-body ${open ? "open" : ""}">${openBody}</div>
    </div>`;
}

function renderWaterCard(monthKey) {
  const key = "water:" + monthKey;
  const open = ui.expanded.has(key);
  const bill = getBill(monthKey);
  const stats = monthWaterStats(monthKey);

  const openBody = state.persons.length === 0
    ? `<div class="small-label">Ajoutez des personnes dans le Référentiel.</div>`
    : `
      ${renderBillForm(monthKey, bill?.water_bill_total, "save-water-bill", "var(--week)")}
      <div class="reimb-grid">
        ${state.persons.map(p => renderWaterPersonBlock(monthKey, p, bill)).join("")}
      </div>`;

  return `
    <div class="card" style="border-color:var(--week)">
      ${renderUtilityCardHead("Eau", "var(--week)", monthKey, stats, { key, isOpen: open })}
      <div class="card-body ${open ? "open" : ""}">${openBody}</div>
    </div>`;
}

function renderRecapCard(monthKey) {
  const key = "recap:" + monthKey;
  const open = ui.expanded.has(key);

  const rows = state.persons.map(p => {
    const r = personRecap(monthKey, p.id);
    const badge = recapBadge(r);
    return `
      <li class="list-item utility-recap-row">
        <div class="utility-recap-inner">
          <div class="utility-recap-head">
            <div class="list-item-name">${esc(personName(p))}</div>
            <span class="badge ${badge.cls}">${badge.label}</span>
          </div>
          ${renderUtilityKvRow("Électricité :", `${money(r.elec)} DH`)}
          ${renderUtilityKvRow("Eau :", `${money(r.water)} DH`)}
          ${renderUtilityKvRow("Total :", `${money(r.total)} DH`, true)}
        </div>
      </li>`;
  }).join("");

  return `
    <div class="card">
      <div class="card-head" data-action="toggle-card" data-key="${key}">
        <div class="card-title">Récapitulatif</div>
        <span class="chevron">${open ? "▲" : "▼"}</span>
      </div>
      <div class="card-body ${open ? "open" : ""}">
        ${state.persons.length === 0
          ? `<div class="small-label">Aucune personne.</div>`
          : `<ul class="list">${rows}</ul>`}
      </div>
    </div>`;
}

function renderFacturesTab() {
  const mk = ui.viewedMonthKey;
  return `
    <div class="stack">
      ${renderElecCard(mk)}
      ${renderWaterCard(mk)}
      ${renderRecapCard(mk)}
    </div>`;
}

function renderMonthPanel() {
  const active = activeMonthKey();
  const months = monthsRangeFrom(EAU_START_MONTH);
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
  if (m.type === "edit-person") {
    const p = state.persons.find(x => x.id === m.personId);
    if (!p) return "";
    return `
      <div class="overlay" data-overlay-close="modal">
        <div class="sheet">
          <div class="sheet-title">Modifier la personne <button class="close-btn" data-action="close-modal">✕</button></div>
          <form class="form-col" data-form="edit-person" data-person-id="${p.id}">
            <input class="field" name="first_name" placeholder="Prénom" value="${esc(p.first_name)}" required />
            <input class="field" name="last_name" placeholder="Nom" value="${esc(p.last_name)}" required />
            <input class="field" name="phone" placeholder="Numéro de téléphone" value="${esc(p.phone || "")}" />
            <button type="submit" class="btn-primary">Enregistrer</button>
          </form>
        </div>
      </div>`;
  }
  return "";
}

export function render() {
  const controls = document.getElementById("maison-controls");
  if (controls) controls.style.display = ui.subTab === "factures" ? "flex" : "none";

  if (ui.subTab === "factures" && ui.viewedMonthKey) {
    document.getElementById("month-btn-label").textContent = monthChipLabel(ui.viewedMonthKey);
  }

  document.getElementById("subtabs").innerHTML = `
    <button class="subtab ${ui.subTab === "synthese" ? "active" : ""}" data-action="set-subtab" data-tab="synthese">Synthèse</button>
    <button class="subtab ${ui.subTab === "referentiel" ? "active" : ""}" data-action="set-subtab" data-tab="referentiel">Référentiel</button>
    <button class="subtab ${ui.subTab === "factures" ? "active" : ""}" data-action="set-subtab" data-tab="factures">Factures</button>`;

  const main = document.getElementById("main");
  if (ui.subTab === "synthese") main.innerHTML = renderSyntheseTab();
  else if (ui.subTab === "referentiel") main.innerHTML = renderReferentielTab();
  else main.innerHTML = renderFacturesTab();

  document.getElementById("modal-root").innerHTML =
    ui.monthPanelOpen ? renderMonthPanel() : (ui.modal ? renderModal() : "");
}
