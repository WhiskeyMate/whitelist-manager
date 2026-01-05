# Whitelist Manager

A Discord-integrated whitelist application system with audio support.

## Features

- Discord OAuth login (users must be in your server)
- Custom application questions (text, long text, audio)
- Audio recording directly in browser + file upload
- Admin dashboard to review applications
- One-click approve/deny with Discord role assignment
- Automatic DM notifications to applicants

## Setup

### 1. Create Discord Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application"
3. Go to **OAuth2** > **General**
   - Copy the **Client ID** and **Client Secret**
   - Add redirect URL: `https://your-domain.com/api/auth/callback/discord`
4. Go to **Bot** tab
   - Click "Add Bot"
   - Copy the **Bot Token**
   - Enable **SERVER MEMBERS INTENT** under Privileged Gateway Intents
5. Go to **OAuth2** > **URL Generator**
   - Select scopes: `bot`, `applications.commands`
   - Select bot permissions: `Manage Roles`, `Send Messages`
   - Use the generated URL to invite the bot to your server

### 2. Create Cloudinary Account

1. Go to [cloudinary.com](https://cloudinary.com) and sign up (free)
2. From the dashboard, copy:
   - Cloud Name
   - API Key
   - API Secret

### 3. Get Discord IDs

1. Enable Developer Mode in Discord (Settings > App Settings > Advanced)
2. Right-click your server > Copy Server ID
3. Right-click the whitelist role > Copy Role ID
4. Right-click yourself > Copy User ID (for admin access)

### 4. Deploy to Railway

1. Push this code to a GitHub repository
2. Go to [railway.app](https://railway.app) and create new project
3. Select "Deploy from GitHub repo"
4. Add a PostgreSQL database from the Railway dashboard
5. Add environment variables (see `.env.example`)
6. Update `DATABASE_URL` with the Railway PostgreSQL connection string
7. Update `NEXTAUTH_URL` with your Railway domain

### Environment Variables

```env
DATABASE_URL="postgresql://..."
DISCORD_CLIENT_ID="..."
DISCORD_CLIENT_SECRET="..."
DISCORD_BOT_TOKEN="..."
DISCORD_GUILD_ID="..."
DISCORD_WHITELIST_ROLE_ID="..."
CLOUDINARY_CLOUD_NAME="..."
CLOUDINARY_API_KEY="..."
CLOUDINARY_API_SECRET="..."
NEXTAUTH_SECRET="generate-random-string"
NEXTAUTH_URL="https://your-domain.railway.app"
ADMIN_DISCORD_IDS="your-discord-id,other-admin-id"
NEXT_PUBLIC_SERVER_NAME="Your Server Name"
```

## Local Development

```bash
npm install
npx prisma generate
npx prisma db push
npm run dev
```

Visit http://localhost:3000
