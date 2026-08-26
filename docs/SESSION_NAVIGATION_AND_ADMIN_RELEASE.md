# Session navigation and admin release

This release adds safe navigation and an owner-only control center without exposing privileged credentials in the browser.

## Session navigation

Every active room, trading phase, minigame, settlement and session-complete screen exposes a session menu. Players can:

- return to the active room;
- return to the public main menu without deleting the room;
- resume a locally persisted room;
- leave an online room;
- let the online host return a room to an editable lobby;
- start a new local setup after ending a local session.

Returning to the public menu is navigation only. It does not silently cancel an online room or erase session state.

## Administration model

The global control center uses a separate Supabase Auth session from temporary player identities. Global administrator access is stored in database roles and checked server-side.

The owner uses a login-only account. The initial temporary credential is provisioned server-side and must be replaced on first login; there is no public setup form.

An owner or administrator can:

- enable or disable games globally;
- change public game names, descriptions, instructions, durations and category mappings;
- edit curated game content JSON;
- change public platform defaults;
- inspect active rooms and recent audit events;
- return a room to the lobby;
- close a room;
- inspect and edit current lobby rules as the room host.

No Supabase secret key, service-role credential, database password or administrator bootstrap code is committed to the frontend.

## Safety boundaries

- Player and admin Auth sessions use distinct browser storage keys.
- Temporary guests never inherit administrator privileges.
- Authorization uses database roles, RLS, explicit function grants and server-side checks.
- Game-definition changes are validated before storage and applied at runtime through a read-only public configuration function.
- Room edits are allowed only in a lobby unless the owner explicitly invokes a server-side control action.
- All privileged actions append audit events.
