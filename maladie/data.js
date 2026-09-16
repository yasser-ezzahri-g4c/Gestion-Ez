import { supabaseClient } from "../shared/supabase.js";
import { isAdmin, currentUser } from "../shared/auth.js";
import {
  loadWalletData, canAfford, availableBalance,
  syncCareAction, removeCareAction, syncDossierReimbursements,
} from "../shared/wallet.js";
import { flash, getErrorMessage, normalizeName, money } from "../shared/utils.js";

export let state = {
  beneficiaries: [],
  doctors: [],
  careCategories: [],
  dossiers: [],
  careActions: [],
  dossierCareCategories: [],
};

export const ui = {
  subTab: "synthese",
  expanded: new Set(),
  modal: null,
};

export const STATUS_LABELS = {
  initie: "Initié",
  depose_cnss: "Déposé CNSS",
  en_cours: "En cours",
  partiellement_rembourse: "Partiellement remboursé",
  rembourse: "Remboursé",
};

export function resetState() {
  state = {
    beneficiaries: [], doctors: [], careCategories: [],
    dossiers: [], careActions: [], dossierCareCategories: [],
  };
}

export async function fetchStateFromSupabase() {
  if (!currentUser) return;
  const [ben, docs, cats, doss, actions, dossCats] = await Promise.all([
    supabaseClient.from("beneficiaries").select("*").order("last_name"),
    supabaseClient.from("doctors").select("*").order("name"),
    supabaseClient.from("care_categories").select("*").order("name"),
    supabaseClient.from("medical_dossiers").select("*").order("created_at", { ascending: false }),
    supabaseClient.from("care_actions").select("*").order("action_date", { ascending: false }),
    supabaseClient.from("dossier_care_categories").select("*"),
  ]);

  if (ben.error) { flash(getErrorMessage(ben.error, "Erreur chargement bénéficiaires."), true); return; }
  if (docs.error) { flash(getErrorMessage(docs.error, "Erreur chargement médecins."), true); return; }
  if (cats.error) { flash(getErrorMessage(cats.error, "Erreur chargement catégories soins."), true); return; }
  if (doss.error) { flash(getErrorMessage(doss.error, "Erreur chargement dossiers."), true); return; }
  if (actions.error) { flash(getErrorMessage(actions.error, "Erreur chargement actions."), true); return; }
  if (dossCats.error) { flash(getErrorMessage(dossCats.error, "Erreur chargement catégories dossier."), true); return; }

  state.beneficiaries = ben.data || [];
  state.doctors = docs.data || [];
  state.careCategories = cats.data || [];
  state.dossiers = doss.data || [];
  state.careActions = actions.data || [];
  state.dossierCareCategories = dossCats.data || [];
}

export function beneficiaryName(b) {
  return `${b.first_name} ${b.last_name}`;
}

export function beneficiaryDossierCount(beneficiaryId) {
  return state.dossiers.filter(d => d.beneficiary_id === beneficiaryId).length;
}

export function dossierActions(dossierId) {
  return state.careActions.filter(a => a.dossier_id === dossierId);
}

export function dossierSpentTotal(dossierId) {
  return dossierActions(dossierId).reduce((s, a) => s + Number(a.amount), 0);
}

export function dossierReimbursedTotal(d) {
  const cnss = d.cnss_received != null ? Number(d.cnss_received) : 0;
  const ass = d.assurance_received != null ? Number(d.assurance_received) : 0;
  return cnss + ass;
}

export function dossierRemainder(d) {
  return dossierSpentTotal(d.id) - dossierReimbursedTotal(d);
}

export function isDossierLocked(d) {
  return d.status === "rembourse";
}

/** Soins verrouillés : N° dossier renseigné et statut autre que initié */
export function isDossierCareLocked(d) {
  if (isDossierLocked(d)) return true;
  return !!d.dossier_number && d.status !== "initie";
}

export function isDossierEditable(d) {
  return isAdmin && !isDossierLocked(d);
}

