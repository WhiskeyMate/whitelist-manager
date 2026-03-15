import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAdmin, canReviewForm, canReviewWhitelist } from '@/lib/permissions'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userRoles = session.user.roles || []

  try {
    const formId = req.nextUrl.searchParams.get('formId')

    // Permission check
    if (formId) {
      const form = await prisma.form.findUnique({
        where: { id: formId },
        select: { id: true, reviewerRoleId: true },
      })
      if (!canReviewForm(userRoles, form)) {
        return NextResponse.json({ error: 'Unauthorized for this form' }, { status: 401 })
      }
    } else {
      if (!canReviewWhitelist(userRoles)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const applications = await prisma.application.findMany({
      where: { formId: formId || null },
      include: {
        answers: {
          include: { question: true },
        },
        form: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ applications })
  } catch (error) {
    console.error('Failed to fetch applications:', error)
    return NextResponse.json({ error: 'Failed to fetch applications' }, { status: 500 })
  }
}
