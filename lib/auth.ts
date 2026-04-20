import { NextAuthOptions } from 'next-auth'
import DiscordProvider from 'next-auth/providers/discord'
import { getUserRoles } from './discord'
import { canReviewWhitelist } from './permissions'

const ADMIN_ROLE_IDS = (process.env.ADMIN_ROLE_IDS || '').split(',').map(id => id.trim()).filter(Boolean)

interface DiscordProfile {
  id: string
  username: string
  avatar: string
  discriminator: string
  email?: string
}

export const authOptions: NextAuthOptions = {
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'identify guilds',
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account && profile) {
        const discordProfile = profile as DiscordProfile
        token.id = discordProfile.id
        // Fetch user's Discord roles via the bot API
        const roles = await getUserRoles(discordProfile.id)
        token.roles = roles
        token.isAdmin = roles.some(r => ADMIN_ROLE_IDS.includes(r))
        token.canManualWhitelist = canReviewWhitelist(roles)
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id
        ;(session.user as any).isAdmin = token.isAdmin
        ;(session.user as any).roles = token.roles || []
        ;(session.user as any).canManualWhitelist = token.canManualWhitelist ?? false
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
}
