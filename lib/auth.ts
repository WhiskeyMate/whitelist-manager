import { NextAuthOptions } from 'next-auth'
import DiscordProvider from 'next-auth/providers/discord'

const ADMIN_IDS = (process.env.ADMIN_DISCORD_IDS || '').split(',').map(id => id.trim())

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
        token.id = profile.id
        token.isAdmin = ADMIN_IDS.includes(profile.id as string)
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id
        ;(session.user as any).isAdmin = token.isAdmin
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
}
