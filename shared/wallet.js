import { supabaseClient } from "./supabase.js";
import {
  activeMonthKey, flash, getErrorMessage, money, previousMonthKey,
  TRESORERIE_START_MONTH, toISO,
} from "./utils.js";

/** @type {object[]|null} */
let movementsCache = null;
/** @type {object[]|null} */
let categoriesCache = null;

export const SOURCE_LABELS = {
  opening: "Solde banque",
  salary: "Salaire",
  cnss: "Remboursement CNSS",
  assurance: "Remboursement assurance",
  budget_month: "Budget mensuel",
  budget_week: "Budget hebdo",
  care: "Soin médical",
  elec_pay: "Paiement électricité",
  water_pay: "Paiement eau",
  manual: "Charge manuelle",
};

export const SYSTEM_EXPENSE_TYPES = [
  "budget_month", "budget_week", "care", "elec_pay", "water_pay",
];

export const SYSTEM_REVENUE_TYPES = [
  "salary", "cnss", "assurance",
];

export function invalidateWalletCache() {
  movementsCache = null;
  categoriesCache = null;
}

export async function loadWalletData() {
  const [mov, cats] = await Promise.all([
    supabaseClient.from("wallet_movements").select("*").order("movement_date", { ascending: true }),
    supabaseClient.from("wallet_categories").select("*").order("name"),
  ]);
  if (mov.error) {
    flash(getErrorMessage(mov.error, "Erreur chargement trésorerie. Exécutez supabase/tresorerie.sql."), true);
    movementsCache = [];
  } else {
    movementsCache = mov.data || [];
  }
  if (cats.error) {
    categoriesCache = [];
  } else {
    categoriesCache = cats.data || [];
  }
  return { movements: movementsCache, categories: categoriesCache };
}

export function getMovements() {
  return movementsCache || [];
}

export function getWalletCategories() {
  return categoriesCache || [];
}

export function getUserWalletCategories() {
  return getWalletCategories().filter(c => !c.is_system);
}

export function getWalletCategoriesByDirection(direction) {
  return getUserWalletCategories().filter(c => (c.direction || "depense") === direction);
}

function walletCategoryNameTaken(name, excludeId = null) {
  const key = normalizeWalletCategoryName(name);
  return getUserWalletCategories().some(
    c => c.id !== excludeId && normalizeWalletCategoryName(c.name) === key,
  );
}

function normalizeWalletCategoryName(name) {
  return String(name || "").normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("fr");
}

function movementsForMonth(monthKey) {
  return getMovements().filter(m => m.month_key === monthKey);
}

function movementByRef(refKey) {
  return getMovements().find(m => m.ref_key === refKey) || null;
}

function sumMovements(monthKey) {
  return movementsForMonth(monthKey).reduce((s, m) => s + Number(m.amount), 0);
}

/** Solde de clôture d'un mois (report vers le mois suivant). */
export function closingBalance(monthKey) {
  if (monthKey < TRESORERIE_START_MONTH) return 0;
  const carry = carryIn(monthKey);
  return carry + sumMovements(monthKey);
}

/** Entrée du mois : solde banque (1er mois) ou report du mois précédent. */
export function carryIn(monthKey) {
  if (monthKey < TRESORERIE_START_MONTH) return 0;
  if (monthKey === TRESORERIE_START_MONTH) {
    const opening = movementByRef(`opening:${monthKey}`);
    return opening ? Number(opening.amount) : 0;
  }
  return closingBalance(previousMonthKey(monthKey));
}

/** Solde disponible dans un mois (avant nouvelle sortie). */
export function availableBalance(monthKey) {
  return carryIn(monthKey) + sumMovements(monthKey);
}

export function canAfford(monthKey, amountNeeded, excludeRefKey = null) {
  const need = Number(amountNeeded) || 0;
  if (need <= 0) return true;
  let avail = availableBalance(monthKey);
  if (excludeRefKey) {
    const ex = movementByRef(excludeRefKey);
    if (ex && ex.month_key === monthKey) avail -= Number(ex.amount);
  }
  return avail >= need;
}

