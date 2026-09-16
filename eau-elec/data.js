import { supabaseClient } from "../shared/supabase.js";
import { isAdmin, currentUser } from "../shared/auth.js";
import { loadWalletData, syncUtilityPayment, setAppOwner } from "../shared/wallet.js";
import {
  flash, getErrorMessage, normalizeName, EAU_START_MONTH, previousMonthKey, activeMonthKey, monthLabel, roundShare,
} from "../shared/utils.js";

export let state = {
  persons: [],
  bills: [],
  elecReadings: [],
  waterShares: [],
};

export const ui = {
  subTab: "synthese",
  viewedMonthKey: null,
  monthPanelOpen: false,
  expanded: new Set(),
  modal: null,
};

export function resetState() {
  state = { persons: [], bills: [], elecReadings: [], waterShares: [] };
}

export async function fetchStateFromSupabase() {
  if (!currentUser) return;
  const [persons, bills, elec, water] = await Promise.all([
    supabaseClient.from("utility_persons").select("*").order("last_name").order("first_name"),
    supabaseClient.from("utility_bills").select("*").order("month_key"),
    supabaseClient.from("utility_elec_readings").select("*"),
    supabaseClient.from("utility_water_shares").select("*"),
  ]);

  if (persons.error) { flash(getErrorMessage(persons.error, "Erreur chargement personnes."), true); return; }
  if (bills.error) { flash(getErrorMessage(bills.error, "Erreur chargement factures."), true); return; }
  if (elec.error) { flash(getErrorMessage(elec.error, "Erreur chargement électricité."), true); return; }
  if (water.error) { flash(getErrorMessage(water.error, "Erreur chargement eau."), true); return; }

  state.persons = persons.data || [];
  state.bills = bills.data || [];
  state.elecReadings = elec.data || [];
  state.waterShares = water.data || [];
}

export function personName(p) {
  return `${p.first_name} ${p.last_name}`;
}

export function getBill(monthKey) {
  return state.bills.find(b => b.month_key === monthKey) || null;
}

export function getBillId(monthKey) {
  return getBill(monthKey)?.id || null;
}

export function elecReading(billId, personId) {
  if (!billId) return null;
  return state.elecReadings.find(r => r.bill_id === billId && r.person_id === personId) || null;
}

export function waterShare(billId, personId) {
  if (!billId) return null;
  return state.waterShares.find(s => s.bill_id === billId && s.person_id === personId) || null;
}

export function isFirstEauMonth(monthKey) {
  return monthKey === EAU_START_MONTH;
}

export function isPrevMonthElecComplete(monthKey) {
  if (isFirstEauMonth(monthKey)) return true;
  const prevKey = previousMonthKey(monthKey);
  if (prevKey < EAU_START_MONTH) return true;
  if (state.persons.length === 0) return true;
  const prevBill = getBill(prevKey);
  if (!prevBill) return false;
  return state.persons.every(p => {
    const r = elecReading(prevBill.id, p.id);
    return r && r.curr_meter != null;
  });
}

/** Relevé précédent affiché : saisi (août) ou fin de mois N-1 */
export function getPrevMeter(monthKey, personId) {
  const bill = getBill(monthKey);
  const saved = bill ? elecReading(bill.id, personId) : null;
  if (saved) return Number(saved.prev_meter);

  if (isFirstEauMonth(monthKey)) return null;

  const prevBill = getBill(previousMonthKey(monthKey));
  if (!prevBill) return null;
  const prevReading = elecReading(prevBill.id, personId);
  return prevReading ? Number(prevReading.curr_meter) : null;
}

export function calcElecConso(prevMeter, currMeter) {
  const prev = Number(prevMeter);
  const curr = Number(currMeter);
  if (!Number.isFinite(prev) || !Number.isFinite(curr) || curr < prev) return 0;
  return curr - prev;
}

export function calcElecShares(billTotal, entries) {
  const total = Number(billTotal);
  if (!Number.isFinite(total) || total <= 0) return null;
  const totalConso = entries.reduce((s, e) => s + e.conso, 0);
  if (totalConso <= 0) return null;
  return entries.map(e => ({
    personId: e.personId,
    conso: e.conso,
    share: total * e.conso / totalConso,
  }));
}

