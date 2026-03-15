import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const form = await prisma.form.findUnique({
      where: { slug: params.slug },
      include: {
        questions: {
          orderBy: { order: 'asc' },
        },
      },
    })

    if (!form) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 })
    }

    if (!form.enabled) {
      return NextResponse.json({ error: 'This form is currently closed' }, { status: 400 })
    }

    return NextResponse.json({ form })
  } catch (error) {
    console.error('Failed to fetch form:', error)
    return NextResponse.json({ error: 'Failed to fetch form' }, { status: 500 })
  }
}