function affordMessage(monthKey, amountNeeded, excludeRefKey = null) {
  const need = Number(amountNeeded) || 0;
  let avail = availableBalance(monthKey);
  if (excludeRefKey) {
    const ex = movementByRef(excludeRefKey);
    if (ex && ex.month_key === monthKey) avail -= Number(ex.amount);
  }
  if (avail >= need) return null;
  return `Solde insuffisant : reste ${money(avail)} DH, besoin ${money(need)} DH.`;
}

export async function upsertMovement({
  monthKey,
  amount,
  sourceModule,
  sourceType,
  refKey,
  label,
  categoryId = null,
  movementDate = null,
}) {
  const payload = {
    month_key: monthKey,
    movement_date: movementDate || toISO(new Date()),
    amount: Number(amount),
    source_module: sourceModule,
    source_type: sourceType,
    ref_key: refKey,
    label: label || SOURCE_LABELS[sourceType] || sourceType,
    category_id: categoryId,
  };

  const existing = refKey ? movementByRef(refKey) : null;
  let result;
  if (existing) {
    const { data, error } = await supabaseClient.from("wallet_movements")
      .update(payload).eq("id", existing.id).select().single();
    if (error) { flash(getErrorMessage(error, "Erreur mise à jour trésorerie."), true); return false; }
    result = data;
    const idx = movementsCache.findIndex(m => m.id === existing.id);
    if (idx >= 0) movementsCache[idx] = data;
  } else {
    const { data, error } = await supabaseClient.from("wallet_movements")
      .insert(payload).select().single();
    if (error) { flash(getErrorMessage(error, "Erreur enregistrement trésorerie."), true); return false; }
    result = data;
    movementsCache.push(data);
  }
  return result;
}

export async function deleteMovementByRef(refKey) {
  const existing = movementByRef(refKey);
  if (!existing) return true;
  const { error } = await supabaseClient.from("wallet_movements").delete().eq("id", existing.id);
  if (error) { flash(getErrorMessage(error, "Erreur suppression mouvement."), true); return false; }
  movementsCache = movementsCache.filter(m => m.id !== existing.id);
  return true;
}

export async function setOpeningBalance(monthKey, amount) {
  if (hasOpeningBalance()) {
    flash("Le solde actuel est déjà fixé et ne peut plus être modifié.", true);
    return false;
  }
  const n = Number(amount);
  if (!Number.isFinite(n) || n < 0) { flash("Montant invalide.", true); return false; }
  const openingMonthKey = TRESORERIE_START_MONTH;
  const ok = await upsertMovement({
    monthKey: openingMonthKey,
    amount: n,
    sourceModule: "tresorerie",
    sourceType: "opening",
    refKey: `opening:${openingMonthKey}`,
    label: "Solde actuel",
  });
  if (ok) flash("Solde actuel enregistré.");
  return !!ok;
}

export async function setSalary(monthKey, amount) {
  if (monthKey === TRESORERIE_START_MONTH) {
    flash("Le salaire se saisit à partir du mois suivant.", true);
    return false;
  }
  if (hasSalary(monthKey)) {
    flash("Le salaire de ce mois est déjà fixé et ne peut plus être modifié.", true);
    return false;
  }
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) { flash("Salaire invalide.", true); return false; }
  const refKey = `salary:${monthKey}`;
  const ok = await upsertMovement({
    monthKey,
    amount: n,
    sourceModule: "tresorerie",
    sourceType: "salary",
    refKey,
    label: "Salaire",
  });
  if (ok) flash("Salaire enregistré.");
  return !!ok;
}

export async function syncMonthBudget(monthKey, newAmount, oldAmount = 0) {
  const refKey = `budget_month:${monthKey}`;
  const next = Number(newAmount) || 0;
  const prev = Number(oldAmount) || 0;
  const delta = next - prev;
  if (delta > 0) {
    const msg = affordMessage(monthKey, delta, refKey);
    if (msg) { flash(msg, true); return false; }
  }
  if (next === 0) return deleteMovementByRef(refKey);
  return !!(await upsertMovement({
    monthKey,
    amount: -next,
    sourceModule: "maison",
    sourceType: "budget_month",
    refKey,
    label: "Budget mensuel Course",
  }));
}

