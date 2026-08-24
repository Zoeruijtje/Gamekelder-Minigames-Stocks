/**
 * Supabase transport for the cross-device implementation.
 *
 * This module is inert until `supabase-config.js` contains a public project URL
 * and publishable key. It never accepts elevated keys.
 */
export class OnlineGameAdapter {
  constructor(config = window.__FE_SUPABASE__ ?? {}) {
    this.config = config;
    this.enabled = Boolean(config.url && config.publishableKey);
    this.client = null;
    this.channels = new Map();
  }

  async connect() {
    if (!this.enabled) return { enabled: false, reason: 'Supabase is not configured.' };
    if (String(this.config.publishableKey).startsWith('sb_secret_')) {
      throw new Error('Refusing to initialize with a Supabase secret key.');
    }
    if (this.client) return { enabled: true, client: this.client };
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    this.client = createClient(this.config.url, this.config.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      realtime: { params: { eventsPerSecond: 10 } },
    });
    return { enabled: true, client: this.client };
  }

  async ensureAnonymousIdentity(displayName = 'Guest') {
    await this.connect();
    const { data: sessionData } = await this.client.auth.getSession();
    if (sessionData.session?.user) return sessionData.session.user;
    const { data, error } = await this.client.auth.signInAnonymously({ options: { data: { display_name: displayName } } });
    if (error) throw error;
    return data.user;
  }

  async createRoom(name, settings) {
    await this.ensureAnonymousIdentity();
    const { data, error } = await this.client.rpc('create_room', { p_name: name, p_settings: settings });
    if (error) throw error;
    return data;
  }

  async joinRoom(code) {
    await this.ensureAnonymousIdentity();
    const { data, error } = await this.client.rpc('join_room', { p_code: String(code).toUpperCase() });
    if (error) throw error;
    return data;
  }

  async roomSnapshot(roomId) {
    await this.connect();
    const [room, members, sessions, news] = await Promise.all([
      this.client.from('rooms').select('*').eq('id', roomId).single(),
      this.client.from('room_members').select('*, profiles(*)').eq('room_id', roomId).order('seat'),
      this.client.from('sessions').select('*, rounds(*), friend_assets(*)').eq('room_id', roomId).order('created_at', { ascending: false }).limit(1),
      this.client.from('news_events').select('*').eq('room_id', roomId).order('created_at', { ascending: false }).limit(50),
    ]);
    for (const response of [room, members, sessions, news]) if (response.error) throw response.error;
    return { room: room.data, members: members.data, session: sessions.data?.[0] ?? null, news: news.data };
  }

  subscribeRoom(roomId, handlers = {}) {
    if (!this.client) throw new Error('Call connect before subscribing.');
    this.unsubscribeRoom(roomId);
    const topic = `room:${roomId}:public`;
    const fallbackPresenceKey = `presence_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const channel = this.client.channel(topic, { config: { private: true, presence: { key: handlers.presenceKey ?? fallbackPresenceKey } } });
    channel
      .on('broadcast', { event: '*' }, (payload) => handlers.onEvent?.(payload))
      .on('presence', { event: 'sync' }, () => handlers.onPresence?.(channel.presenceState()))
      .on('presence', { event: 'join' }, (payload) => handlers.onPresenceJoin?.(payload))
      .on('presence', { event: 'leave' }, (payload) => handlers.onPresenceLeave?.(payload))
      .subscribe(async (status, error) => {
        handlers.onStatus?.(status, error);
        if (status === 'SUBSCRIBED') await channel.track({ online_at: new Date().toISOString(), role: handlers.role ?? 'player' });
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

  async submitRound(roundId, payload, clientNonce = `submit_${Date.now()}_${Math.random().toString(36).slice(2)}`) {
    await this.connect();
    const { data, error } = await this.client.rpc('submit_round_input', {
      p_round_id: roundId,
      p_payload: payload,
      p_client_nonce: clientNonce,
    });
    if (error) throw error;
    return data;
  }

  async settleRound(roundId, force = false) {
    await this.connect();
    const { data, error } = await this.client.functions.invoke('settle-round', { body: { round_id: roundId, force } });
    if (error) throw error;
    return data;
  }

  async executeOrder(order) {
    await this.connect();
    const { data, error } = await this.client.rpc('execute_paper_order', {
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

  async quotes(symbols) {
    await this.connect();
    const { data, error } = await this.client.functions.invoke('market-quotes', { body: { symbols } });
    if (error) throw error;
    return data;
  }
}
