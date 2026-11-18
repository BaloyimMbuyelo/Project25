// Display formats from the style guide (System Design Table 29):
// Rand as R275.00, dates as 07 Oct 2026, date-times as 07 Oct 2026 19:42.

export const formatRand = (value) => `R${Number(value || 0).toFixed(2)}`;

export const todayISO = () => new Date().toLocaleDateString('en-CA');

export function addDaysISO(dateString, days) {
  const d = new Date(`${dateString}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-CA');
}

export function formatDate(dateString) {
  if (!dateString) return '';
  return new Date(`${dateString.slice(0, 10)}T00:00:00`).toLocaleDateString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  const date = d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${date} ${time}`;
}

export function formatTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export const initials = (name = '') =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('') || 'U';