export async function syncWeekBudget(isoWeekStart, monthKey, newAmount, oldAmount = 0) {
  const refKey = `budget_week:${isoWeekStart}`;
  const next = Number(newAmount) || 0;
  const prev = Number(oldAmount) || 0;
  const delta = next - prev;
  if (delta > 0) {
    const msg = affordMessage(monthKey, delta, refKey);
    if (msg) { flash(msg, true); return false; }
  }
  if (next === 0) return deleteMovementByRef(refKey);
  return !!(await upsertMovement({
    monthKey,
    amount: -next,
    sourceModule: "maison",
    sourceType: "budget_week",
    refKey,
    label: "Budget hebdo Course",
  }));
}

export async function syncCareAction(action, categoryName) {
  const monthKey = action.action_date.slice(0, 7);
  const refKey = `care:${action.id}`;
  const amt = Number(action.amount);
  const msg = affordMessage(monthKey, amt, refKey);
  if (msg) { flash(msg, true); return false; }
  return !!(await upsertMovement({
    monthKey,
    amount: -amt,
    sourceModule: "maladie",
    sourceType: "care",
    refKey,
    label: categoryName || "Soin",
    movementDate: action.action_date,
  }));
}

export async function removeCareAction(actionId) {
  return deleteMovementByRef(`care:${actionId}`);
}

export async function syncDossierReimbursements(dossier) {
  const monthKey = toISO(new Date()).slice(0, 7);
  const numLabel = dossier.dossier_number ? `N°${dossier.dossier_number}` : "Sans N°";
  let ok = true;

  if (dossier.cnss_received != null && dossier.cnss_received !== "") {
    const amt = Number(dossier.cnss_received);
    if (Number.isFinite(amt) && amt >= 0) {
      const r = await upsertMovement({
        monthKey,
        amount: amt,
        sourceModule: "maladie",
        sourceType: "cnss",
        refKey: `cnss:${dossier.id}`,
        label: numLabel,
      });
      if (!r) ok = false;
    }
  } else {
    await deleteMovementByRef(`cnss:${dossier.id}`);
  }

  if (dossier.assurance_received != null && dossier.assurance_received !== "") {
    const amt = Number(dossier.assurance_received);
    if (Number.isFinite(amt) && amt >= 0) {
      const r = await upsertMovement({
        monthKey,
        amount: amt,
        sourceModule: "maladie",
        sourceType: "assurance",
        refKey: `assurance:${dossier.id}`,
        label: numLabel,
      });
      if (!r) ok = false;
    }
  } else {
    await deleteMovementByRef(`assurance:${dossier.id}`);
  }

  return ok;
}

export async function syncUtilityPayment({ monthKey, personName, amount, sourceType, refKey }) {
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) return true;
  const msg = affordMessage(monthKey, amt, refKey);
  if (msg) { flash(msg, true); return false; }
  const label = sourceType === "elec_pay"
    ? `Électricité — ${personName}`
    : `Eau — ${personName}`;
  return !!(await upsertMovement({
    monthKey,
    amount: -amt,
    sourceModule: "eau-elec",
    sourceType,
    refKey,
    label,
  }));
}

export async function addManualExpense(monthKey, categoryId, amount, label) {
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) { flash("Montant invalide.", true); return false; }
  const cat = getWalletCategories().find(c => c.id === categoryId);
  if (!cat || cat.is_system) { flash("Catégorie invalide.", true); return false; }
  if ((cat.direction || "depense") !== "depense") {
    flash("Cette catégorie n'est pas une dépense.", true);
    return false;
  }
  const lbl = label?.trim();
  if (!lbl) { flash("Le libellé est obligatoire.", true); return false; }
  const { data, error } = await supabaseClient.from("wallet_movements")
    .insert({
      month_key: monthKey,
      movement_date: toISO(new Date()),
      amount: -amt,
      source_module: "tresorerie",
      source_type: "manual",
      category_id: categoryId,
      label: lbl,
    })
    .select()
    .single();
  if (error) { flash(getErrorMessage(error, "Erreur saisie charge."), true); return false; }
  movementsCache.push(data);
  flash("Dépense enregistrée.");
  return true;
}