export function calcWaterShare(billTotal, personCount) {
  const total = Number(billTotal);
  const n = Number(personCount);
  if (!Number.isFinite(total) || total <= 0 || n <= 0) return null;
  return total / n;
}

export function monthElecStats(monthKey) {
  const bill = getBill(monthKey);
  if (!bill || bill.elec_bill_total == null) {
    return { toPay: 0, paid: 0, total: 0, hasData: false };
  }

  const billTotal = Number(bill.elec_bill_total);

  if (!hasElecSharesCalculated(bill)) {
    let paid = 0;
    for (const p of state.persons) {
      const r = elecReading(bill.id, p.id);
      if (r?.paid_at && Number(r.share_amount) > 0) paid += Number(r.share_amount);
    }
    const toPay = Math.max(0, billTotal - paid);
    return { toPay, paid, total: billTotal, hasData: true };
  }

  let toPay = 0;
  let paid = 0;
  for (const p of state.persons) {
    const r = elecReading(bill.id, p.id);
    if (!r) continue;
    const share = Number(r.share_amount);
    if (r.paid_at) paid += share;
    else toPay += share;
  }
  return { toPay, paid, total: toPay + paid, hasData: true };
}

export function hasElecSharesCalculated(monthKeyOrBill) {
  const bill = typeof monthKeyOrBill === "string" ? getBill(monthKeyOrBill) : monthKeyOrBill;
  if (!bill?.elec_bill_total) return false;
  if (state.persons.length === 0) return false;

  const allHaveShare = state.persons.every(p => {
    const r = elecReading(bill.id, p.id);
    return r && r.curr_meter != null && Number(r.share_amount) > 0;
  });
  if (allHaveShare) return true;

  const entries = collectElecEntriesFromSaved(bill);
  if (!entries) return false;
  return calcElecShares(bill.elec_bill_total, entries) != null;
}

export function monthWaterStats(monthKey) {
  const bill = getBill(monthKey);
  if (!bill || bill.water_bill_total == null) {
    return { toPay: 0, paid: 0, total: 0, hasData: false };
  }
  let toPay = 0;
  let paid = 0;
  for (const p of state.persons) {
    const s = waterShare(bill.id, p.id);
    if (!s) continue;
    const share = Number(s.share_amount);
    if (s.paid_at) paid += share;
    else toPay += share;
  }
  const total = toPay + paid || Number(bill.water_bill_total);
  return { toPay, paid, total, hasData: true };
}

export function personRecap(monthKey, personId) {
  const bill = getBill(monthKey);
  if (!bill) return { elec: 0, water: 0, total: 0, elecPaid: false, waterPaid: false };
  const er = elecReading(bill.id, personId);
  const ws = waterShare(bill.id, personId);
  const elec = er && Number(er.share_amount) > 0 ? Number(er.share_amount) : 0;
  const water = ws ? Number(ws.share_amount) : 0;
  return {
    elec, water, total: elec + water,
    elecPaid: !!(er && er.paid_at),
    waterPaid: !!(ws && ws.paid_at),
  };
}

/** Synthèse globale : tous mois confondus */
export function personGlobalSummary(personId) {
  let chargeElec = 0;
  let chargeWater = 0;
  let paidElec = 0;
  let paidWater = 0;
  let totalElec = 0;
  let totalWater = 0;

  for (const bill of state.bills) {
    const er = elecReading(bill.id, personId);
    if (er && er.curr_meter != null && Number(er.share_amount) > 0) {
      const amt = Number(er.share_amount);
      totalElec += amt;
      if (er.paid_at) paidElec += amt;
      else chargeElec += amt;
    }
    const ws = waterShare(bill.id, personId);
    if (ws) {
      const amt = Number(ws.share_amount);
      totalWater += amt;
      if (ws.paid_at) paidWater += amt;
      else chargeWater += amt;
    }
  }

  const chargeTotal = chargeElec + chargeWater;
  const paidTotal = paidElec + paidWater;
  const grandTotal = totalElec + totalWater;

  return {
    chargeElec, chargeWater, chargeTotal,
    paidElec, paidWater, paidTotal,
    totalElec, totalWater, grandTotal,
  };
}

