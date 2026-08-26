/**
 * Separate Supabase client for site administration.
 *
 * The storage key is intentionally different from the player/guest client so
 * an administrator can manage the site without replacing an active game-room
 * identity in the same browser.
 */
export class AdminAdapter {
  constructor(config = globalThis.__FE_SUPABASE__ ?? {}) {
    this.config = config;
    this.enabled = Boolean(config.url && config.publishableKey);
    this.client = null;
    this.db = null;
  }

  async connect() {
    if (!this.enabled) return { enabled: false, reason: 'Supabase is not configured.' };
    if (String(this.config.publishableKey).startsWith('sb_secret_')) {
      throw new Error('Refusing to initialize the admin client with a Supabase secret key.');
    }
    if (this.client) return { enabled: true, client: this.client };
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.111.0');
    this.client = createClient(this.config.url, this.config.publishableKey, {
      auth: {
        storageKey: 'friend-exchange-admin-auth-v1',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
      realtime: { params: { eventsPerSecond: 2 } },
    });
    this.db = this.client.schema('friend_exchange');
    return { enabled: true, client: this.client };
  }

  async currentUser() {
    await this.connect();
    if (!this.client) return null;
    const { data, error } = await this.client.auth.getUser();
    if (error) return null;
    return data.user ?? null;
  }

  async publicConfig() {
    await this.connect();
    if (!this.db) return null;
    const { data, error } = await this.db.rpc('public_app_config');
    if (error) throw error;
    return data;
  }

  async signIn(email, password) {
    await this.connect();
    const normalizedEmail = String(email).trim().toLowerCase();
    const rawPassword = String(password);
    let response = await this.client.auth.signInWithPassword({ email: normalizedEmail, password: rawPassword });
    if (!response.error) return response.data.user;
    if (normalizedEmail !== 'zalessandro1998@gmail.com') throw response.error;

    const provision = await this.client.functions.invoke('admin-login-provision', {
      body: { email: normalizedEmail, password: rawPassword },
    });
    if (provision.error && provision.data?.error !== 'Owner account is already provisioned. Use normal sign in.') {
      throw new Error(provision.data?.error || provision.error.message);
    }
    response = await this.client.auth.signInWithPassword({ email: normalizedEmail, password: rawPassword });
    if (response.error) throw response.error;
    return response.data.user;
  }

  async updatePassword(password) {
    await this.connect();
    const { data: { user } } = await this.client.auth.getUser();
    const metadata = { ...(user?.user_metadata ?? {}), must_change_password: false };
    const { data, error } = await this.client.auth.updateUser({ password: String(password), data: metadata });
    if (error) throw error;
    return data.user;
  }

  async signOut() {
    await this.connect();
    if (!this.client) return;
    const { error } = await this.client.auth.signOut({ scope: 'local' });
    if (error) throw error;
  }


  async snapshot() {
    await this.connect();
    const { data, error } = await this.db.rpc('admin_snapshot');
    if (error) throw error;
    return data;
  }

  async updateGlobalSettings(settings) {
    await this.connect();
    const { data, error } = await this.db.rpc('admin_update_global_settings', {
      p_settings: settings,
    });
    if (error) throw error;
    return data;
  }

  async updateGameDefinition(definition) {
    await this.connect();
    const { data, error } = await this.db.rpc('admin_update_game_definition', {
      p_game_id: definition.id,
      p_enabled: Boolean(definition.enabled),
      p_name: definition.name,
      p_description: definition.description,
      p_instructions: definition.instructions,
      p_duration_seconds: Number(definition.durationSeconds),
      p_config: definition.config ?? {},
    });
    if (error) throw error;
    return data;
  }

  async upsertContent(item) {
    await this.connect();
    const { data, error } = await this.db.rpc('admin_upsert_game_content', {
      p_id: item.id || null,
      p_game_id: item.gameId,
      p_content_type: item.contentType,
      p_payload: item.payload,
      p_active: item.active !== false,
      p_sort_order: Number(item.sortOrder ?? 0),
    });
    if (error) throw error;
    return data;
  }

  async deleteContent(contentId) {
    await this.connect();
    const { data, error } = await this.db.rpc('admin_delete_game_content', {
      p_id: contentId,
    });
    if (error) throw error;
    return data;
  }

  async closeRoom(roomId, reason = 'Closed by site administrator') {
    await this.connect();
    const { data, error } = await this.db.rpc('admin_close_room', {
      p_room_id: roomId,
      p_reason: reason,
    });
    if (error) throw error;
    return data;
  }
}
