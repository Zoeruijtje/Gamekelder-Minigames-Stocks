import { createInitialState, normalizeState, tickRealQuotes } from './engine/session.js';
import { LocalStateTransport } from './services/storage.js';

export class AppStore {
  constructor() {
    this.transport = new LocalStateTransport();
    this.state = this.transport.load(createInitialState());
    this.listeners = new Set();
    this.transport.subscribe((incoming) => {
      if (incoming.updatedAt === this.state.updatedAt) return;
      this.state = incoming;
      this.emit({ remote: true });
    });
  }

  getState() {
    return this.state;
  }

  setState(nextState, meta = {}) {
    const normalized = normalizeState({ ...nextState, updatedAt: new Date().toISOString() });
    this.state = normalized;
    this.transport.save(normalized, !meta.remote);
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