export async function addManualRevenue(monthKey, categoryId, amount, label) {
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) { flash("Montant invalide.", true); return false; }
  const cat = getWalletCategories().find(c => c.id === categoryId);
  if (!cat || cat.is_system) { flash("Catégorie invalide.", true); return false; }
  if ((cat.direction || "depense") !== "revenue") {
    flash("Cette catégorie n'est pas un revenu.", true);
    return false;
  }
  const lbl = label?.trim();
  if (!lbl) { flash("Le libellé est obligatoire.", true); return false; }
  const { data, error } = await supabaseClient.from("wallet_movements")
    .insert({
      month_key: monthKey,
      movement_date: toISO(new Date()),
      amount: amt,
      source_module: "tresorerie",
      source_type: "manual",
      category_id: categoryId,
      label: lbl,
    })
    .select()
    .single();
  if (error) { flash(getErrorMessage(error, "Erreur saisie revenu."), true); return false; }
  movementsCache.push(data);
  flash("Revenu enregistré.");
  return true;
}

export async function updateManualMovement(id, amount, label) {
  const mov = getMovements().find(m => m.id === id);
  if (!mov || mov.source_type !== "manual") return false;
  if (!isManualMovementEditable(mov)) {
    flash("Ce mouvement ne peut pas être modifié (mois passé).", true);
    return false;
  }
  const cat = manualCategoryForMovement(mov);
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) { flash("Montant invalide.", true); return false; }
  const direction = cat?.direction || (Number(mov.amount) < 0 ? "depense" : "revenue");
  const oldAbs = Math.abs(Number(mov.amount));
  if (direction === "depense") {
    const delta = amt - oldAbs;
    if (delta > 0) {
      const msg = affordMessage(mov.month_key, delta);
      if (msg) { flash(msg, true); return false; }
    }
  }
  const lbl = label?.trim();
  if (!lbl) { flash("Le libellé est obligatoire.", true); return false; }
  const nextAmount = direction === "depense" ? -amt : amt;
  const { data, error } = await supabaseClient.from("wallet_movements")
    .update({
      amount: nextAmount,
      label: lbl,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) { flash(getErrorMessage(error, "Erreur modification."), true); return false; }
  const idx = movementsCache.findIndex(m => m.id === id);
  if (idx >= 0) movementsCache[idx] = data;
  flash("Mouvement modifié.");
  return true;
}

export async function deleteManualMovement(id) {
  const mov = getMovements().find(m => m.id === id);
  if (!mov || mov.source_type !== "manual") return false;
  const { error } = await supabaseClient.from("wallet_movements").delete().eq("id", id);
  if (error) { flash(getErrorMessage(error, "Erreur suppression."), true); return false; }
  movementsCache = movementsCache.filter(m => m.id !== id);
  flash("Mouvement supprimé.");
  return true;
}

export async function addWalletCategory(name, direction, isFixed = false, icon = null) {
  const n = String(name || "").normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!n) { flash("Le nom de la catégorie est obligatoire.", true); return false; }
  if (!["depense", "revenue"].includes(direction)) {
    flash("Type de catégorie invalide.", true);
    return false;
  }
  if (walletCategoryNameTaken(n)) {
    flash("Cette catégorie existe déjà.", true);
    return false;
  }
  const { data, error } = await supabaseClient.from("wallet_categories")
    .insert({
      name: n,
      is_system: false,
      direction,
      is_fixed: Boolean(isFixed),
      icon: String(icon || "").trim() || null,
    }).select().single();
  if (error) { flash(getErrorMessage(error, "Erreur ajout catégorie."), true); return false; }
  categoriesCache.push(data);
  flash("Catégorie ajoutée.");
  return data;
}

export async function updateWalletCategory(id, name, direction, isFixed = false, icon = null) {
  const cat = getUserWalletCategories().find(c => c.id === id);
  if (!cat) return false;
  const n = String(name || "").normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!n) { flash("Le nom de la catégorie est obligatoire.", true); return false; }
  if (!["depense", "revenue"].includes(direction)) {
    flash("Type de catégorie invalide.", true);
    return false;
  }
  if (walletCategoryNameTaken(n, id)) {
    flash("Cette catégorie existe déjà.", true);
    return false;
  }
  const { data, error } = await supabaseClient.from("wallet_categories")
    .update({
      name: n,
      direction,
      is_fixed: Boolean(isFixed),
      icon: String(icon || "").trim() || null,
    }).eq("id", id).select().single();
  if (error) { flash(getErrorMessage(error, "Erreur modification catégorie."), true); return false; }
  const idx = categoriesCache.findIndex(c => c.id === id);
  if (idx >= 0) categoriesCache[idx] = data;
  flash("Catégorie modifiée.");
  return true;
}

