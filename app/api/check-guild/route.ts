import { NextRequest, NextResponse } from 'next/server'
import { isUserInGuild } from '@/lib/discord'

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId')

  if (!userId) {
    return NextResponse.json({ error: 'User ID required' }, { status: 400 })
  }

  try {
    const inGuild = await isUserInGuild(userId)
    return NextResponse.json({ inGuild })
  } catch (error) {
    console.error('Failed to check guild:', error)
    return NextResponse.json({ inGuild: false })
  }
}
