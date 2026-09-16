import { supabaseClient } from "../shared/supabase.js";
import { isAdmin, currentUser } from "../shared/auth.js";
import { loadWalletData, syncMonthBudget, syncWeekBudget } from "../shared/wallet.js";
import { flash, getErrorMessage, normalizeName, toISO, getWeekStart, getWeeksOfMonth, activeMonthKey, money, addDays, parseISODate } from "../shared/utils.js";

export let state = {
  categories: [],
  places: [],
  purchases: [],
  periodCategories: [],
  monthlyBudgets: {},
  weeklyBudgets: {},
};

export const ui = {
  subTab: "budget",
  viewedMonthKey: null,
  monthPanelOpen: false,
  expanded: new Set(),
  modal: null,
};

export function resetState() {
  state = {
    categories: [],
    places: [],
    purchases: [],
    periodCategories: [],
    monthlyBudgets: {},
    weeklyBudgets: {},
  };
}

export async function fetchStateFromSupabase() {
  if (!currentUser) return;
  const [cats, places, purch, periodCats, mBudgets, wBudgets] = await Promise.all([
    supabaseClient.from("categories").select("*"),
    supabaseClient.from("places").select("*"),
    supabaseClient.from("purchases").select("*").order("date", { ascending: false }),
    supabaseClient.from("period_categories").select("*"),
    supabaseClient.from("monthly_budgets").select("*"),
    supabaseClient.from("weekly_budgets").select("*"),
  ]);

  if (cats.error) { flash(getErrorMessage(cats.error, "Erreur chargement catégories."), true); return; }
  if (places.error) { flash(getErrorMessage(places.error, "Erreur chargement lieux."), true); return; }
  if (purch.error) { flash(getErrorMessage(purch.error, "Erreur chargement achats."), true); return; }
  if (periodCats.error) { flash(getErrorMessage(periodCats.error, "Erreur chargement affectations."), true); return; }

  state.categories = cats.data || [];
  state.places = places.data || [];
  state.purchases = purch.data || [];
  state.periodCategories = periodCats.data || [];
  state.monthlyBudgets = {};
  if (mBudgets.data) mBudgets.data.forEach(b => { state.monthlyBudgets[b.month_key] = b.amount; });
  state.weeklyBudgets = {};
  if (wBudgets.data) wBudgets.data.forEach(b => { state.weeklyBudgets[b.week_start] = b.amount; });
}

function weekEndISO(isoWs) {
  return toISO(addDays(parseISODate(isoWs), 6));
}

function purchasesInPeriod(type, periodKey) {
  if (type === "mensuel") {
    return state.purchases.filter(p => p.type === type && p.date.slice(0, 7) === periodKey);
  }
  const isoWe = weekEndISO(periodKey);
  return state.purchases.filter(p => p.type === type && p.date >= periodKey && p.date <= isoWe);
}

export function isOrphanPurchase(purchase) {
  if (!purchase.category_id) return true;
  return !state.categories.some(c => c.id === purchase.category_id);
}

function orphanCategoryNamesInPeriod(type, periodKey) {
  const names = new Map();
  for (const p of purchasesInPeriod(type, periodKey)) {
    if (!isOrphanPurchase(p) || !p.category_name) continue;
    const key = nameKey(p.category_name);
    if (!names.has(key)) names.set(key, p.category_name);
  }
  return [...names.values()];
}

export function isPeriodCategoryAssigned(type, periodKey, categoryId) {
  return state.periodCategories.some(
    pc => pc.type === type && pc.period_key === periodKey && pc.category_id === categoryId
  );
}

export function categoryHasPurchasesInPeriod(categoryId, type, periodKey) {
  if (type === "mensuel") {
    return state.purchases.some(
      p => p.category_id === categoryId && p.type === type && p.date.slice(0, 7) === periodKey
    );
  }
  const isoWe = weekEndISO(periodKey);
  return state.purchases.some(
    p => p.category_id === categoryId && p.type === type && p.date >= periodKey && p.date <= isoWe
  );
}