export async function deleteWalletCategory(id) {
  const cat = getWalletCategories().find(c => c.id === id);
  if (!cat || cat.is_system) return false;
  const used = getMovements().some(m => m.category_id === id);
  if (used) { flash("Impossible : des transactions utilisent cette catégorie.", true); return false; }
  const { error } = await supabaseClient.from("wallet_categories").delete().eq("id", id);
  if (error) { flash(getErrorMessage(error, "Erreur suppression catégorie."), true); return false; }
  categoriesCache = categoriesCache.filter(c => c.id !== id);
  flash("Catégorie supprimée.");
  return true;
}

const DEFAULT_WALLET_CATEGORIES = [
  { name: "Eau", direction: "depense", is_fixed: true, icon: "💧" },
  { name: "Électricité", direction: "depense", is_fixed: true, icon: "⚡" },
  { name: "Wi-Fi", direction: "depense", is_fixed: true, icon: "📶" },
  { name: "Loyer", direction: "depense", is_fixed: true, icon: "🏠" },
  { name: "Courses", direction: "depense", is_fixed: false, icon: "🛒" },
  { name: "Transport", direction: "depense", is_fixed: false, icon: "🚌" },
  { name: "Salaire", direction: "revenue", is_fixed: true, icon: "💼" },
];

export async function ensureDefaultWalletCategories() {
  for (const category of DEFAULT_WALLET_CATEGORIES) {
    if (!walletCategoryNameTaken(category.name)) {
      const created = await addWalletCategory(
        category.name,
        category.direction,
        category.is_fixed,
        category.icon,
      );
      if (!created) return false;
    }
  }
  return true;
}

export function totalForCategory(categoryId) {
  const category = getWalletCategories().find(item => item.id === categoryId);
  const systemTypesByName = {
    eau: ["water_pay"],
    "électricité": ["elec_pay"],
    courses: ["budget_month", "budget_week"],
    course: ["budget_month", "budget_week"],
    salaire: ["salary"],
  };
  const linkedSystemTypes = systemTypesByName[normalizeWalletCategoryName(category?.name)] || [];
  return getMovements()
    .filter(m => (m.category_id === categoryId && m.source_type === "manual")
      || linkedSystemTypes.includes(m.source_type))
    .reduce((sum, movement) => sum + Math.abs(Number(movement.amount)), 0);
}

export function getFinancialOverview() {
  const openingMovement = getMovements().find(m => m.source_type === "opening");
  const initialBalance = openingMovement ? Number(openingMovement.amount) : 0;
  const transactions = getMovements().filter(m => m.source_type !== "opening");
  const totalRevenue = transactions
    .filter(m => Number(m.amount) > 0)
    .reduce((sum, movement) => sum + Number(movement.amount), 0);
  const totalExpense = transactions
    .filter(m => Number(m.amount) < 0)
    .reduce((sum, movement) => sum + Math.abs(Number(movement.amount)), 0);
  return {
    initialBalance,
    totalRevenue,
    totalExpense,
    currentBalance: initialBalance + totalRevenue - totalExpense,
  };
}

export function getFinancialHistory() {
  return getMovements()
    .filter(m => m.source_type !== "opening")
    .slice()
    .sort((a, b) => {
      const dateA = a.occurred_at || a.created_at || a.movement_date || "";
      const dateB = b.occurred_at || b.created_at || b.movement_date || "";
      return dateB.localeCompare(dateA);
    });
}

function sumManualByDirection(monthKey, direction) {
  return movementsForMonth(monthKey)
    .filter(m => {
      if (m.source_type !== "manual") return false;
      const cat = getWalletCategories().find(c => c.id === m.category_id);
      return cat && (cat.direction || "depense") === direction;
    })
    .reduce((s, m) => s + Math.abs(Number(m.amount)), 0);
}