export function canEditCareActions(d) {
  return isAdmin && !isDossierCareLocked(d);
}

export function isDossierCategoryAssigned(dossierId, categoryId) {
  return state.dossierCareCategories.some(
    dc => dc.dossier_id === dossierId && dc.category_id === categoryId
  );
}

export function categoryHasActionsInDossier(categoryId, dossierId) {
  return state.careActions.some(
    a => a.category_id === categoryId && a.dossier_id === dossierId
  );
}

export function isCategoryActiveInDossier(cat, dossierId) {
  return categoryHasActionsInDossier(cat.id, dossierId)
    || isDossierCategoryAssigned(dossierId, cat.id);
}

export function getActiveCategoriesForDossier(dossierId) {
  return state.careCategories.filter(c => isCategoryActiveInDossier(c, dossierId));
}

export function getAvailableCategoriesForDossier(dossierId) {
  return state.careCategories.filter(c => !isCategoryActiveInDossier(c, dossierId));
}

export function computeDossierStatus(d) {
  if (d.status === "rembourse") return "rembourse";
  const hasCnss = d.cnss_received != null;
  const hasAss = d.assurance_received != null;
  if (hasCnss && hasAss) return "rembourse";
  if (hasCnss || hasAss) return "partiellement_rembourse";
  const actions = dossierActions(d.id);
  if (d.dossier_number) {
    return actions.length > 0 ? "en_cours" : "depose_cnss";
  }
  return "initie";
}

export async function syncDossierStatus(dossierId) {
  const d = state.dossiers.find(x => x.id === dossierId);
  if (!d) return;
  const status = computeDossierStatus(d);
  if (status === d.status) return;
  const payload = { status };
  if (status === "rembourse") payload.locked = true;
  const { error } = await supabaseClient.from("medical_dossiers").update(payload).eq("id", dossierId);
  if (error) { flash(getErrorMessage(error, "Erreur mise à jour statut."), true); return; }
  d.status = status;
  if (status === "rembourse") d.locked = true;
}

export function categoryTotalForDossier(categoryId, dossierId) {
  return state.careActions
    .filter(a => a.category_id === categoryId && a.dossier_id === dossierId)
    .reduce((s, a) => s + Number(a.amount), 0);
}

export function actionsForCategory(dossierId, categoryId) {
  return state.careActions
    .filter(a => a.dossier_id === dossierId && a.category_id === categoryId)
    .sort((a, b) => (a.action_date < b.action_date ? 1 : -1));
}

export function categoryHasActions(categoryId) {
  return state.careActions.some(a => a.category_id === categoryId);
}

export function globalStats() {
  let totalSpent = 0;
  let totalCnss = 0;
  let totalAss = 0;
  let totalPending = 0;
  let globalCharge = 0;
  let rembourseCount = 0;
  let pendingCount = 0;

  state.dossiers.forEach(d => {
    const spent = dossierSpentTotal(d.id);
    const cnss = d.cnss_received != null ? Number(d.cnss_received) : 0;
    const ass = d.assurance_received != null ? Number(d.assurance_received) : 0;
    const cnssExp = d.cnss_expected != null ? Number(d.cnss_expected) : 0;
    const assExp = d.assurance_expected != null ? Number(d.assurance_expected) : 0;
    totalSpent += spent;
    totalCnss += cnss;
    totalAss += ass;
    totalPending += Math.max(0, (cnssExp + assExp) - (cnss + ass));
    globalCharge += dossierRemainder(d);
    if (d.status === "rembourse") rembourseCount++;
    else pendingCount++;
  });

  return {
    totalSpent, totalCnss, totalAss, totalPending, globalCharge,
    totalDossiers: state.dossiers.length,
    rembourseCount, pendingCount,
  };
}

export function alertDossiers() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return state.dossiers.filter(d => {
    if (d.status === "rembourse") return false;
    if (!d.cnss_deposit_date) return false;
    const deposit = new Date(d.cnss_deposit_date + "T00:00:00");
    const diffDays = Math.floor((today - deposit) / 86400000);
    if (diffDays < 30) return false;
    return d.cnss_received == null && d.assurance_received == null;
  });
}

