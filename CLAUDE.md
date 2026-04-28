# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Discord-integrated whitelist application system. Users authenticate via Discord OAuth, submit application forms (text + audio answers), and admins review/approve/deny from a dashboard. Approved users get Discord roles assigned via bot. Supports multiple custom forms, revision requests, and re-apply cooldowns.

## Commands

```bash
npm run dev              # Start dev server on port 3000
npm run build            # prisma generate + next build
npm start                # prisma db push + next start (production)
npx prisma db push       # Push schema changes to database
npx prisma generate      # Regenerate Prisma client after schema changes
npx prisma studio        # Browse database in browser
```

No test or lint commands are configured.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript (strict mode)
- **Database**: PostgreSQL via Prisma ORM
- **Auth**: NextAuth.js with Discord OAuth2
- **External Services**: Discord.js (bot/role management), Cloudinary (audio storage)
- **Styling**: Tailwind CSS + custom dark parchment theme (globals.css)
- **Fonts**: Courier Prime (body), Special Elite (headings)
- **Deployment**: Railway

## Architecture

### Directory Layout

- `app/` — Next.js App Router pages and API routes
- `lib/` — Shared utilities (auth, discord, permissions, cloudinary, prisma)
- `prisma/schema.prisma` — Database schema (Form, Application, Question, Answer)
- `types/next-auth.d.ts` — Extended NextAuth session types

### Key Modules in `lib/`

- **auth.ts** — NextAuth config with Discord provider; JWT callback fetches user roles from Discord API and embeds `isAdmin` + `roles[]` into session
- **discord.ts** — Discord bot API wrapper using direct REST calls (not discord.js client); handles role assignment/removal, DMs, webhooks, guild membership checks
- **permissions.ts** — Role-based access control: admin roles from `ADMIN_ROLE_IDS` env var, per-form reviewer roles via `reviewerRoleId` field
- **cloudinary.ts** — Audio file upload/delete to Cloudinary (base64 → WebM)
- **prisma.ts** — Prisma client singleton

### Data Model

- **Form** — Custom application forms with slug, assigned Discord role, reviewer role, cooldown days
- **Question** — Belongs to a form (or null = default whitelist form); types: `text | textarea | audio`
- **Application** — User submission with status `pending | approved | denied | revision`; tracks reviewer info
- **Answer** — Links to application + question; stores `textAnswer` and/or `audioUrl`

Questions/applications with `formId = null` belong to the default whitelist form.

### Permission Model

- **Admin**: user has any role in `ADMIN_ROLE_IDS` env var → full access
- **Whitelist Reviewer**: user has `WHITELIST_REVIEWER_ROLE_ID` → can review default whitelist applications
- **Form Reviewer**: user has the form's `reviewerRoleId` → can review that form's applications only
- Permission checks happen server-side in API routes via functions in `lib/permissions.ts`

### Application Flow

1. User logs in via Discord OAuth → session includes Discord roles
2. `check-guild` API verifies user is in the Discord server
3. User fills out form (text answers + audio recordings via MediaRecorder API)
4. Submission sends FormData (audio as Blobs) → API uploads audio to Cloudinary
5. Admin reviews → approve (assigns Discord role + DM), deny (DM with reason), or request revision
6. Revision: user re-answers flagged questions, application returns to pending
7. Denied users have a configurable cooldown before re-applying

### API Route Conventions

- All admin routes under `app/api/admin/` check permissions via session roles
- Public routes: `check-guild`, `questions`, `my-application`, `apply`, `forms/[slug]`
- Audio files sent as FormData blobs, not JSON
- Discord API calls use a shared `discordFetch` helper that handles 204 No Content responses

### Environment Variables

See `.env.example`. Key variables:
- `ADMIN_ROLE_IDS` — comma-separated Discord role IDs (note: `.env.example` shows `ADMIN_DISCORD_IDS` but code uses `ADMIN_ROLE_IDS`)
- `DISCORD_WHITELIST_ROLE_ID` — role assigned on default whitelist approval
- `STAFF_WEBHOOK_URL` — optional webhook for staff notifications
- `NEXT_PUBLIC_SERVER_NAME` — displayed in UI branding

### Path Alias

`@/*` maps to the project root (configured in tsconfig.json).