export function monthElecStatus(monthKey) {
  const stats = monthElecStats(monthKey);
  const isActive = monthKey === activeMonthKey();
  if (!stats.hasData) {
    return { label: isActive ? "Mois en cours" : "Consultation", cls: isActive ? "badge-current" : "badge-past" };
  }
  if (stats.toPay <= 0.005) return { label: "Clôturé", cls: "badge-current" };
  return { label: isActive ? "Mois en cours" : "En attente", cls: isActive ? "badge-current" : "badge-danger" };
}

export function monthWaterStatus(monthKey) {
  const stats = monthWaterStats(monthKey);
  const isActive = monthKey === activeMonthKey();
  if (!stats.hasData) {
    return { label: isActive ? "Mois en cours" : "Consultation", cls: isActive ? "badge-current" : "badge-past" };
  }
  if (stats.toPay <= 0.005) return { label: "Clôturé", cls: "badge-current" };
  return { label: isActive ? "Mois en cours" : "En attente", cls: isActive ? "badge-current" : "badge-danger" };
}

async function ensureBill(monthKey) {
  let bill = getBill(monthKey);
  if (bill) return bill;

  const { data, error } = await supabaseClient.from("utility_bills")
    .insert({ month_key: monthKey }).select().single();
  if (error) { flash(getErrorMessage(error, "Erreur création mois."), true); return null; }
  state.bills.push(data);
  return data;
}

export async function addPerson(firstName, lastName, phone) {
  if (!isAdmin) return false;
  const fn = normalizeName(firstName);
  const ln = normalizeName(lastName);
  if (!fn || !ln) { flash("Prénom et nom obligatoires.", true); return false; }

  const { data, error } = await supabaseClient.from("utility_persons")
    .insert({ first_name: fn, last_name: ln, phone: (phone || "").trim() }).select().single();
  if (error) { flash(getErrorMessage(error, "Erreur ajout personne."), true); return false; }
  state.persons.push(data);
  flash("Personne ajoutée.");
  return true;
}

export async function updatePerson(personId, firstName, lastName, phone) {
  if (!isAdmin) return false;
  const fn = normalizeName(firstName);
  const ln = normalizeName(lastName);
  if (!fn || !ln) { flash("Prénom et nom obligatoires.", true); return false; }

  const { data, error } = await supabaseClient.from("utility_persons")
    .update({ first_name: fn, last_name: ln, phone: (phone || "").trim() })
    .eq("id", personId).select().single();
  if (error) { flash(getErrorMessage(error, "Erreur mise à jour personne."), true); return false; }
  const p = state.persons.find(x => x.id === personId);
  if (p) Object.assign(p, data);
  flash("Personne mise à jour.");
  return true;
}

export async function setPersonAppOwner(personId) {
  if (!isAdmin) return false;
  const ok = await setAppOwner(personId);
  if (!ok) return false;
  state.persons.forEach(p => { p.is_app_owner = p.id === personId; });
  return true;
}

export async function saveElecBillTotal(monthKey, billTotal) {
  if (!isAdmin) return false;
  const total = Number(billTotal);
  if (!Number.isFinite(total) || total <= 0) { flash("Facture électricité invalide.", true); return false; }

  const bill = await ensureBill(monthKey);
  if (!bill) return false;

  const { error: billErr } = await supabaseClient.from("utility_bills")
    .update({ elec_bill_total: total, updated_at: new Date().toISOString() })
    .eq("id", bill.id);
  if (billErr) { flash(getErrorMessage(billErr, "Erreur enregistrement facture élec."), true); return false; }
  bill.elec_bill_total = total;

  await recalcElecShares(monthKey, true);
  flash("Facture électricité enregistrée.");
  return true;
}

