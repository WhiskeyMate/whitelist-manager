import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const application = await prisma.application.findFirst({
      where: { discordId: session.user.id },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({ application })
  } catch (error) {
    console.error('Failed to fetch application:', error)
    return NextResponse.json({ error: 'Failed to fetch application' }, { status: 500 })
  }
}
