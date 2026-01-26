import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { assignWhitelistRole, sendEmbedDM } from '@/lib/discord'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { discordId } = await req.json()

    if (!discordId || typeof discordId !== 'string') {
      return NextResponse.json({ error: 'Discord ID is required' }, { status: 400 })
    }

    // Validate Discord ID format (should be a snowflake - 17-19 digit number)
    if (!/^\d{17,19}$/.test(discordId)) {
      return NextResponse.json({ error: 'Invalid Discord ID format' }, { status: 400 })
    }

    // Assign the whitelist role
    const roleAssigned = await assignWhitelistRole(discordId)
    if (!roleAssigned) {
      return NextResponse.json(
        { error: 'Failed to assign whitelist role. Make sure the user is in the Discord server.' },
        { status: 400 }
      )
    }

    // Send DM to the user
    const dmSent = await sendEmbedDM(discordId, {
      title: 'You Have Been Whitelisted!',
      description: `Congratulations, a staff member has vouched for you and as a result you have been whitelisted for Rosalita.\n\nYou do not have to complete an application, but we still ask that you familiarise yourself with our rules before joining the server. They can be found at https://rosalitarp.com/rules`,
      color: 0x22c55e, // Green color
    })

    return NextResponse.json({
      success: true,
      roleAssigned,
      dmSent,
      message: dmSent
        ? 'User has been whitelisted and notified via DM.'
        : 'User has been whitelisted but DM could not be sent (they may have DMs disabled).',
    })
  } catch (error) {
    console.error('Failed to manually whitelist user:', error)
    return NextResponse.json({ error: 'Failed to whitelist user' }, { status: 500 })
  }
}
