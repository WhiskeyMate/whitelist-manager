import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { text, type, required, formId } = await req.json()

    // Get max order for questions in this form
    const maxOrder = await prisma.question.aggregate({
      _max: { order: true },
      where: { formId: formId || null },
    })

    const question = await prisma.question.create({
      data: {
        text,
        type,
        required: required ?? true,
        order: (maxOrder._max.order ?? -1) + 1,
        formId: formId || null,
      },
    })

    return NextResponse.json({ question })
  } catch (error) {
    console.error('Failed to create question:', error)
    return NextResponse.json({ error: 'Failed to create question' }, { status: 500 })
  }
}