function buildSingleElecEntry(monthKey, bill, personId, inp) {
  const p = state.persons.find(x => x.id === personId);
  if (!p) return null;
  if (elecReading(bill.id, personId)?.paid_at) return null;

  const existing = elecReading(bill.id, personId);
  let prev = getPrevMeter(monthKey, personId);
  if (isFirstEauMonth(monthKey)) {
    const rawPrev = inp?.prevMeter ?? (existing ? existing.prev_meter : null);
    prev = Number(rawPrev);
    if (!Number.isFinite(prev) || prev < 0) {
      flash(`Relevé ${monthLabel(previousMonthKey(monthKey))} invalide pour ${personName(p)}.`, true);
      return null;
    }
  } else if (prev == null) {
    flash(`Relevé précédent manquant pour ${personName(p)}.`, true);
    return null;
  }

  const rawCurr = inp?.currMeter ?? (existing ? existing.curr_meter : null);
  const curr = Number(rawCurr);
  if (!Number.isFinite(curr) || curr < prev) {
    flash(`Relevé ${monthLabel(monthKey)} invalide pour ${personName(p)}.`, true);
    return null;
  }
  return { personId, conso: calcElecConso(prev, curr), prev, curr };
}

function collectElecEntriesFromSaved(bill) {
  const entries = [];
  for (const p of state.persons) {
    if (elecReading(bill.id, p.id)?.paid_at) continue;
    const r = elecReading(bill.id, p.id);
    if (!r || r.curr_meter == null || r.prev_meter == null) return null;
    const prev = Number(r.prev_meter);
    const curr = Number(r.curr_meter);
    if (!Number.isFinite(prev) || !Number.isFinite(curr) || curr < prev) return null;
    entries.push({ personId: p.id, conso: calcElecConso(prev, curr), prev, curr });
  }
  const unpaidCount = state.persons.filter(x => !elecReading(bill.id, x.id)?.paid_at).length;
  if (entries.length !== unpaidCount || unpaidCount === 0) return null;
  return entries;
}

async function upsertElecReading(bill, personId, prev, curr, shareAmount) {
  const existing = elecReading(bill.id, personId);
  const payload = {
    bill_id: bill.id,
    person_id: personId,
    prev_meter: prev,
    curr_meter: curr,
    share_amount: shareAmount,
  };

  if (existing) {
    const { data, error } = await supabaseClient.from("utility_elec_readings")
      .update(payload).eq("id", existing.id).select().single();
    if (error) { flash(getErrorMessage(error, "Erreur enregistrement relevé."), true); return false; }
    Object.assign(existing, data);
  } else {
    const { data, error } = await supabaseClient.from("utility_elec_readings")
      .insert(payload).select().single();
    if (error) { flash(getErrorMessage(error, "Erreur enregistrement relevé."), true); return false; }
    state.elecReadings.push(data);
  }
  return true;
}

async function recalcElecShares(monthKey, silent = false) {
  const bill = getBill(monthKey);
  if (!bill?.elec_bill_total) return true;

  const entries = collectElecEntriesFromSaved(bill);
  if (!entries) return true;

  const shares = calcElecShares(bill.elec_bill_total, entries);
  if (!shares) {
    if (!silent) flash("Impossible de calculer les parts électricité.", true);
    return false;
  }

  for (const sh of shares) {
    const entry = entries.find(e => e.personId === sh.personId);
    const ok = await upsertElecReading(
      bill, sh.personId, entry.prev, entry.curr,
      roundShare(sh.share),
    );
    if (!ok) return false;
  }
  return true;
}

export async function saveElecMeters(monthKey, personId, inp, silent = false) {
  if (!isAdmin) return false;
  if (state.persons.length === 0) { flash("Ajoutez des personnes dans le Référentiel.", true); return false; }

  const bill = await ensureBill(monthKey);
  if (!bill) return false;

  const entry = buildSingleElecEntry(monthKey, bill, personId, inp);
  if (!entry) return false;

  const ok = await upsertElecReading(bill, personId, entry.prev, entry.curr, 0);
  if (!ok) return false;

  if (bill.elec_bill_total != null) {
    const recalcOk = await recalcElecShares(monthKey, true);
    if (!recalcOk) return false;
  }

  if (!silent) flash("Relevé enregistré.");
  return true;
}

export async function saveElecMonth(monthKey, billTotal, personInputs) {
  if (!isAdmin) return false;
  const ok = await saveElecBillTotal(monthKey, billTotal);
  if (!ok) return false;
  for (const p of state.persons) {
    const inp = personInputs[p.id];
    if (inp && (inp.currMeter || inp.prevMeter)) {
      const meterOk = await saveElecMeters(monthKey, p.id, inp, true);
      if (!meterOk) return false;
    }
  }
  return true;
}

