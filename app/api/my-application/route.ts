import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const formSlug = req.nextUrl.searchParams.get('form')

    // Resolve formId from slug
    let formId: string | null = null
    if (formSlug) {
      const form = await prisma.form.findUnique({ where: { slug: formSlug } })
      if (!form) {
        return NextResponse.json({ application: null })
      }
      formId = form.id
    }

    const application = await prisma.application.findFirst({
      where: {
        discordId: session.user.id,
        formId,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        answers: {
          include: { question: true }
        }
      }
    })
    return NextResponse.json({ application })
  } catch (error) {
    console.error('Failed to fetch application:', error)
    return NextResponse.json({ error: 'Failed to fetch application' }, { status: 500 })
  }
}
