export function money(value, digits = 2) {
  return new Intl.NumberFormat('en-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(value) || 0);
}

export function number(value, digits = 0) {
  return new Intl.NumberFormat('en-NL', {
    maximumFractionDigits: digits,
  }).format(Number(value) || 0);
}

export function signedPercent(value, digits = 2) {
  const numeric = Number(value) || 0;
  return `${numeric >= 0 ? '+' : '−'}${Math.abs(numeric).toFixed(digits)}%`;
}

export function signedMoney(value, digits = 2) {
  const numeric = Number(value) || 0;
  return `${numeric >= 0 ? '+' : '−'}${money(Math.abs(numeric), digits)}`;
}

export function time(seconds) {
  const safe = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(safe / 60);
  const remaining = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`;
}

export function ago(iso) {
  const difference = Math.max(0, Date.now() - new Date(iso).getTime());
  if (difference < 60000) return 'just now';
  if (difference < 3600000) return `${Math.floor(difference / 60000)}m ago`;
  if (difference < 86400000) return `${Math.floor(difference / 3600000)}h ago`;
  return `${Math.floor(difference / 86400000)}d ago`;
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
