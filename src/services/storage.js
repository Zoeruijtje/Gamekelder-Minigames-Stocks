import { CHANNEL_NAME, STORAGE_KEY } from '../config.js';
import { normalizeState } from '../engine/session.js';

export class LocalStateTransport {
  constructor() {
    this.channel = 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL_NAME) : null;
    this.listeners = new Set();
    this.sourceId = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `tab_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    this.channel?.addEventListener('message', (event) => {
      if (!event.data || event.data.sourceId === this.sourceId) return;
      if (event.data.type === 'state') {
        const state = normalizeState(event.data.state);
        this.listeners.forEach((listener) => listener(state, { remote: true }));
      }
    });
    window.addEventListener('storage', (event) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try {
        const state = normalizeState(JSON.parse(event.newValue));
        this.listeners.forEach((listener) => listener(state, { remote: true }));
      } catch {
        // Ignore malformed external storage events.
      }
    });
  }

  load(fallback) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? normalizeState(JSON.parse(raw)) : fallback;
    } catch {
      return fallback;
    }
  }

  save(state, broadcast = true) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Opaque origins, private browsing and storage policies may disable persistence.
      // The in-memory application remains fully usable.
    }
    if (broadcast) this.channel?.postMessage({ type: 'state', sourceId: this.sourceId, state });
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  clear() {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage may be unavailable */ }
    this.channel?.postMessage({ type: 'reset', sourceId: this.sourceId });
  }
}
