import {
  state, ui, STATUS_LABELS, globalStats, alertDossiers,
  beneficiaryName, beneficiaryDossierCount, dossierSpentTotal, dossierRemainder,
  isDossierEditable, isDossierLocked, isDossierCareLocked, canEditCareActions,
  categoryTotalForDossier, actionsForCategory, facilityLabel, genderLabel,
  getActiveCategoriesForDossier, getAvailableCategoriesForDossier,
  isDossierCategoryAssigned,
} from "./data.js";
import { isAdmin } from "../shared/auth.js";
import { esc, formatDateFull, money, parseISODate, renderDateField } from "../shared/utils.js";

export function render() {
  document.getElementById("subtabs").innerHTML = `
    <button class="subtab ${ui.subTab === "synthese" ? "active" : ""}" data-action="set-subtab" data-tab="synthese">Synthèse</button>
    <button class="subtab ${ui.subTab === "referentiel" ? "active" : ""}" data-action="set-subtab" data-tab="referentiel">Référentiel</button>
    <button class="subtab ${ui.subTab === "dossiers" ? "active" : ""}" data-action="set-subtab" data-tab="dossiers">Dossiers</button>`;

  const main = document.getElementById("main");
  if (ui.subTab === "synthese") main.innerHTML = renderSyntheseTab();
  else if (ui.subTab === "referentiel") main.innerHTML = renderReferentielTab();
  else main.innerHTML = renderDossiersTab();

  document.getElementById("modal-root").innerHTML = ui.modal ? renderModal() : "";
}

