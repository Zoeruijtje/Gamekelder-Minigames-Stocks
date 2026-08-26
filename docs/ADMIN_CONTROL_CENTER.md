# Administrator control center

The global control center is separate from temporary player identities and room-host permissions.

## Login-only access

There is no public administrator setup or bootstrap form. The owner email is prefilled on the login screen. The initial temporary credential is provisioned through a rate-limited server function and the first successful owner login closes the provisioning path permanently.

The first login is forced into a password-change screen before any administrative data or controls are shown. The permanent password is sent directly to Supabase Auth and is not stored in application state or committed to GitHub.

## Permissions

- **Room host:** controls one room, lobby settings and phase progression.
- **Editor:** manages game definitions and curated content.
- **Admin:** manages global defaults, game data and operational rooms.
- **Owner:** highest global role.

Browser access to the underlying administration tables is denied. The UI calls server-authorized RPC functions and receives only the data needed for the control center.

## Capabilities

The control center can:

- enable or disable games;
- edit names, descriptions, instructions, durations and validated configuration;
- edit curated questions, comparisons, prompts and patterns;
- change public room defaults;
- inspect active rooms and recent audit events;
- archive a broken or abandoned room.

A currently active round keeps the immutable configuration generated when it began. Global changes affect future sessions and future ungenerated rounds.
