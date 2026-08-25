import { createInitialState, normalizeState, tickRealQuotes } from './engine/session.js';
import { LocalStateTransport } from './services/storage.js';

function persistenceSafeState(state) {
  const safe = structuredClone(state);
  if (safe.admin) {
    safe.admin = {
      enabled: Boolean(safe.admin.enabled),
      status: 'signed-out',
      user: null,
      role: null,
      snapshot: null,
      publicConfig: safe.admin.publicConfig ?? null,
      section: safe.admin.section ?? 'overview',
      returnRoute: safe.admin.returnRoute ?? 'landing',
      error: null,
      busy: false,
    };
  }
  return safe;
}

export class AppStore {
  constructor() {
    this.transport = new LocalStateTransport();
    this.state = this.transport.load(createInitialState());
    this.listeners = new Set();
    this.transport.subscribe((incoming) => {
      if (incoming.updatedAt === this.state.updatedAt) return;
      const ephemeralAdmin = this.state.admin;
      this.state = ephemeralAdmin ? { ...incoming, admin: ephemeralAdmin } : incoming;
      this.emit({ remote: true });
    });
  }

  getState() {
    return this.state;
  }

  setState(nextState, meta = {}) {
    const normalized = normalizeState({ ...nextState, updatedAt: new Date().toISOString() });
    this.state = normalized;
    if (meta.persist !== false) {
      this.transport.save(persistenceSafeState(normalized), !meta.remote);
    }
    this.emit(meta);
    return normalized;
  }

  update(updater, meta = {}) {
    const current = this.state;
    const next = updater(structuredClone(current));
    return this.setState(next ?? current, meta);
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.state, { initial: true });
    return () => this.listeners.delete(listener);
  }

  emit(meta = {}) {
    this.listeners.forEach((listener) => listener(this.state, meta));
  }

  reset() {
    this.transport.clear();
    this.setState(createInitialState());
  }

  tickQuotes() {
    if (document.hidden) return;
    this.setState(tickRealQuotes(this.state), { quoteTick: true });
  }
}
