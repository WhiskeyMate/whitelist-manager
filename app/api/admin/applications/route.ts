import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const applications = await prisma.application.findMany({
      include: {
        answers: {
          include: { question: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({ applications })
  } catch (error) {
    console.error('Failed to fetch applications:', error)
    return NextResponse.json({ error: 'Failed to fetch applications' }, { status: 500 })
  }
}