function parseDateInput(val) {
  if (!val || !/^\d{4}-\d{2}-\d{2}$/.test(val)) return null;
  return val;
}

export async function addBeneficiary(firstName, lastName, birthDate, gender) {
  if (!isAdmin) return false;
  const fn = normalizeName(firstName);
  const ln = normalizeName(lastName);
  if (!fn || !ln) { flash("Nom et prénom obligatoires.", true); return false; }
  const bd = parseDateInput(birthDate);
  if (!bd) { flash("Date de naissance invalide (AAAA-MM-JJ).", true); return false; }
  if (!["M", "F"].includes(gender)) { flash("Genre obligatoire.", true); return false; }
  const { data, error } = await supabaseClient.from("beneficiaries")
    .insert({ first_name: fn, last_name: ln, birth_date: bd, gender }).select().single();
  if (error) { flash(getErrorMessage(error, "Erreur ajout bénéficiaire."), true); return false; }
  state.beneficiaries.push(data);
  flash("Membre de famille ajouté.");
  return true;
}

export async function updateBeneficiary(id, firstName, lastName, birthDate, gender) {
  if (!isAdmin) return false;
  const fn = normalizeName(firstName);
  const ln = normalizeName(lastName);
  if (!fn || !ln) { flash("Nom et prénom obligatoires.", true); return false; }
  const bd = parseDateInput(birthDate);
  if (!bd) { flash("Date de naissance invalide.", true); return false; }
  const { data, error } = await supabaseClient.from("beneficiaries")
    .update({ first_name: fn, last_name: ln, birth_date: bd, gender }).eq("id", id).select().single();
  if (error) { flash(getErrorMessage(error, "Erreur modification bénéficiaire."), true); return false; }
  const idx = state.beneficiaries.findIndex(b => b.id === id);
  if (idx >= 0) state.beneficiaries[idx] = data;
  flash("Membre modifié.");
  return true;
}

export async function addDoctor(name, facilityType, phone, specialty) {
  if (!isAdmin) return false;
  const n = normalizeName(name);
  if (!n) { flash("Nom du médecin obligatoire.", true); return false; }
  if (!["cabinet", "clinique", "hopital"].includes(facilityType)) {
    flash("Type de lieu obligatoire.", true); return false;
  }
  const { data, error } = await supabaseClient.from("doctors")
    .insert({ name: n, facility_type: facilityType, phone: phone.trim(), specialty: specialty.trim() }).select().single();
  if (error) { flash(getErrorMessage(error, "Erreur ajout médecin."), true); return false; }
  state.doctors.push(data);
  flash("Médecin ajouté.");
  return true;
}

export async function updateDoctor(id, name, facilityType, phone, specialty) {
  if (!isAdmin) return false;
  const n = normalizeName(name);
  if (!n) { flash("Nom du médecin obligatoire.", true); return false; }
  const { data, error } = await supabaseClient.from("doctors")
    .update({ name: n, facility_type: facilityType, phone: phone.trim(), specialty: specialty.trim() })
    .eq("id", id).select().single();
  if (error) { flash(getErrorMessage(error, "Erreur modification médecin."), true); return false; }
  const idx = state.doctors.findIndex(d => d.id === id);
  if (idx >= 0) state.doctors[idx] = data;
  flash("Médecin modifié.");
  return true;
}

export async function addCareCategory(name) {
  if (!isAdmin) return false;
  const n = normalizeName(name);
  if (!n) { flash("Nom de catégorie obligatoire.", true); return false; }
  if (state.careCategories.some(c => c.name.toLowerCase() === n.toLowerCase())) {
    flash("Cette catégorie existe déjà.", true); return false;
  }
  const { data, error } = await supabaseClient.from("care_categories").insert({ name: n }).select().single();
  if (error) { flash(getErrorMessage(error, "Erreur ajout catégorie."), true); return false; }
  state.careCategories.push(data);
  flash("Catégorie de soin ajoutée.");
  return true;
}

