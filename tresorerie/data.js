import {
  loadWalletData, getUserWalletCategories, getWalletCategoriesByDirection,
  monthSummary, hasOpeningBalance, hasSalary,
  setOpeningBalance, setSalary,
  addManualExpense, addManualRevenue, updateManualMovement, deleteManualMovement,
  addWalletCategory, updateWalletCategory,
  SOURCE_LABELS, SYSTEM_EXPENSE_TYPES, SYSTEM_REVENUE_TYPES,
  movementsForSystemType, totalForSystemType,
  manualMovementsForCategory, totalForManualCategory,
  saisieDepenseTotal, saisieRevenueTotal, isManualMovementEditable,
} from "../shared/wallet.js";
import { supabaseClient } from "../shared/supabase.js";
import { TRESORERIE_START_MONTH } from "../shared/utils.js";

export let state = { loaded: false };

const maladieLookup = {
  actions: new Map(),
  categories: new Map(),
  dossiers: new Map(),
};

export async function loadMaladieLookup() {
  const [actions, cats, dossiers] = await Promise.all([
    supabaseClient.from("care_actions").select("id, category_id, dossier_id"),
    supabaseClient.from("care_categories").select("id, name"),
    supabaseClient.from("medical_dossiers").select("id, dossier_number"),
  ]);
  maladieLookup.actions.clear();
  maladieLookup.categories.clear();
  maladieLookup.dossiers.clear();
  for (const a of actions.data || []) maladieLookup.actions.set(a.id, a);
  for (const c of cats.data || []) maladieLookup.categories.set(c.id, c.name);
  for (const d of dossiers.data || []) maladieLookup.dossiers.set(d.id, d.dossier_number);
}

/** Libellé affiché dans le détail d'un mouvement système. */
export function systemMovementDetailLabel(mov) {
  if (mov.source_type === "care") {
    const actionId = mov.ref_key?.startsWith("care:") ? mov.ref_key.slice(5) : null;
    const action = actionId ? maladieLookup.actions.get(actionId) : null;
    if (action) {
      const catName = maladieLookup.categories.get(action.category_id);
      if (catName) return catName;
    }
    if (mov.label.startsWith("Soin — ")) return "Soin";
    return mov.label;
  }
  if (mov.source_type === "cnss" || mov.source_type === "assurance") {
    if (mov.label.startsWith("N°") || mov.label === "Sans N°") return mov.label;
    const dossierId = mov.ref_key?.split(":")[1];
    const num = dossierId ? maladieLookup.dossiers.get(dossierId) : null;
    if (num) return `N°${num}`;
    const parts = mov.label.split(" — ");
    if (parts.length >= 2) {
      const n = parts[parts.length - 1];
      return n === "Sans N°" ? n : (n.startsWith("N°") ? n : `N°${n}`);
    }
    return mov.label;
  }
  const parts = mov.label.split(" — ");
  return parts.length >= 2 ? parts[parts.length - 1] : mov.label;
}

export function getSystemDetailTitle(sourceType) {
  return SOURCE_LABELS[sourceType] || sourceType;
}

export const ui = {
  subTab: "synthese",
  viewedMonthKey: null,
  monthPanelOpen: false,
  expanded: new Set(),
  modal: null,
  /** @type {Record<string, string[]>} */
  saisiePinned: {},
};

export function resetState() {
  state = { loaded: false };
  ui.saisiePinned = {};
  maladieLookup.actions.clear();
  maladieLookup.categories.clear();
  maladieLookup.dossiers.clear();
}

export async function fetchStateFromSupabase() {
  await Promise.all([loadWalletData(), loadMaladieLookup()]);
  state.loaded = true;
}

function saisiePinKey(monthKey, direction) {
  return `${monthKey}:${direction}`;
}

export function isSaisieCategoryPinned(monthKey, direction, categoryId) {
  return (ui.saisiePinned[saisiePinKey(monthKey, direction)] || []).includes(categoryId);
}

export function pinSaisieCategory(monthKey, direction, categoryId) {
  const key = saisiePinKey(monthKey, direction);
  if (!ui.saisiePinned[key]) ui.saisiePinned[key] = [];
  if (!ui.saisiePinned[key].includes(categoryId)) ui.saisiePinned[key].push(categoryId);
}

export function unpinSaisieCategory(monthKey, direction, categoryId) {
  const key = saisiePinKey(monthKey, direction);
  ui.saisiePinned[key] = (ui.saisiePinned[key] || []).filter(id => id !== categoryId);
}

export function isCategoryActiveInSaisie(cat, monthKey, direction) {
  return totalForManualCategory(monthKey, cat.id) > 0
    || isSaisieCategoryPinned(monthKey, direction, cat.id);
}

export function getAvailableSaisieCategories(monthKey, direction) {
  return getWalletCategoriesByDirection(direction)
    .filter(c => !isCategoryActiveInSaisie(c, monthKey, direction));
}

/** @returns {{ kind: "system", sourceType: string, name: string, total: number }[]} */
export function getSaisieSystemRows(monthKey, direction) {
  const types = direction === "depense" ? SYSTEM_EXPENSE_TYPES : SYSTEM_REVENUE_TYPES;
  return types
    .map(sourceType => ({
      kind: "system",
      sourceType,
      name: SOURCE_LABELS[sourceType] || sourceType,
      total: totalForSystemType(monthKey, sourceType),
    }))
    .filter(r => r.total > 0);
}

/** @returns {{ kind: "manual", categoryId: string, name: string, total: number }[]} */
export function getSaisieManualRows(monthKey, direction) {
  return getWalletCategoriesByDirection(direction)
    .filter(c => isCategoryActiveInSaisie(c, monthKey, direction))
    .map(c => ({
      kind: "manual",
      categoryId: c.id,
      name: c.name,
      total: totalForManualCategory(monthKey, c.id),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

export function getSaisieDisplayRows(monthKey, direction) {
  return [...getSaisieSystemRows(monthKey, direction), ...getSaisieManualRows(monthKey, direction)];
}

export {
  setOpeningBalance, setSalary,
  addManualExpense, addManualRevenue, updateManualMovement, deleteManualMovement,
  addWalletCategory, updateWalletCategory,
  monthSummary, hasOpeningBalance, hasSalary,
  getUserWalletCategories, getWalletCategoriesByDirection,
  movementsForSystemType, manualMovementsForCategory,
  saisieDepenseTotal, saisieRevenueTotal, isManualMovementEditable,
  SOURCE_LABELS,
};

export { TRESORERIE_START_MONTH };