export async function saveWaterMonth(monthKey, billTotal) {
  if (!isAdmin) return false;
  if (state.persons.length === 0) { flash("Ajoutez des personnes dans le Référentiel.", true); return false; }

  const total = Number(billTotal);
  if (!Number.isFinite(total) || total <= 0) { flash("Facture eau invalide.", true); return false; }

  const share = calcWaterShare(total, state.persons.length);
  if (share == null) { flash("Impossible de calculer la part eau.", true); return false; }

  const bill = await ensureBill(monthKey);
  if (!bill) return false;

  const { error: billErr } = await supabaseClient.from("utility_bills")
    .update({ water_bill_total: total, updated_at: new Date().toISOString() })
    .eq("id", bill.id);
  if (billErr) { flash(getErrorMessage(billErr, "Erreur enregistrement facture eau."), true); return false; }
  bill.water_bill_total = total;

  const roundedShare = roundShare(share);

  for (const p of state.persons) {
    if (waterShare(bill.id, p.id)?.paid_at) continue;
    const existing = waterShare(bill.id, p.id);
    const payload = {
      bill_id: bill.id,
      person_id: p.id,
      share_amount: roundedShare,
    };

    if (existing) {
      const { data, error } = await supabaseClient.from("utility_water_shares")
        .update(payload).eq("id", existing.id).select().single();
      if (error) { flash(getErrorMessage(error, "Erreur enregistrement part eau."), true); return false; }
      Object.assign(existing, data);
    } else {
      const { data, error } = await supabaseClient.from("utility_water_shares")
        .insert(payload).select().single();
      if (error) { flash(getErrorMessage(error, "Erreur enregistrement part eau."), true); return false; }
      state.waterShares.push(data);
    }
  }

  flash("Eau enregistrée.");
  return true;
}

export async function markElecPaid(monthKey, personId) {
  if (!isAdmin) return false;
  const bill = getBill(monthKey);
  const r = bill ? elecReading(bill.id, personId) : null;
  if (!r) { flash("Aucune part électricité à payer.", true); return false; }
  if (r.paid_at) return true;

  const p = state.persons.find(x => x.id === personId);
  if (p?.is_app_owner) {
    await loadWalletData();
    const walletOk = await syncUtilityPayment({
      monthKey,
      personName: personName(p),
      amount: Number(r.share_amount),
      sourceType: "elec_pay",
      refKey: `elec:${r.id}`,
    });
    if (!walletOk) return false;
  }

  const { data, error } = await supabaseClient.from("utility_elec_readings")
    .update({ paid_at: new Date().toISOString() }).eq("id", r.id).select().single();
  if (error) { flash(getErrorMessage(error, "Erreur paiement électricité."), true); return false; }
  Object.assign(r, data);
  flash("Paiement électricité enregistré.");
  return true;
}

export async function markWaterPaid(monthKey, personId) {
  if (!isAdmin) return false;
  const bill = getBill(monthKey);
  const s = bill ? waterShare(bill.id, personId) : null;
  if (!s) { flash("Aucune part eau à payer.", true); return false; }
  if (s.paid_at) return true;

  const p = state.persons.find(x => x.id === personId);
  if (p?.is_app_owner) {
    await loadWalletData();
    const walletOk = await syncUtilityPayment({
      monthKey,
      personName: personName(p),
      amount: Number(s.share_amount),
      sourceType: "water_pay",
      refKey: `water:${s.id}`,
    });
    if (!walletOk) return false;
  }

  const { data, error } = await supabaseClient.from("utility_water_shares")
    .update({ paid_at: new Date().toISOString() }).eq("id", s.id).select().single();
  if (error) { flash(getErrorMessage(error, "Erreur paiement eau."), true); return false; }
  Object.assign(s, data);
  flash("Paiement eau enregistré.");
  return true;
}

export function recapBadge(recap) {
  if (recap.total <= 0) return { label: "Non saisi", cls: "badge-past" };
  if (recap.elecPaid && recap.waterPaid) return { label: "Payé", cls: "badge-current" };
  if (recap.elecPaid || recap.waterPaid) return { label: "Partiel", cls: "badge-danger" };
  return { label: "En attente", cls: "badge-danger" };
}