export async function updateCareCategory(id, name) {
  if (!isAdmin) return false;
  const n = normalizeName(name);
  if (!n) { flash("Nom obligatoire.", true); return false; }
  const { data, error } = await supabaseClient.from("care_categories")
    .update({ name: n }).eq("id", id).select().single();
  if (error) { flash(getErrorMessage(error, "Erreur modification catégorie."), true); return false; }
  const idx = state.careCategories.findIndex(c => c.id === id);
  if (idx >= 0) state.careCategories[idx] = data;
  flash("Catégorie modifiée.");
  return true;
}

export async function createDossier({ beneficiaryId, doctorId, consultationDate }) {
  if (!isAdmin) return false;
  const cd = parseDateInput(consultationDate);
  if (!beneficiaryId || !doctorId || !cd) {
    flash("Bénéficiaire, médecin et date de consultation sont obligatoires.", true);
    return false;
  }
  const { data, error } = await supabaseClient.from("medical_dossiers").insert({
    beneficiary_id: beneficiaryId,
    doctor_id: doctorId,
    consultation_date: cd,
    cnss_deposit_date: null,
    assurance_sent_date: null,
    status: "initie",
    locked: false,
  }).select().single();
  if (error) { flash(getErrorMessage(error, "Erreur création dossier."), true); return false; }
  state.dossiers.unshift(data);
  flash("Dossier initié.");
  return true;
}

export async function updateDossierDates(dossierId, { cnssDepositDate, assuranceSentDate }) {
  if (!isAdmin) return false;
  const d = state.dossiers.find(x => x.id === dossierId);
  if (!d || isDossierLocked(d)) { flash("Dossier non modifiable.", true); return false; }

  const payload = {};
  if (cnssDepositDate !== undefined) {
    payload.cnss_deposit_date = cnssDepositDate ? parseDateInput(cnssDepositDate) : null;
    if (cnssDepositDate && !payload.cnss_deposit_date) {
      flash("Date dépôt CNSS invalide.", true); return false;
    }
  }
  if (assuranceSentDate !== undefined) {
    payload.assurance_sent_date = assuranceSentDate ? parseDateInput(assuranceSentDate) : null;
    if (assuranceSentDate && !payload.assurance_sent_date) {
      flash("Date dépôt assurance invalide.", true); return false;
    }
  }

  const { data, error } = await supabaseClient.from("medical_dossiers")
    .update(payload).eq("id", dossierId).select().single();
  if (error) { flash(getErrorMessage(error, "Erreur mise à jour dates."), true); return false; }
  Object.assign(d, data);
  if (payload.cnss_deposit_date !== undefined && payload.assurance_sent_date === undefined) {
    flash("Date dépôt CNSS enregistrée.");
  } else if (payload.assurance_sent_date !== undefined && payload.cnss_deposit_date === undefined) {
    flash("Date dépôt assurance enregistrée.");
  } else {
    flash("Dates enregistrées.");
  }
  return true;
}

export async function cancelDossier(dossierId) {
  if (!isAdmin) return false;
  const d = state.dossiers.find(x => x.id === dossierId);
  if (!d || isDossierLocked(d)) { flash("Dossier non modifiable.", true); return false; }
  if (d.cnss_received != null) {
    flash("Impossible : le montant CNSS est déjà enregistré.", true); return false;
  }
  const { data, error } = await supabaseClient.from("medical_dossiers")
    .update({ status: "initie", locked: false }).eq("id", dossierId).select().single();
  if (error) { flash(getErrorMessage(error, "Erreur annulation dossier."), true); return false; }
  Object.assign(d, data);
  flash("Dossier réouvert (statut initié).");
  return true;
}

