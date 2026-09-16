export const APP_START_MONTH = "2026-09";
export const EAU_START_MONTH = "2026-08";
export const TRESORERIE_START_MONTH = APP_START_MONTH;

export function pad(n) { return n < 10 ? "0" + n : "" + n; }
export function toISO(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
export function parseISODate(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
export function addDays(d, n) { const r = new Date(d); r.setDate(d.getDate() + n); return r; }

export function getWeekStart(d) {
  const day = d.getDay();
  const diff = (day - 6 + 7) % 7;
  const ws = new Date(d); ws.setDate(d.getDate() - diff); ws.setHours(0, 0, 0, 0);
  return ws;
}

export function getMonthKey(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1); }

export function monthLabel(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  const s = d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function monthChipLabel(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  const s = d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
  return s.charAt(0).toUpperCase() + s.slice(1).replace(".", "");
}

export function formatDateShort(d) { return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }); }
export function formatDateFull(d) { return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }); }

export function getWeekNumberInMonth(weekStart) {
  const year = weekStart.getFullYear(), month = weekStart.getMonth();
  let d = new Date(year, month, 1);
  while (d.getDay() !== 6) d.setDate(d.getDate() + 1);
  let n = 1;
  while (d.getTime() < weekStart.getTime()) { d.setDate(d.getDate() + 7); n++; }
  return n;
}

export function getWeeksOfMonth(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  const last = new Date(y, m, 0);
  const weeks = [];
  let d = new Date(y, m - 1, 1);
  while (d <= last) { if (d.getDay() === 6) weeks.push(new Date(d)); d.setDate(d.getDate() + 1); }
  return weeks;
}

export function activeMonthKey() { return getMonthKey(getWeekStart(new Date())); }

export function monthsRange(startMonth = APP_START_MONTH) {
  return monthsRangeFrom(startMonth);
}

export function monthsRangeFrom(startMonth) {
  const [sy, sm] = startMonth.split("-").map(Number);
  const [ay, am] = activeMonthKey().split("-").map(Number);
  const end = new Date(ay, am - 1 + 6, 1);
  let d = new Date(sy, sm - 1, 1);
  const list = [];
  while (d <= end) { list.push(getMonthKey(d)); d.setMonth(d.getMonth() + 1); }
  return list;
}

export function previousMonthKey(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return getMonthKey(d);
}

export function money(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function moneyRound(n) {
  const v = Math.round(Number(n) || 0);
  return v.toLocaleString("fr-FR", { maximumFractionDigits: 0 });
}

/** Arrondi entier pour parts utility (505,86 → 506) */
export function roundShare(n) {
  return Math.round(Number(n) || 0);
}

export function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function toTitleCase(s) {
  return s.split(" ").filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

export function normalizeName(name) {
  return toTitleCase(name.trim());
}

let toastTimer = null;

export function flash(msg, isError = false) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
  el.style.background = isError ? "var(--danger)" : "var(--ink)";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.display = "none"; }, 2800);
}

export function getErrorMessage(error, fallback) {
  if (!error) return fallback;
  const msg = error.message || "";
  if (msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("Load failed")) {
    return "Connexion impossible. Vérifiez votre réseau ou réessayez plus tard.";
  }
  return msg || fallback;
}

export function renderDateField(name, { value = "", required = true, extraClass = "", placeholder = "Choisir une date" } = {}) {
  const val = value ? ` value="${value}"` : "";
  const req = required ? " required" : "";
  return `
    <div class="date-field">
      <input class="field field-date ${extraClass}" name="${name}" type="date"${req}${val} />
      <span class="date-field-placeholder">${esc(placeholder)}</span>
    </div>`;
}
