/**
 * Supabase transport for cross-device Friend Exchange rooms.
 *
 * Only the public project URL and publishable key are accepted in the browser.
 * All authoritative scoring and market settlement remains server-side.
 */
export class OnlineGameAdapter {
  constructor(config = globalThis.__FE_SUPABASE__ ?? {}) {
    this.config = config;
    this.enabled = Boolean(config.url && config.publishableKey);
    this.client = null;
    this.db = null;
    this.channels = new Map();
  }

  async connect() {
    if (!this.enabled) return { enabled: false, reason: 'Supabase is not configured.' };
    if (String(this.config.publishableKey).startsWith('sb_secret_')) {
      throw new Error('Refusing to initialize with a Supabase secret key.');
    }
    if (this.client) return { enabled: true, client: this.client };
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.111.0');
    this.client = createClient(this.config.url, this.config.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      realtime: { params: { eventsPerSecond: 8 } },
    });
    this.db = this.client.schema('friend_exchange');
    return { enabled: true, client: this.client };
  }

  async currentUser() {
    await this.connect();
    const { data, error } = await this.client.auth.getUser();
    if (error) return null;
    return data.user ?? null;
  }

  async ensureGuestIdentity(displayName = 'Guest') {
    await this.connect();
    const existing = await this.currentUser();
    if (existing) {
      await this.ensureProfile(displayName);
      return existing;
    }

    const { data: credentials, error: guestError } = await this.client.functions.invoke('guest-auth-v2', {
      body: { display_name: displayName },
    });
    if (guestError) throw guestError;
    if (!credentials?.email || !credentials?.password) {
      throw new Error(credentials?.error || 'Could not create a temporary player identity.');
    }

    const { data, error } = await this.client.auth.signInWithPassword({
      email: credentials.email,
      password: credentials.password,
    });
    if (error) throw error;
    await this.ensureProfile(displayName);
    return data.user;
  }

  async ensureProfile(displayName) {
    await this.connect();
    const { data, error } = await this.db.rpc('ensure_profile', { p_display_name: displayName });
    if (error) throw error;
    return data;
  }

  async createRoom(name, settings, displayName) {
    const user = await this.ensureGuestIdentity(displayName);
    const { data, error } = await this.db.rpc('create_room', {
      p_name: name,
      p_settings: settings,
    });
    if (error) throw error;
    return { room: data, user };
  }

  async joinRoom(code, displayName) {
    const user = await this.ensureGuestIdentity(displayName);
    const { data, error } = await this.db.rpc('join_room', {
      p_code: String(code).trim().toUpperCase(),
    });
    if (error) throw error;
    return { room: data, user };
  }

  async roomSnapshot(roomId) {
    await this.connect();
    const { data, error } = await this.db.rpc('room_snapshot', { p_room_id: roomId });
    if (error) throw error;
    if (!data?.room) throw new Error('The room is unavailable or your session has expired.');
    return data;
  }

  async setReady(roomId, ready) {
    await this.connect();
    const { data, error } = await this.db.rpc('set_room_ready', {
      p_room_id: roomId,
      p_ready: Boolean(ready),
    });
    if (error) throw error;
    return data;
  }

  async heartbeat(roomId) {
    await this.connect();
    const { data, error } = await this.db.rpc('heartbeat_room', { p_room_id: roomId });
    if (error) throw error;
    return data;
  }

  async startSession(roomId, settings, gameQueue) {
    await this.connect();
    const { data, error } = await this.db.rpc('start_online_session', {
      p_room_id: roomId,
      p_settings: settings,
      p_game_queue: gameQueue,
    });
    if (error) throw error;
    return data;
  }

  async createRound({ sessionId, sequence, gameType, category, seed, config, tradingSeconds }) {
    await this.connect();
    const { data, error } = await this.db.rpc('create_online_round', {
      p_session_id: sessionId,
      p_sequence: sequence,
      p_game_type: gameType,
      p_category: category,
      p_seed: seed,
      p_config: config,
      p_trading_seconds: tradingSeconds,
    });
    if (error) throw error;
    return data;
  }

  async transitionRound(roundId, expectedVersion, nextStatus, durationSeconds = null) {
    await this.connect();
    const { data, error } = await this.db.rpc('transition_online_round', {
      p_round_id: roundId,
      p_expected_version: expectedVersion,
      p_next_status: nextStatus,
      p_duration_seconds: durationSeconds,
    });
    if (error) throw error;
    return data;
  }

  async expireTradingWindow(roundId) {
    await this.connect();
    const { data, error } = await this.db.rpc('expire_trading_window', {
      p_round_id: roundId,
    });
    if (error) throw error;
    return data;
  }

  async submitRound(roundId, payload, clientNonce = `submit_${Date.now()}_${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`) {
    await this.connect();
    const { data, error } = await this.db.rpc('submit_round_input', {
      p_round_id: roundId,
      p_payload: payload,
      p_client_nonce: clientNonce,
    });
    if (error) throw error;
    return data;
  }

  async settleRound(roundId, force = false) {
    await this.connect();
    const { data, error } = await this.client.functions.invoke('settle-round', {
      body: { round_id: roundId, force },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  }

  async completeRound(roundId) {
    await this.connect();
    const { data, error } = await this.db.rpc('complete_round', { p_round_id: roundId });
    if (error) throw error;
    return data;
  }

  async finishSession(sessionId) {
    await this.connect();
    const { data, error } = await this.db.rpc('finish_online_session', { p_session_id: sessionId });
    if (error) throw error;
    return data;
  }

  async executeOrder(order) {
    await this.connect();
    const { data, error } = await this.db.rpc('execute_paper_order', {
      p_portfolio_id: order.portfolioId,
      p_symbol: order.symbol,
      p_side: order.side,
      p_notional: order.notional ?? null,
      p_quantity: order.quantity ?? null,
      p_idempotency_key: order.idempotencyKey,
    });
    if (error) throw error;
    return data;
  }

  subscribeRoom(roomId, handlers = {}) {
    if (!this.client) throw new Error('Call connect before subscribing.');
    this.unsubscribeRoom(roomId);
    const topic = `room:${roomId}:public`;
    const presenceKey = handlers.presenceKey ?? `presence_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const channel = this.client.channel(topic, {
      config: { private: true, presence: { key: presenceKey } },
    });
    channel
      .on('broadcast', { event: '*' }, (payload) => handlers.onEvent?.(payload))
      .on('presence', { event: 'sync' }, () => handlers.onPresence?.(channel.presenceState()))
      .subscribe(async (status, error) => {
        handlers.onStatus?.(status, error);
        if (status === 'SUBSCRIBED') {
          await channel.track({ online_at: new Date().toISOString(), role: handlers.role ?? 'player' });
        }
      });
    this.channels.set(roomId, channel);
    return () => this.unsubscribeRoom(roomId);
  }

  async unsubscribeRoom(roomId) {
    const channel = this.channels.get(roomId);
    if (!channel || !this.client) return;
    this.channels.delete(roomId);
    await this.client.removeChannel(channel);
  }
}