export async function assignDossierCategory(dossierId, categoryId) {
  if (!isAdmin) return false;
  const d = state.dossiers.find(x => x.id === dossierId);
  const cat = state.careCategories.find(c => c.id === categoryId);
  if (!d || !cat || isDossierCareLocked(d)) return false;
  if (isCategoryActiveInDossier(cat, dossierId)) return true;

  const { data, error } = await supabaseClient.from("dossier_care_categories")
    .insert({ dossier_id: dossierId, category_id: categoryId }).select().single();
  if (error) { flash(getErrorMessage(error, "Erreur affectation catégorie."), true); return false; }
  state.dossierCareCategories.push(data);
  return true;
}

export async function unassignDossierCategory(dossierId, categoryId) {
  if (!isAdmin) return false;
  if (categoryHasActionsInDossier(categoryId, dossierId)) {
    flash("Impossible : des soins existent pour cette catégorie.", true); return false;
  }
  const row = state.dossierCareCategories.find(
    dc => dc.dossier_id === dossierId && dc.category_id === categoryId
  );
  if (!row) return true;

  const { error } = await supabaseClient.from("dossier_care_categories").delete().eq("id", row.id);
  if (error) { flash(getErrorMessage(error, "Erreur retrait catégorie."), true); return false; }
  state.dossierCareCategories = state.dossierCareCategories.filter(dc => dc.id !== row.id);
  return true;
}

export async function assignDossierNumber(dossierId, number) {
  if (!isAdmin) return false;
  const d = state.dossiers.find(x => x.id === dossierId);
  if (!d || isDossierLocked(d)) { flash("Dossier non modifiable.", true); return false; }
  if (!d.cnss_deposit_date) {
    flash("Renseigne d'abord la date de dépôt CNSS.", true); return false;
  }
  const num = number.trim();
  if (!num) { flash("N° dossier obligatoire.", true); return false; }
  if (state.dossiers.some(x => x.id !== dossierId && x.dossier_number === num)) {
    flash("Ce N° dossier existe déjà.", true); return false;
  }
  const status = dossierActions(dossierId).length > 0 ? "en_cours" : "depose_cnss";
  const { data, error } = await supabaseClient.from("medical_dossiers")
    .update({ dossier_number: num, status }).eq("id", dossierId).select().single();
  if (error) { flash(getErrorMessage(error, "Erreur attribution N°."), true); return false; }
  Object.assign(d, data);
  flash("N° dossier CNSS enregistré.");
  return true;
}

export async function updateReimbursements(dossierId, { cnssExpected, cnssReceived, assuranceExpected, assuranceReceived }) {
  if (!isAdmin) return false;
  const d = state.dossiers.find(x => x.id === dossierId);
  if (!d || isDossierLocked(d)) { flash("Dossier verrouillé.", true); return false; }
  if (cnssReceived !== undefined && d.cnss_received != null) {
    flash("Le montant CNSS est déjà enregistré.", true);
    return false;
  }
  if (assuranceReceived !== undefined && d.assurance_received != null) {
    flash("Le montant assurance est déjà enregistré.", true);
    return false;
  }

  const payload = {};
  if (cnssExpected !== undefined) payload.cnss_expected = cnssExpected === "" ? null : Number(cnssExpected);
  if (cnssReceived !== undefined) payload.cnss_received = cnssReceived === "" ? null : Number(cnssReceived);
  if (assuranceExpected !== undefined) payload.assurance_expected = assuranceExpected === "" ? null : Number(assuranceExpected);
  if (assuranceReceived !== undefined) payload.assurance_received = assuranceReceived === "" ? null : Number(assuranceReceived);

  const merged = { ...d, ...payload };
  const status = computeDossierStatus(merged);
  payload.status = status;
  if (status === "rembourse") payload.locked = true;

  const { data, error } = await supabaseClient.from("medical_dossiers")
    .update(payload).eq("id", dossierId).select().single();
  if (error) { flash(getErrorMessage(error, "Erreur remboursements."), true); return false; }
  Object.assign(d, data);
  await loadWalletData();
  await syncDossierReimbursements(d);
  if (status === "rembourse") flash("Dossier remboursé et verrouillé.");
  else flash("Remboursements enregistrés.");
  return true;
}

