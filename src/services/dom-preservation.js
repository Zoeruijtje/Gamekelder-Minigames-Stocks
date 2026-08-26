const FIELD_SELECTOR = 'input[name], textarea[name], select[name], [contenteditable="true"][data-preserve-key]';
const SCROLL_SELECTOR = '.order-modal, .position-modal, .game-modal, .results-modal, .table-scroll, [data-preserve-scroll]';

function scopeKey(node) {
  const explicit = node.closest('[data-preserve-scope]')?.dataset.preserveScope;
  if (explicit) return explicit;
  const form = node.closest('form[data-form]');
  const modal = node.closest('[data-modal-key]');
  const player = node.closest('[data-player-row]');
  return [
    modal?.dataset.modalKey,
    form?.dataset.form,
    player?.dataset.playerRow,
  ].filter(Boolean).join(':') || 'page';
}

function fieldKey(node) {
  const base = node.getAttribute('name') || node.dataset.preserveKey || node.id || node.tagName;
  const variant = (node.type === 'radio' || node.type === 'checkbox') ? `:${node.value || 'checked'}` : '';
  return `${scopeKey(node)}::${base}${variant}`;
}

export function captureDomInteraction(root) {
  if (!root) return null;
  const active = document.activeElement && root.contains(document.activeElement) ? document.activeElement : null;
  const fields = new Map();
  root.querySelectorAll(FIELD_SELECTOR).forEach((node) => {
    fields.set(fieldKey(node), {
      value: node.isContentEditable ? node.textContent : node.value,
      checked: 'checked' in node ? node.checked : undefined,
      selectionStart: typeof node.selectionStart === 'number' ? node.selectionStart : null,
      selectionEnd: typeof node.selectionEnd === 'number' ? node.selectionEnd : null,
    });
  });
  const scrolls = [...root.querySelectorAll(SCROLL_SELECTOR)].map((node, index) => ({
    key: node.dataset.preserveScroll || `${node.className}:${index}`,
    top: node.scrollTop,
    left: node.scrollLeft,
  }));
  const details = [...root.querySelectorAll('details')].map((node, index) => ({ key: node.dataset.preserveKey || `details:${index}`, open: node.open }));
  return {
    fields,
    activeKey: active ? fieldKey(active) : null,
    scrolls,
    details,
  };
}

export function restoreDomInteraction(root, snapshot) {
  if (!root || !snapshot) return;
  root.querySelectorAll(FIELD_SELECTOR).forEach((node) => {
    const saved = snapshot.fields.get(fieldKey(node));
    if (!saved) return;
    if (node.isContentEditable) node.textContent = saved.value;
    else if (node.type === 'checkbox' || node.type === 'radio') node.checked = Boolean(saved.checked);
    else node.value = saved.value;
  });
  const scrolls = new Map(snapshot.scrolls.map((item) => [item.key, item]));
  [...root.querySelectorAll(SCROLL_SELECTOR)].forEach((node, index) => {
    const saved = scrolls.get(node.dataset.preserveScroll || `${node.className}:${index}`);
    if (saved) {
      node.scrollTop = saved.top;
      node.scrollLeft = saved.left;
    }
  });
  const details = new Map(snapshot.details.map((item) => [item.key, item.open]));
  [...root.querySelectorAll('details')].forEach((node, index) => {
    const key = node.dataset.preserveKey || `details:${index}`;
    if (details.has(key)) node.open = details.get(key);
  });
  if (snapshot.activeKey) {
    const target = [...root.querySelectorAll(FIELD_SELECTOR)].find((node) => fieldKey(node) === snapshot.activeKey);
    if (target) {
      target.focus({ preventScroll: true });
      const saved = snapshot.fields.get(snapshot.activeKey);
      if (saved && typeof target.setSelectionRange === 'function' && saved.selectionStart !== null) {
        try { target.setSelectionRange(saved.selectionStart, saved.selectionEnd); } catch { /* unsupported input type */ }
      }
    }
  }
}

export function isEditingInteraction() {
  const active = document.activeElement;
  return Boolean(active?.matches?.('input, textarea, select, [contenteditable="true"]'));
}