function renderDualProgress(spent, cnss, ass) {
  const total = spent || 0;
  if (total <= 0) {
    return `<div class="progress-row"><div class="progress-track"><div class="progress-fill" style="width:0"></div></div></div>`;
  }
  const cnssPct = Math.min(100, (cnss / total) * 100);
  const assPct = Math.min(100 - cnssPct, (ass / total) * 100);
  return `
    <div class="progress-row">
      <div class="progress-track progress-dual">
        <div class="progress-seg progress-cnss" style="width:${cnssPct}%"></div>
        <div class="progress-seg progress-ass" style="width:${assPct}%"></div>
      </div>
    </div>
    <div class="progress-legend">
      <span><i class="dot dot-cnss"></i> CNSS ${money(cnss)} DH</span>
      <span><i class="dot dot-ass"></i> Assurance ${money(ass)} DH</span>
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

function renderSelectPlaceholder(optionsHtml, label = "Choisir…") {
  return `<option value="" disabled selected hidden>${esc(label)}</option>${optionsHtml}`;
}

function renderDossierCategoryPicker(dossierId) {
  if (!isAdmin || isDossierCareLocked(state.dossiers.find(x => x.id === dossierId))) return "";
  const available = getAvailableCategoriesForDossier(dossierId);
  if (available.length === 0) return "";
  return `
    <div class="period-cat-picker">
      <div class="chip-row period-cat-scroll">
        ${available.map(c => `
          <button type="button" class="chip chip-pick chip-pick-month" data-action="assign-dossier-category" data-dossier-id="${dossierId}" data-category-id="${c.id}">${esc(c.name)}</button>
        `).join("")}
      </div>
    </div>`;
}

function renderDossierCategoryRow(d, cat) {
  const total = categoryTotalForDossier(cat.id, d.id);
  const careEditable = canEditCareActions(d);
  const canUnassign = careEditable && total === 0 && isDossierCategoryAssigned(d.id, cat.id);
  return `
    <li class="item-row">
      <div class="item-name">${esc(cat.name)}</div>
      <div class="item-amount">${money(total)} DH</div>
      <div class="item-actions">
        <button type="button" class="icon-btn" ${total === 0 ? "disabled" : ""} data-action="open-action-details" data-dossier-id="${d.id}" data-category-id="${cat.id}" title="Détails">🧾</button>
        ${careEditable ? `<button type="button" class="icon-btn add" data-action="open-add-action" data-dossier-id="${d.id}" data-category-id="${cat.id}" title="Ajouter">＋</button>` : ""}
        ${canUnassign ? `<button type="button" class="btn-delete" data-action="unassign-dossier-category" data-dossier-id="${d.id}" data-category-id="${cat.id}" title="Retirer">✕</button>` : ""}
      </div>
    </li>`;
}

function renderSyntheseTab() {
  const s = globalStats();
  const alerts = alertDossiers();
  const dossierPct = s.totalDossiers > 0 ? (s.rembourseCount / s.totalDossiers) * 100 : 0;

  const alertCard = alerts.length === 0
    ? `<div class="small-label">Aucune alerte.</div>`
    : alerts.map(d => {
      const ben = state.beneficiaries.find(b => b.id === d.beneficiary_id);
      return `<div class="alert-banner" style="margin-bottom:8px">
        ${esc(d.dossier_number || "Sans N°")} — ${ben ? esc(beneficiaryName(ben)) : "—"}
        <div class="small-label" style="color:var(--danger);margin-top:4px">Dépôt CNSS : ${formatDateFull(parseISODate(d.cnss_deposit_date))} · Aucun remboursement</div>
      </div>`;
    }).join("");

  const totalReimb = s.totalCnss + s.totalAss;

  return `
    <div class="stack">
      <div class="card" style="border-color:var(--danger)">
        <div class="card-head">
          <div>
            <div class="card-title" style="color:var(--danger)">Total dépensé</div>
            <span class="badge badge-danger">Charge globale : ${money(s.globalCharge)} DH</span>
          </div>
          <div class="card-preview">Dépensé : ${money(s.totalSpent)} DH<br><span class="small-label success">Remboursé : ${money(totalReimb)} DH</span></div>
        </div>
        <div class="card-body open">
          ${renderDualProgress(s.totalSpent, s.totalCnss, s.totalAss)}
        </div>
      </div>

      <div class="card" style="border-color:var(--month)">
        <div class="card-head">
          <div>
            <div class="card-title" style="color:var(--month)">Total dossiers</div>
            <span class="badge badge-current">${s.totalDossiers} dossier${s.totalDossiers > 1 ? "s" : ""}</span>
          </div>
          <div class="card-preview" style="text-align:right">
            En attente : ${s.pendingCount}<br>
            <span class="small-label success">Remboursé : ${s.rembourseCount}</span>
          </div>
        </div>
        <div class="card-body open">
          <div class="progress-row">
            <div class="progress-track">
              <div class="progress-fill" style="width:${dossierPct}%;background:var(--month)"></div>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head" data-action="toggle-card" data-key="alerts">
          <div class="card-title">Alertes (+30 jours sans remboursement)</div>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="card-preview">${alerts.length} alerte${alerts.length > 1 ? "s" : ""}</div>
            <span class="chevron">${ui.expanded.has("alerts") ? "▲" : "▼"}</span>
          </div>
        </div>
        <div class="card-body ${ui.expanded.has("alerts") ? "open" : ""}">${alertCard}</div>
      </div>
    </div>`;
}

function renderBeneficiaryRow(b) {
  const count = beneficiaryDossierCount(b.id);
  return `
    <li class="list-item">
      <div>
        <div class="list-item-name">${esc(beneficiaryName(b))}</div>
        <div class="small-label">${formatDateFull(parseISODate(b.birth_date))} · ${genderLabel(b.gender)} · ${count} dossier${count > 1 ? "s" : ""}</div>
      </div>
      <div class="list-item-right">
        ${isAdmin ? `<button class="icon-btn edit" data-action="open-edit-beneficiary" data-beneficiary-id="${b.id}" title="Modifier">✏️</button>` : ""}
      </div>
    </li>`;
}

function renderDoctorRow(d) {
  return `
    <li class="list-item">
      <div>
        <div class="list-item-name">${esc(d.name)}</div>
        <div class="small-label">${facilityLabel(d.facility_type)} · ${esc(d.specialty)} · ${esc(d.phone)}</div>
      </div>
      <div class="list-item-right">
        ${isAdmin ? `<button class="icon-btn edit" data-action="open-edit-doctor" data-doctor-id="${d.id}" title="Modifier">✏️</button>` : ""}
      </div>
    </li>`;
}

function renderCareCategoryRow(c) {
  return `
    <li class="list-item">
      <div class="list-item-name">${esc(c.name)}</div>
      <div class="list-item-right">
        ${isAdmin ? `<button class="icon-btn edit" data-action="open-edit-care-category" data-category-id="${c.id}" title="Modifier">✏️</button>` : ""}
      </div>
    </li>`;
}

function renderReferentielTab() {
  const famOpen = ui.expanded.has("ref:famille");
  const docOpen = ui.expanded.has("ref:doctors");
  const catOpen = ui.expanded.has("ref:care-cats");

  const addBenForm = `
    <form class="form-col" data-form="add-beneficiary">
      <input class="field" name="first_name" placeholder="Prénom" required />
      <input class="field" name="last_name" placeholder="Nom" required />
      ${renderDateField("birth_date")}
      <div class="segment-row">
        <button type="button" class="segment active-week" data-action="pick-gender" data-value="M">Homme</button>
        <button type="button" class="segment" data-action="pick-gender" data-value="F">Femme</button>
      </div>
      <input type="hidden" name="gender" value="M" />
      <button type="submit" class="btn-primary">Ajouter le membre</button>
    </form>`;

  const addDocForm = `
    <form class="form-col" data-form="add-doctor">
      <input class="field" name="name" placeholder="Nom du médecin" required />
      <div class="segment-row">
        <button type="button" class="segment active-week" data-action="pick-facility" data-value="cabinet">Cabinet</button>
        <button type="button" class="segment" data-action="pick-facility" data-value="clinique">Clinique</button>
        <button type="button" class="segment" data-action="pick-facility" data-value="hopital">Hôpital</button>
      </div>
      <input type="hidden" name="facility_type" value="cabinet" />
      <input class="field" name="phone" placeholder="Numéro de téléphone" />
      <input class="field" name="specialty" placeholder="Nature" required />
      <button type="submit" class="btn-primary">Ajouter le médecin</button>
    </form>`;

  const addCatForm = `
    <form class="inline-form" data-form="add-care-category">
      <input class="field" name="name" placeholder="Nom de la catégorie" required />
      <button type="submit" class="btn-small" style="background:var(--ink)">Ajouter</button>
    </form>`;

  return `
    <div class="stack">
      ${renderExpandableAddCard("ref:add-ben", "Ajouter un membre de famille", addBenForm)}
      <div class="card" style="border-color:var(--week)">
        <div class="card-head" data-action="toggle-card" data-key="ref:famille">
          <div class="card-title" style="color:var(--week)">Famille</div>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="card-preview">${state.beneficiaries.length} membre${state.beneficiaries.length > 1 ? "s" : ""}</div>
            <span class="chevron">${famOpen ? "▲" : "▼"}</span>
          </div>
        </div>
        <div class="card-body ${famOpen ? "open" : ""}">
          ${state.beneficiaries.length === 0 ? `<div class="small-label">Aucun membre.</div>` : `<ul class="list">${state.beneficiaries.map(renderBeneficiaryRow).join("")}</ul>`}
        </div>
      </div>

      ${renderExpandableAddCard("ref:add-doc", "Ajouter un médecin", addDocForm)}
      <div class="card" style="border-color:var(--month)">
        <div class="card-head" data-action="toggle-card" data-key="ref:doctors">
          <div class="card-title" style="color:var(--month)">Médecins</div>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="card-preview">${state.doctors.length} médecin${state.doctors.length > 1 ? "s" : ""}</div>
            <span class="chevron">${docOpen ? "▲" : "▼"}</span>
          </div>
        </div>
        <div class="card-body ${docOpen ? "open" : ""}">
          ${state.doctors.length === 0 ? `<div class="small-label">Aucun médecin.</div>` : `<ul class="list">${state.doctors.map(renderDoctorRow).join("")}</ul>`}
        </div>
      </div>

      ${renderExpandableAddCard("ref:add-cat", "Ajouter une catégorie de soin", addCatForm)}
      <div class="card card-list-neutral">
        <div class="card-head" data-action="toggle-card" data-key="ref:care-cats">
          <div class="card-title">Catégories de soins</div>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="card-preview">${state.careCategories.length} catégorie${state.careCategories.length > 1 ? "s" : ""}</div>
            <span class="chevron">${catOpen ? "▲" : "▼"}</span>
          </div>
        </div>
        <div class="card-body ${catOpen ? "open" : ""}">
          ${state.careCategories.length === 0 ? `<div class="small-label">Aucune catégorie.</div>` : `<ul class="list">${state.careCategories.map(renderCareCategoryRow).join("")}</ul>`}
        </div>
      </div>
    </div>`;
}

function statusBadgeClass(status) {
  if (status === "rembourse") return "badge-current";
  if (status === "partiellement_rembourse") return "badge-danger";
  if (status === "initie") return "badge-past";
  return "badge-current";
}

function renderCnssDepositRow(d, editable) {
  if (d.cnss_deposit_date) {
    if (editable && !d.dossier_number) {
      return `
        <form class="inline-form dossier-date-row" data-form="assign-dossier-number" data-dossier-id="${d.id}" style="margin-bottom:8px">
          <input class="field" name="dossier_number" placeholder="N° dossier CNSS" required />
          <button type="submit" class="btn-small" style="background:var(--month);white-space:nowrap">Définir N°</button>
        </form>`;
    }
    return "";
  }
  if (!editable) return "";
  return `
    <form class="inline-form dossier-date-row" data-form="save-cnss-deposit-date" data-dossier-id="${d.id}" style="margin-bottom:8px">
      ${renderDateField("cnss_deposit_date", { required: true, placeholder: "Date dépôt CNSS" })}
      <button type="submit" class="btn-check" style="background:var(--month)" title="Enregistrer">✓</button>
    </form>`;
}

function renderAssuranceDepositRow(d, editable) {
  if (d.assurance_sent_date || !editable) return "";
  return `
    <form class="inline-form dossier-date-row" data-form="save-assurance-sent-date" data-dossier-id="${d.id}" style="margin-bottom:12px">
      ${renderDateField("assurance_sent_date", { required: true, placeholder: "Date dépôt assurance" })}
      <button type="submit" class="btn-check" style="background:var(--week)" title="Enregistrer">✓</button>
    </form>`;
}

function renderReimbBlock(d, block, editable) {
  const isCnss = block === "cnss";
  const color = isCnss ? "var(--month)" : "var(--week)";
  const label = isCnss ? "CNSS" : "Assurance";
  const received = isCnss ? d.cnss_received : d.assurance_received;
  const blockEditable = editable && received == null;
  return `
    <div class="reimb-block" style="border-color:${color}">
      <div class="reimb-title" style="color:${color}">${label}</div>
      ${blockEditable ? `
        <form class="form-col" data-form="update-reimb" data-dossier-id="${d.id}" data-block="${block}">
          <input class="field" name="amount" type="number" min="0" step="0.01" placeholder="Montant" required />
          <button type="submit" class="btn-small" style="background:${color}">Enregistrer</button>
        </form>` : `
        <div class="small-label">Montant : ${received != null ? money(received) + " DH" : "—"}</div>`}
    </div>`;
}

function renderDossierCard(d) {
  const key = "dossier:" + d.id;
  const open = ui.expanded.has(key);
  const ben = state.beneficiaries.find(b => b.id === d.beneficiary_id);
  const spent = dossierSpentTotal(d.id);
  const remainder = dossierRemainder(d);
  const editable = isDossierEditable(d);
  const remCls = remainder > 0 ? "danger" : "success";
  const doctor = state.doctors.find(doc => doc.id === d.doctor_id);
  const activeCats = getActiveCategoriesForDossier(d.id);

  const cnssRowHtml = renderCnssDepositRow(d, editable);
  const assuranceRowHtml = renderAssuranceDepositRow(d, editable);

  const reimbHtml = (d.cnss_deposit_date || d.assurance_sent_date) ? `
    <div class="reimb-grid">
      ${d.cnss_deposit_date ? renderReimbBlock(d, "cnss", editable) : ""}
      ${d.assurance_sent_date ? renderReimbBlock(d, "assurance", editable) : ""}
    </div>` : "";

  const categoriesHtml = state.careCategories.length === 0
    ? `<div class="small-label">Créez des catégories de soins dans Référentiel.</div>`
    : activeCats.length === 0
      ? `<div class="small-label">Sélectionne une catégorie ci-dessus.</div>`
      : `<ul class="list">${activeCats.map(cat => renderDossierCategoryRow(d, cat)).join("")}</ul>`;

  const cancelBtn = editable && d.cnss_received == null && d.dossier_number ? `
    <button type="button" class="btn-danger" style="width:100%;margin-top:16px" data-action="cancel-dossier" data-dossier-id="${d.id}">Dossier annulé</button>` : "";

  return `
    <div class="card ${isDossierLocked(d) ? "disabled" : ""}" style="border-color:var(--month)">
      <div class="card-head" data-action="toggle-card" data-key="${key}">
        <div>
          <div class="card-title" style="color:var(--month)">N° ${esc(d.dossier_number || "—")}</div>
          <div class="card-range">Dépôt CNSS ${d.cnss_deposit_date ? formatDateFull(parseISODate(d.cnss_deposit_date)) : "—"}</div>
          <div class="card-range">${ben ? esc(beneficiaryName(ben)) : "—"}</div>
          <span class="badge ${statusBadgeClass(d.status)}">${STATUS_LABELS[d.status] || d.status}</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <div class="card-preview">${money(spent)} DH<br><span class="small-label ${remCls}">Charge finale : ${money(remainder)} DH</span></div>
          <span class="chevron">${open ? "▲" : "▼"}</span>
        </div>
      </div>
      <div class="card-body ${open ? "open" : ""}">
        <div style="margin-bottom:10px">
          <div class="small-label"><strong>Médecin :</strong> ${doctor ? esc(doctor.name) : "—"}</div>
          <div class="small-label"><strong>Consultation :</strong> ${formatDateFull(parseISODate(d.consultation_date))}</div>
          ${d.assurance_sent_date ? `<div class="small-label" style="color:var(--week)"><strong>Dépôt assurance :</strong> ${formatDateFull(parseISODate(d.assurance_sent_date))}</div>` : ""}
        </div>
        ${cnssRowHtml}
        ${assuranceRowHtml}
        ${reimbHtml}
        <div class="card-title" style="margin:16px 0 8px;font-size:14px">Soins par catégorie</div>
        ${renderDossierCategoryPicker(d.id)}
        ${categoriesHtml}
        ${cancelBtn}
      </div>
    </div>`;
}

function renderDossiersTab() {
  const initBtn = isAdmin
    ? `<button type="button" class="btn-primary" style="width:100%;margin-bottom:12px" data-action="open-init-dossier">＋ Initier un dossier</button>`
    : "";

  return `
    <div class="stack">
      ${initBtn}
      ${state.dossiers.length === 0
    ? `<div class="small-label">Aucun dossier.</div>`
    : state.dossiers.map(renderDossierCard).join("")}
    </div>`;
}

function renderModal() {
  const m = ui.modal;
  if (m.type === "init-dossier") {
    const benOpts = state.beneficiaries.map(b =>
      `<option value="${b.id}">${esc(beneficiaryName(b))}</option>`).join("");
    const docOpts = state.doctors.map(d =>
      `<option value="${d.id}">${esc(d.name)} — ${facilityLabel(d.facility_type)}</option>`).join("");
    return `
      <div class="overlay" data-overlay-close="modal">
        <div class="sheet">
          <div class="sheet-title">Initier un dossier<button type="button" class="close-btn" data-action="close-modal">✕</button></div>
          <form class="form-col" data-form="init-dossier">
            <select class="field" name="beneficiary_id" required>${renderSelectPlaceholder(benOpts, "Choisir un bénéficiaire…")}</select>
            <select class="field" name="doctor_id" required>${renderSelectPlaceholder(docOpts, "Choisir un médecin…")}</select>
            ${renderDateField("consultation_date", { required: true })}
            <button type="submit" class="btn-primary">Enregistrer</button>
          </form>
        </div>
      </div>`;
  }

  if (m.type === "edit-beneficiary") {
    const b = state.beneficiaries.find(x => x.id === m.beneficiaryId);
    if (!b) return "";
    return `
      <div class="overlay" data-overlay-close="modal">
        <div class="sheet">
          <div class="sheet-title">Modifier membre<button type="button" class="close-btn" data-action="close-modal">✕</button></div>
          <form class="form-col" data-form="edit-beneficiary" data-beneficiary-id="${b.id}">
            <input class="field" name="first_name" value="${esc(b.first_name)}" required />
            <input class="field" name="last_name" value="${esc(b.last_name)}" required />
            ${renderDateField("birth_date", { value: b.birth_date })}
            <div class="segment-row">
              <button type="button" class="segment ${b.gender === "M" ? "active-week" : ""}" data-action="pick-gender" data-value="M">Homme</button>
              <button type="button" class="segment ${b.gender === "F" ? "active-week" : ""}" data-action="pick-gender" data-value="F">Femme</button>
            </div>
            <input type="hidden" name="gender" value="${b.gender}" />
            <button type="submit" class="btn-primary">Enregistrer</button>
          </form>
        </div>
      </div>`;
  }

  if (m.type === "edit-doctor") {
    const d = state.doctors.find(x => x.id === m.doctorId);
    if (!d) return "";
    const types = ["cabinet", "clinique", "hopital"];
    return `
      <div class="overlay" data-overlay-close="modal">
        <div class="sheet">
          <div class="sheet-title">Modifier médecin<button type="button" class="close-btn" data-action="close-modal">✕</button></div>
          <form class="form-col" data-form="edit-doctor" data-doctor-id="${d.id}">
            <input class="field" name="name" value="${esc(d.name)}" required />
            <div class="segment-row">
              ${types.map(t => `<button type="button" class="segment ${d.facility_type === t ? "active-week" : ""}" data-action="pick-facility" data-value="${t}">${facilityLabel(t)}</button>`).join("")}
            </div>
            <input type="hidden" name="facility_type" value="${d.facility_type}" />
            <input class="field" name="phone" value="${esc(d.phone || "")}" />
            <input class="field" name="specialty" value="${esc(d.specialty || "")}" required />
            <button type="submit" class="btn-primary">Enregistrer</button>
          </form>
        </div>
      </div>`;
  }

  if (m.type === "edit-care-category") {
    const c = state.careCategories.find(x => x.id === m.categoryId);
    if (!c) return "";
    return `
      <div class="overlay" data-overlay-close="modal">
        <div class="sheet">
          <div class="sheet-title">Modifier catégorie<button type="button" class="close-btn" data-action="close-modal">✕</button></div>
          <form class="form-col" data-form="edit-care-category" data-category-id="${c.id}">
            <input class="field" name="name" value="${esc(c.name)}" required />
            <button type="submit" class="btn-primary">Enregistrer</button>
          </form>
        </div>
      </div>`;
  }

  if (m.type === "add-action") {
    return `
      <div class="overlay" data-overlay-close="modal">
        <div class="sheet">
          <div class="sheet-title">Ajouter une action<button type="button" class="close-btn" data-action="close-modal">✕</button></div>
          <form class="form-col" data-form="add-action" data-dossier-id="${m.dossierId}" data-category-id="${m.categoryId}">
            <input class="field" name="price" type="number" min="0" step="0.01" placeholder="Prix en DH" required />
            <input class="field" name="place" placeholder="Lieu" required />
            ${renderDateField("action_date")}
            <button type="submit" class="btn-primary">Enregistrer</button>
          </form>
        </div>
      </div>`;
  }

  if (m.type === "action-details") {
    const actions = actionsForCategory(m.dossierId, m.categoryId);
    const cat = state.careCategories.find(c => c.id === m.categoryId);
    const d = state.dossiers.find(x => x.id === m.dossierId);
    const editable = d && canEditCareActions(d);
    const rows = actions.length === 0
      ? `<div class="small-label">Aucune action.</div>`
      : actions.map(a => `
        <div class="purchase-detail-row">
          <div>
            <div style="font-weight:600">${money(a.amount)} DH</div>
            <div class="small-label">${esc(a.place)} · ${formatDateFull(parseISODate(a.action_date))}</div>
          </div>
          ${editable ? `<div class="purchase-detail-actions">
            <button type="button" class="icon-btn edit" data-action="open-edit-action" data-id="${a.id}" title="Modifier">✏️</button>
            <button type="button" class="btn-delete" data-action="open-delete-action" data-id="${a.id}" title="Supprimer">🗑️</button>
          </div>` : ""}
        </div>`).join("");
    return `
      <div class="overlay" data-overlay-close="modal">
        <div class="sheet">
          <div class="sheet-title">${cat ? esc(cat.name) : "Détails"}<button type="button" class="close-btn" data-action="close-modal">✕</button></div>
          ${rows}
        </div>
      </div>`;
  }

  if (m.type === "edit-action") {
    const a = state.careActions.find(x => x.id === m.actionId);
    if (!a) return "";
    return `
      <div class="overlay" data-overlay-close="modal">
        <div class="sheet">
          <div class="sheet-title">Modifier action<button type="button" class="close-btn" data-action="close-modal">✕</button></div>
          <form class="form-col" data-form="edit-action" data-id="${a.id}">
            <input class="field" name="price" type="number" min="0" step="0.01" value="${a.amount}" required />
            <input class="field" name="place" value="${esc(a.place)}" required />
            ${renderDateField("action_date", { value: a.action_date })}
            <button type="submit" class="btn-primary">Enregistrer</button>
          </form>
        </div>
      </div>`;
  }

  if (m.type === "confirm-delete-action") {
    const a = state.careActions.find(x => x.id === m.actionId);
    const label = a ? `${money(a.amount)} DH — ${a.place}` : "";
    return `
      <div class="overlay" data-overlay-close="modal">
        <div class="sheet">
          <div class="sheet-title">Confirmer la suppression<button type="button" class="close-btn" data-action="close-modal">✕</button></div>
          <p class="confirm-text">Voulez-vous vraiment supprimer cette action <strong>${esc(label)}</strong> ? Cette action est irréversible.</p>
          <div class="btn-row">
            <button type="button" class="btn-danger" data-action="confirm-delete-action" data-id="${m.actionId}">Supprimer</button>
            <button type="button" class="btn-secondary" data-action="close-modal">Annuler</button>
          </div>
        </div>
      </div>`;
  }

  return "";
}