export async function addCareAction(dossierId, categoryId, amount, place, actionDate) {
  if (!isAdmin) return false;
  const d = state.dossiers.find(x => x.id === dossierId);
  if (!d || !canEditCareActions(d)) { flash("Soins non modifiables.", true); return false; }
  const ad = parseDateInput(actionDate);
  if (!ad || isNaN(amount) || amount < 0 || !place.trim()) {
    flash("Prix, lieu et date obligatoires.", true); return false;
  }
  const monthKey = ad.slice(0, 7);
  await loadWalletData();
  if (!canAfford(monthKey, amount)) {
    flash(`Solde insuffisant : reste ${money(availableBalance(monthKey))} DH, besoin ${money(amount)} DH.`, true);
    return false;
  }
  const { data, error } = await supabaseClient.from("care_actions")
    .insert({ dossier_id: dossierId, category_id: categoryId, amount, place: place.trim(), action_date: ad })
    .select().single();
  if (error) { flash(getErrorMessage(error, "Erreur ajout action."), true); return false; }
  state.careActions.unshift(data);
  const cat = state.careCategories.find(c => c.id === categoryId);
  await syncCareAction(data, cat?.name || "Soin");
  if (d.dossier_number && d.status === "depose_cnss") {
    await supabaseClient.from("medical_dossiers").update({ status: "en_cours" }).eq("id", dossierId);
    d.status = "en_cours";
  }
  flash("Action enregistrée.");
  return true;
}

export async function updateCareAction(id, amount, place, actionDate) {
  if (!isAdmin) return false;
  const action = state.careActions.find(a => a.id === id);
  if (!action) return false;
  const d = state.dossiers.find(x => x.id === action.dossier_id);
  if (!d || !canEditCareActions(d)) { flash("Soins non modifiables.", true); return false; }
  const ad = parseDateInput(actionDate);
  if (!ad || isNaN(amount) || amount < 0 || !place.trim()) return false;
  const monthKey = ad.slice(0, 7);
  const oldAmt = Number(action.amount);
  const newAmt = Number(amount);
  await loadWalletData();
  if (newAmt > oldAmt && !canAfford(monthKey, newAmt - oldAmt, `care:${id}`)) {
    flash(`Solde insuffisant : reste ${money(availableBalance(monthKey))} DH, besoin ${money(newAmt - oldAmt)} DH.`, true);
    return false;
  }
  const { data, error } = await supabaseClient.from("care_actions")
    .update({ amount, place: place.trim(), action_date: ad }).eq("id", id).select().single();
  if (error) { flash(getErrorMessage(error, "Erreur modification action."), true); return false; }
  const idx = state.careActions.findIndex(a => a.id === id);
  if (idx >= 0) state.careActions[idx] = data;
  const cat = state.careCategories.find(c => c.id === data.category_id);
  await syncCareAction(data, cat?.name || "Soin");
  flash("Action modifiée.");
  return true;
}

export async function deleteCareAction(id) {
  if (!isAdmin) return false;
  const action = state.careActions.find(a => a.id === id);
  if (!action) return false;
  const d = state.dossiers.find(x => x.id === action.dossier_id);
  if (!d || !canEditCareActions(d)) { flash("Soins non modifiables.", true); return false; }
  await removeCareAction(id);
  const { error } = await supabaseClient.from("care_actions").delete().eq("id", id);
  if (error) { flash(getErrorMessage(error, "Erreur suppression action."), true); return false; }
  state.careActions = state.careActions.filter(a => a.id !== id);
  flash("Action supprimée.");
  return true;
}

export function facilityLabel(type) {
  return { cabinet: "Cabinet", clinique: "Clinique", hopital: "Hôpital" }[type] || type;
}

export function genderLabel(g) {
  return g === "M" ? "Homme" : "Femme";
}
