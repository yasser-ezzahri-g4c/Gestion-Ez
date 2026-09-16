import { getActiveModule } from "../shared/router.js";
import {
  ui,
  addBeneficiary, updateBeneficiary,
  addDoctor, updateDoctor,
  addCareCategory, updateCareCategory,
  createDossier, updateDossierDates, cancelDossier,
  assignDossierNumber, updateReimbursements,
  assignDossierCategory, unassignDossierCategory,
  addCareAction, updateCareAction, deleteCareAction,
} from "./data.js";
import { render } from "./render.js";

export function setupEvents() {
  document.addEventListener("click", onClick);
  document.addEventListener("submit", onSubmit);
}

function onClick(e) {
  if (getActiveModule() !== "maladie") return;

  if (e.target.classList && e.target.classList.contains("overlay")) {
    if (e.target.dataset.overlayClose === "modal") {
      ui.modal = null;
      render();
    }
    return;
  }

  const target = e.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;

  if (action === "set-subtab") { ui.subTab = target.dataset.tab; render(); }
  else if (action === "toggle-card") {
    const key = target.dataset.key;
    if (ui.expanded.has(key)) ui.expanded.delete(key);
    else ui.expanded.add(key);
    render();
  }
  else if (action === "pick-gender") {
    const form = target.closest("form");
    form.querySelectorAll("[data-action='pick-gender']").forEach(b => b.classList.remove("active-week"));
    target.classList.add("active-week");
    form.querySelector("[name='gender']").value = target.dataset.value;
  }
  else if (action === "pick-facility") {
    const form = target.closest("form");
    form.querySelectorAll("[data-action='pick-facility']").forEach(b => b.classList.remove("active-week"));
    target.classList.add("active-week");
    form.querySelector("[name='facility_type']").value = target.dataset.value;
  }
  else if (action === "open-init-dossier") { ui.modal = { type: "init-dossier" }; render(); }
  else if (action === "open-edit-beneficiary") {
    ui.modal = { type: "edit-beneficiary", beneficiaryId: target.dataset.beneficiaryId };
    render();
  }
  else if (action === "open-edit-doctor") {
    ui.modal = { type: "edit-doctor", doctorId: target.dataset.doctorId };
    render();
  }
  else if (action === "open-edit-care-category") {
    ui.modal = { type: "edit-care-category", categoryId: target.dataset.categoryId };
    render();
  }
  else if (action === "assign-dossier-category") {
    assignDossierCategory(target.dataset.dossierId, target.dataset.categoryId).then(() => render());
  }
  else if (action === "unassign-dossier-category") {
    unassignDossierCategory(target.dataset.dossierId, target.dataset.categoryId).then(() => render());
  }
  else if (action === "cancel-dossier") {
    cancelDossier(target.dataset.dossierId).then(() => render());
  }
  else if (action === "open-add-action") {
    ui.modal = { type: "add-action", dossierId: target.dataset.dossierId, categoryId: target.dataset.categoryId };
    render();
  }
  else if (action === "open-action-details") {
    ui.modal = { type: "action-details", dossierId: target.dataset.dossierId, categoryId: target.dataset.categoryId };
    render();
  }
  else if (action === "open-edit-action") {
    const prev = ui.modal && ui.modal.type === "action-details" ? { ...ui.modal } : null;
    ui.modal = { type: "edit-action", actionId: target.dataset.id, returnTo: prev };
    render();
  }
  else if (action === "open-delete-action") {
    const prev = ui.modal && ui.modal.type === "action-details" ? { ...ui.modal } : null;
    ui.modal = { type: "confirm-delete-action", actionId: target.dataset.id, returnTo: prev };
    render();
  }
  else if (action === "confirm-delete-action") {
    const returnTo = ui.modal && ui.modal.returnTo;
    deleteCareAction(target.dataset.id).then((ok) => {
      if (!ok) return;
      ui.modal = returnTo || null;
      render();
    });
  }
  else if (action === "close-modal") { ui.modal = null; render(); }
}

async function onSubmit(e) {
  if (getActiveModule() !== "maladie") return;
  const form = e.target.closest("[data-form]");
  if (!form) return;
  e.preventDefault();
  const type = form.dataset.form;

  if (type === "add-beneficiary") {
    await addBeneficiary(form.first_name.value, form.last_name.value, form.birth_date.value, form.gender.value);
    form.reset();
    form.querySelector("[name='gender']").value = "M";
    render();
  }
  else if (type === "edit-beneficiary") {
    const ok = await updateBeneficiary(form.dataset.beneficiaryId, form.first_name.value, form.last_name.value, form.birth_date.value, form.gender.value);
    if (ok) ui.modal = null;
    render();
  }
  else if (type === "add-doctor") {
    await addDoctor(form.name.value, form.facility_type.value, form.phone.value, form.specialty.value);
    form.reset();
    form.querySelector("[name='facility_type']").value = "cabinet";
    render();
  }
  else if (type === "edit-doctor") {
    const ok = await updateDoctor(form.dataset.doctorId, form.name.value, form.facility_type.value, form.phone.value, form.specialty.value);
    if (ok) ui.modal = null;
    render();
  }
  else if (type === "add-care-category") {
    await addCareCategory(form.name.value);
    form.reset();
    render();
  }
  else if (type === "edit-care-category") {
    const ok = await updateCareCategory(form.dataset.categoryId, form.name.value);
    if (ok) ui.modal = null;
    render();
  }
  else if (type === "init-dossier") {
    const ok = await createDossier({
      beneficiaryId: form.beneficiary_id.value,
      doctorId: form.doctor_id.value,
      consultationDate: form.consultation_date.value,
    });
    if (ok) ui.modal = null;
    render();
  }
  else if (type === "save-cnss-deposit-date") {
    await updateDossierDates(form.dataset.dossierId, {
      cnssDepositDate: form.cnss_deposit_date.value,
    });
    render();
  }
  else if (type === "save-assurance-sent-date") {
    await updateDossierDates(form.dataset.dossierId, {
      assuranceSentDate: form.assurance_sent_date.value,
    });
    render();
  }
  else if (type === "assign-dossier-number") {
    const ok = await assignDossierNumber(form.dataset.dossierId, form.dossier_number.value);
    if (ok) form.reset();
    render();
  }
  else if (type === "update-reimb") {
    const dossierId = form.dataset.dossierId;
    const block = form.dataset.block;
    const amount = form.amount.value;
    const payload = block === "cnss"
      ? { cnssReceived: amount }
      : { assuranceReceived: amount };
    await updateReimbursements(dossierId, payload);
    render();
  }
  else if (type === "add-action") {
    const price = parseFloat(form.price.value);
    const ok = await addCareAction(form.dataset.dossierId, form.dataset.categoryId, price, form.place.value, form.action_date.value);
    if (ok) ui.modal = null;
    render();
  }
  else if (type === "edit-action") {
    const price = parseFloat(form.price.value);
    const returnTo = ui.modal && ui.modal.returnTo;
    const ok = await updateCareAction(form.dataset.id, price, form.place.value, form.action_date.value);
    if (ok) ui.modal = returnTo || null;
    render();
  }
}
