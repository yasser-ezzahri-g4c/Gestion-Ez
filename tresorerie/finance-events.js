import { supabaseClient } from "../shared/supabase.js";
import { flash, getErrorMessage } from "../shared/utils.js";

let eventsCache = [];
let eventsAvailable = true;

export function resetFinanceEvents() {
  eventsCache = [];
  eventsAvailable = true;
}

export function getFinanceEvents() {
  return eventsCache;
}

export function areFinanceEventsAvailable() {
  return eventsAvailable;
}

export async function loadFinanceEvents() {
  const { data, error } = await supabaseClient.from("finance_events")
    .select("*")
    .order("starts_at", { ascending: false });
  if (error) {
    eventsCache = [];
    eventsAvailable = false;
    return [];
  }
  eventsCache = data || [];
  eventsAvailable = true;
  return eventsCache;
}

export function getActiveFinanceEvent(at = new Date()) {
  const timestamp = at.getTime();
  return eventsCache.find(event => {
    const start = new Date(event.starts_at).getTime();
    const end = new Date(event.ends_at).getTime();
    return start <= timestamp && timestamp <= end;
  }) || null;
}

export async function createFinanceEvent({ name, icon, startsAt, endsAt }) {
  const normalizedName = String(name || "").normalize("NFKC").trim().replace(/\s+/g, " ");
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (!normalizedName) { flash("Le nom de l’événement est obligatoire.", true); return false; }
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    flash("Les dates de début et de fin sont obligatoires.", true);
    return false;
  }
  if (end <= start) { flash("La fin doit être postérieure au début.", true); return false; }

  const overlap = eventsCache.some(event => (
    start < new Date(event.ends_at) && end > new Date(event.starts_at)
  ));
  if (overlap) {
    flash("Cette période chevauche un événement existant.", true);
    return false;
  }

  const { data, error } = await supabaseClient.from("finance_events")
    .insert({
      name: normalizedName,
      icon: String(icon || "").trim() || null,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
    })
    .select()
    .single();
  if (error) {
    flash(getErrorMessage(error, "Impossible de créer l’événement."), true);
    return false;
  }
  eventsCache.unshift(data);
  flash("Événement créé. Les transactions de la période ont été regroupées.");
  return data;
}