export function categoryHasOrphanPurchasesByNameInPeriod(name, type, periodKey) {
  const key = nameKey(name);
  return purchasesInPeriod(type, periodKey).some(
    p => isOrphanPurchase(p) && p.category_name && nameKey(p.category_name) === key
  );
}

export function isCategoryActiveInPeriod(cat, type, periodKey) {
  return categoryHasPurchasesInPeriod(cat.id, type, periodKey)
    || isPeriodCategoryAssigned(type, periodKey, cat.id)
    || categoryHasOrphanPurchasesByNameInPeriod(cat.name, type, periodKey);
}

/** @returns {{ name: string, categoryId: string|null, orphanOnly: boolean }[]} */
export function getPeriodDisplayRows(type, periodKey) {
  const rows = [];
  const coveredNames = new Set();

  for (const cat of state.categories.filter(c => c.type === type)) {
    if (!isCategoryActiveInPeriod(cat, type, periodKey)) continue;
    rows.push({ name: cat.name, categoryId: cat.id, orphanOnly: false });
    coveredNames.add(nameKey(cat.name));
  }

  for (const name of orphanCategoryNamesInPeriod(type, periodKey)) {
    if (coveredNames.has(nameKey(name))) continue;
    rows.push({ name, categoryId: null, orphanOnly: true });
  }

  return rows.sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

export function getActiveCategoriesForPeriod(type, periodKey) {
  return state.categories.filter(c => c.type === type && isCategoryActiveInPeriod(c, type, periodKey));
}

export function getAvailableCategoriesForPeriod(type, periodKey) {
  return state.categories.filter(c => c.type === type && !isCategoryActiveInPeriod(c, type, periodKey));
}

export function purchasesForPeriodRow(row, type, periodKey) {
  const key = nameKey(row.name);
  return purchasesInPeriod(type, periodKey)
    .filter(p => {
      if (row.categoryId && p.category_id === row.categoryId) return true;
      return isOrphanPurchase(p) && p.category_name && nameKey(p.category_name) === key;
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function totalForPeriodRow(row, type, periodKey) {
  return purchasesForPeriodRow(row, type, periodKey)
    .reduce((s, p) => s + Number(p.price), 0);
}

export function categoryTotalForMonth(categoryId, type, monthKey) {
  return state.purchases
    .filter(p => p.category_id === categoryId && p.type === type && p.date.slice(0, 7) === monthKey)
    .reduce((s, p) => s + Number(p.price), 0);
}

export function categoryTotalForWeek(categoryId, type, isoWs, isoWe) {
  return state.purchases
    .filter(p => p.category_id === categoryId && p.type === type && p.date >= isoWs && p.date <= isoWe)
    .reduce((s, p) => s + Number(p.price), 0);
}

export function purchasesForMonth(categoryId, type, monthKey) {
  return state.purchases
    .filter(p => p.category_id === categoryId && p.type === type && p.date.slice(0, 7) === monthKey)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function purchasesForWeek(categoryId, type, isoWs, isoWe) {
  return state.purchases
    .filter(p => p.category_id === categoryId && p.type === type && p.date >= isoWs && p.date <= isoWe)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function monthSpentTotal(monthKey) {
  return state.purchases
    .filter(p => p.type === "mensuel" && p.date.slice(0, 7) === monthKey)
    .reduce((s, p) => s + Number(p.price), 0);
}

export function weekSpentTotal(isoWs, isoWe) {
  return state.purchases
    .filter(p => p.type === "hebdo" && p.date >= isoWs && p.date <= isoWe)
    .reduce((s, p) => s + Number(p.price), 0);
}

/** @returns {{ monthConso: number, monthGain: number, weekConso: number, weekGain: number, totalConso: number, totalGain: number }} */
export function achatsRecap(monthKey) {
  const monthBudget = state.monthlyBudgets[monthKey];
  const monthConso = monthSpentTotal(monthKey);
  const monthGain = monthBudget != null ? Number(monthBudget) - monthConso : 0;

  const isActiveMonth = monthKey === activeMonthKey();
  const todayWeekISO = toISO(getWeekStart(new Date()));
  let weekConso = 0;
  let weekGain = 0;

  for (const wStart of getWeeksOfMonth(monthKey)) {
    const isoWs = toISO(wStart);
    const isoWe = toISO(addDays(wStart, 6));
    let status;
    if (!isActiveMonth) status = "past";
    else if (isoWs === todayWeekISO) status = "current";
    else if (isoWs < todayWeekISO) status = "past";
    else status = "future";
    if (status === "future") continue;

    const conso = weekSpentTotal(isoWs, isoWe);
    weekConso += conso;
    const budget = state.weeklyBudgets[isoWs];
    if (budget != null) weekGain += Number(budget) - conso;
  }

  return {
    monthConso,
    monthGain,
    weekConso,
    weekGain,
    totalConso: monthConso + weekConso,
    totalGain: monthGain + weekGain,
  };
}

export function placeHasPurchases(placeId) {
  return state.purchases.some(p => p.place_id === placeId);
}

function nameKey(name) {
  return normalizeName(name).toLowerCase();
}

export function categoryNameTaken(name, type, excludeId = null) {
  const key = nameKey(name);
  return state.categories.some(c => c.id !== excludeId && c.name.toLowerCase() === key);
}

export function categoryNameInOtherType(name, type, excludeId = null) {
  const key = nameKey(name);
  return state.categories.some(c => c.id !== excludeId && c.type !== type && c.name.toLowerCase() === key);
}

export function placeNameTaken(name, excludeId = null) {
  const key = nameKey(name);
  return state.places.some(p => p.id !== excludeId && p.name.toLowerCase() === key);
}

export function isPurchaseEditable(purchase) {
  if (purchase.type === "mensuel") return purchase.date.slice(0, 7) === activeMonthKey();
  const ws = toISO(getWeekStart(new Date()));
  const we = toISO(new Date(getWeekStart(new Date()).getTime() + 6 * 86400000));
  return purchase.date >= ws && purchase.date <= we;
}

export async function assignPeriodCategory(type, periodKey, categoryId) {
  if (!isAdmin) return false;
  const cat = state.categories.find(c => c.id === categoryId);
  if (!cat || cat.type !== type) return false;
  if (isCategoryActiveInPeriod(cat, type, periodKey)) return true;

  const { data, error } = await supabaseClient.from("period_categories")
    .insert({ type, period_key: periodKey, category_id: categoryId })
    .select()
    .single();
  if (error) { flash(getErrorMessage(error, "Erreur lors de l'affectation."), true); return false; }
  state.periodCategories.push(data);
  return true;
}

export async function unassignPeriodCategory(type, periodKey, categoryId) {
  if (!isAdmin) return false;
  if (categoryHasPurchasesInPeriod(categoryId, type, periodKey)) {
    flash("Impossible : des achats existent pour cette catégorie sur cette période.", true);
    return false;
  }
  const row = state.periodCategories.find(
    pc => pc.type === type && pc.period_key === periodKey && pc.category_id === categoryId
  );
  if (!row) return true;

  const { error } = await supabaseClient.from("period_categories").delete().eq("id", row.id);
  if (error) { flash(getErrorMessage(error, "Erreur lors du retrait."), true); return false; }
  state.periodCategories = state.periodCategories.filter(pc => pc.id !== row.id);
  return true;
}

export async function setMonthBudget(monthKey, amount) {
  if (!isAdmin) return false;
  const consumed = monthSpentTotal(monthKey);
  if (amount < consumed) {
    flash(`Impossible : le budget (${money(amount)} DH) est inférieur au total déjà consommé (${money(consumed)} DH).`, true);
    return false;
  }
  const oldAmount = state.monthlyBudgets[monthKey] || 0;
  await loadWalletData();
  const walletOk = await syncMonthBudget(monthKey, amount, oldAmount);
  if (!walletOk) return false;
  const { error } = await supabaseClient.from("monthly_budgets").upsert({ month_key: monthKey, amount });
  if (error) { flash(getErrorMessage(error, "Erreur lors de la mise à jour du budget mensuel."), true); return false; }
  state.monthlyBudgets[monthKey] = amount;
  flash("Budget mensuel enregistré.");
  return true;
}

export async function setWeekBudget(isoWeekStart, amount) {
  if (!isAdmin) return false;
  const isoWe = weekEndISO(isoWeekStart);
  const consumed = weekSpentTotal(isoWeekStart, isoWe);
  if (amount < consumed) {
    flash(`Impossible : le budget (${money(amount)} DH) est inférieur au total déjà consommé (${money(consumed)} DH).`, true);
    return false;
  }
  const oldAmount = state.weeklyBudgets[isoWeekStart] || 0;
  const monthKey = isoWeekStart.slice(0, 7);
  await loadWalletData();
  const walletOk = await syncWeekBudget(isoWeekStart, monthKey, amount, oldAmount);
  if (!walletOk) return false;
  const { error } = await supabaseClient.from("weekly_budgets").upsert({ week_start: isoWeekStart, amount });
  if (error) { flash(getErrorMessage(error, "Erreur lors de la mise à jour du budget hebdo."), true); return false; }
  state.weeklyBudgets[isoWeekStart] = amount;
  flash("Budget hebdo enregistré.");
  return true;
}

export async function addCategory(name, type) {
  if (!isAdmin) return false;
  const n = normalizeName(name);
  if (!n) { flash("Le nom de la catégorie est obligatoire.", true); return false; }
  if (categoryNameTaken(n, type)) { flash("Cette catégorie existe déjà.", true); return false; }
  if (categoryNameInOtherType(n, type)) { flash("Ce nom existe déjà dans l'autre type (hebdo/mensuel).", true); return false; }
  const { data, error } = await supabaseClient.from("categories").insert({ name: n, type }).select().single();
  if (error) { flash(getErrorMessage(error, "Erreur lors de l'ajout de la catégorie."), true); return false; }
  state.categories.push(data);
  flash("Catégorie ajoutée.");
  return true;
}

export async function updateCategory(id, name, type) {
  if (!isAdmin) return false;
  const cat = state.categories.find(c => c.id === id);
  if (!cat) return false;
  const n = normalizeName(name);
  if (!n) { flash("Le nom de la catégorie est obligatoire.", true); return false; }
  if (categoryNameTaken(n, type, id)) { flash("Cette catégorie existe déjà.", true); return false; }
  if (categoryNameInOtherType(n, type, id)) { flash("Ce nom existe déjà dans l'autre type (hebdo/mensuel).", true); return false; }
  const { data, error } = await supabaseClient.from("categories").update({ name: n, type }).eq("id", id).select().single();
  if (error) { flash(getErrorMessage(error, "Erreur lors de la modification de la catégorie."), true); return false; }
  const idx = state.categories.findIndex(c => c.id === id);
  if (idx >= 0) state.categories[idx] = data;
  flash("Catégorie modifiée.");
  return true;
}

export async function deleteCategory(id) {
  if (!isAdmin) return false;
  const cat = state.categories.find(c => c.id === id);
  if (!cat) return false;

  const linked = state.purchases.filter(p => p.category_id === id);
  for (const p of linked) {
    const frozenName = p.category_name || cat.name;
    const { error: purchErr } = await supabaseClient.from("purchases")
      .update({ category_id: null, category_name: frozenName })
      .eq("id", p.id);
    if (purchErr) {
      flash(getErrorMessage(purchErr, "Erreur lors de la mise à jour des achats liés."), true);
      return false;
    }
    p.category_id = null;
    p.category_name = frozenName;
  }

  const { error } = await supabaseClient.from("categories").delete().eq("id", id);
  if (error) { flash(getErrorMessage(error, "Erreur lors de la suppression de la catégorie."), true); return false; }
  state.categories = state.categories.filter(c => c.id !== id);
  state.periodCategories = state.periodCategories.filter(pc => pc.category_id !== id);
  flash("Catégorie supprimée.");
  return true;
}

export async function addPlace(name) {
  if (!isAdmin) return false;
  const n = normalizeName(name);
  if (!n) { flash("Le nom du lieu est obligatoire.", true); return false; }
  if (placeNameTaken(n)) { flash("Ce lieu existe déjà.", true); return false; }
  const { data, error } = await supabaseClient.from("places").insert({ name: n }).select().single();
  if (error) { flash(getErrorMessage(error, "Erreur lors de l'ajout du lieu."), true); return false; }
  state.places.push(data);
  flash("Lieu ajouté.");
  return true;
}

export async function updatePlace(id, name) {
  if (!isAdmin) return false;
  const n = normalizeName(name);
  if (!n) { flash("Le nom du lieu est obligatoire.", true); return false; }
  if (placeNameTaken(n, id)) { flash("Ce lieu existe déjà.", true); return false; }
  const { data, error } = await supabaseClient.from("places").update({ name: n }).eq("id", id).select().single();
  if (error) { flash(getErrorMessage(error, "Erreur lors de la modification du lieu."), true); return false; }
  const idx = state.places.findIndex(p => p.id === id);
  if (idx >= 0) state.places[idx] = data;
  flash("Lieu modifié.");
  return true;
}

export async function deletePlace(id) {
  if (!isAdmin) return false;
  if (placeHasPurchases(id)) {
    flash("Impossible : des achats sont liés à ce lieu.", true);
    return false;
  }
  const { error } = await supabaseClient.from("places").delete().eq("id", id);
  if (error) { flash(getErrorMessage(error, "Erreur lors de la suppression du lieu."), true); return false; }
  state.places = state.places.filter(p => p.id !== id);
  flash("Lieu supprimé.");
  return true;
}

export async function addPurchase({ categoryId, type, place_id, price }) {
  if (!isAdmin) return false;
  const cat = state.categories.find(c => c.id === categoryId);
  if (!cat) return false;
  const date = toISO(new Date());
  const { data, error } = await supabaseClient.from("purchases")
    .insert({
      category_id: categoryId,
      category_name: cat.name,
      place_id,
      price,
      date,
      type,
    })
    .select()
    .single();
  if (error) { flash(getErrorMessage(error, "Erreur lors de l'enregistrement de l'achat."), true); return false; }
  state.purchases.unshift(data);
  checkBudgetAlert(type, date);
  flash("Achat enregistré.");
  return true;
}

export async function updatePurchase(id, { price, place_id }) {
  if (!isAdmin) return false;
  const purchase = state.purchases.find(p => p.id === id);
  if (!purchase) return false;
  if (!isPurchaseEditable(purchase)) {
    flash("Cet achat ne peut pas être modifié (période passée).", true);
    return false;
  }
  const { data, error } = await supabaseClient.from("purchases")
    .update({ price, place_id }).eq("id", id).select().single();
  if (error) { flash(getErrorMessage(error, "Erreur lors de la modification de l'achat."), true); return false; }
  const idx = state.purchases.findIndex(p => p.id === id);
  if (idx >= 0) state.purchases[idx] = data;
  checkBudgetAlert(data.type, data.date);
  flash("Achat modifié.");
  return true;
}

export async function deletePurchase(id) {
  if (!isAdmin) return false;
  const purchase = state.purchases.find(p => p.id === id);
  if (!purchase) return false;
  if (!isPurchaseEditable(purchase)) {
    flash("Cet achat ne peut pas être supprimé (période passée).", true);
    return false;
  }
  const { error } = await supabaseClient.from("purchases").delete().eq("id", id);
  if (error) { flash(getErrorMessage(error, "Erreur lors de la suppression de l'achat."), true); return false; }
  state.purchases = state.purchases.filter(p => p.id !== id);
  flash("Achat supprimé.");
  return true;
}

function checkBudgetAlert(type, date) {
  if (type === "mensuel") {
    const mk = date.slice(0, 7);
    const budget = Number(state.monthlyBudgets[mk]);
    if (!budget) return;
    if (monthSpentTotal(mk) > budget) flash("Alerte : budget mensuel dépassé !", true);
  } else {
    const ws = toISO(getWeekStart(new Date(date)));
    const budget = Number(state.weeklyBudgets[ws]);
    if (!budget) return;
    const we = weekEndISO(ws);
    if (weekSpentTotal(ws, we) > budget) flash("Alerte : budget hebdo dépassé !", true);
  }
}