export function movementsForSystemType(monthKey, sourceType) {
  return movementsForMonth(monthKey)
    .filter(m => m.source_type === sourceType)
    .sort((a, b) => (a.movement_date < b.movement_date ? 1 : -1));
}

export function totalForSystemType(monthKey, sourceType) {
  return movementsForSystemType(monthKey, sourceType)
    .reduce((s, m) => s + Math.abs(Number(m.amount)), 0);
}

export function manualMovementsForCategory(monthKey, categoryId) {
  return movementsForMonth(monthKey)
    .filter(m => m.source_type === "manual" && m.category_id === categoryId)
    .sort((a, b) => (a.movement_date < b.movement_date ? 1 : -1));
}

export function totalForManualCategory(monthKey, categoryId) {
  return manualMovementsForCategory(monthKey, categoryId)
    .reduce((s, m) => s + Math.abs(Number(m.amount)), 0);
}

export function saisieDepenseTotal(monthKey) {
  return SYSTEM_EXPENSE_TYPES.reduce(
    (s, t) => s + totalForSystemType(monthKey, t), 0,
  ) + sumManualByDirection(monthKey, "depense");
}

export function saisieRevenueTotal(monthKey) {
  return SYSTEM_REVENUE_TYPES.reduce(
    (s, t) => s + totalForSystemType(monthKey, t), 0,
  ) + sumManualByDirection(monthKey, "revenue");
}

export function isManualMovementEditable(movement) {
  return movement?.source_type === "manual"
    && movement.month_key === activeMonthKey();
}

function manualCategoryForMovement(movement) {
  return getWalletCategories().find(c => c.id === movement.category_id) || null;
}

function sumByTypes(monthKey, types, positiveOnly = false) {
  return movementsForMonth(monthKey)
    .filter(m => types.includes(m.source_type) && (!positiveOnly || Number(m.amount) > 0))
    .reduce((s, m) => s + Math.abs(Number(m.amount)), 0);
}

/** Synthèse structurée en 3 blocs + solde disponible. */
export function monthSummary(monthKey) {
  const isFirst = monthKey === TRESORERIE_START_MONTH;
  const salaryMov = movementByRef(`salary:${monthKey}`);
  const salary = salaryMov ? Number(salaryMov.amount) : 0;
  const soldePrev = isFirst ? carryIn(monthKey) : carryIn(monthKey);

  const budget = sumByTypes(monthKey, ["budget_month", "budget_week"]);
  const maladie = sumByTypes(monthKey, ["care"]);
  const utilities = sumByTypes(monthKey, ["elec_pay", "water_pay"]);
  const autres = sumManualByDirection(monthKey, "depense");
  const reimbursements = sumByTypes(monthKey, ["cnss", "assurance"], true);
  const otherIncome = sumManualByDirection(monthKey, "revenue");

  const totalResources = salary + soldePrev;
  const totalExpenses = budget + maladie + utilities + autres;
  const totalIncomes = reimbursements + otherIncome;
  const soldeDisponible = totalResources - totalExpenses + totalIncomes;

  return {
    isFirst,
    salary,
    soldePrev,
    totalResources,
    budget,
    maladie,
    utilities,
    autres,
    totalExpenses,
    reimbursements,
    otherIncome,
    totalIncomes,
    soldeDisponible,
    needsOpeningSetup: isFirst && !hasOpeningBalance(),
    needsSalarySetup: !isFirst && !hasSalary(monthKey),
  };
}

export function hasOpeningBalance() {
  return !!movementByRef(`opening:${TRESORERIE_START_MONTH}`);
}

export function hasSalary(monthKey) {
  return !!movementByRef(`salary:${monthKey}`);
}

export async function getAppOwnerPerson() {
  const { data, error } = await supabaseClient.from("utility_persons")
    .select("*").eq("is_app_owner", true).maybeSingle();
  if (error || !data) return null;
  return data;
}

export async function setAppOwner(personId) {
  await supabaseClient.from("utility_persons").update({ is_app_owner: false }).eq("is_app_owner", true);
  const { error } = await supabaseClient.from("utility_persons")
    .update({ is_app_owner: true }).eq("id", personId);
  if (error) { flash(getErrorMessage(error, "Erreur propriétaire."), true); return false; }
  flash("Propriétaire enregistré.");
  return true;
}
