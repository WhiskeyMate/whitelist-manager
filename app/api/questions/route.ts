import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const formId = req.nextUrl.searchParams.get('formId')

    const questions = await prisma.question.findMany({
      where: { formId: formId || null },
      orderBy: { order: 'asc' },
    })
    return NextResponse.json({ questions })
  } catch (error) {
    console.error('Failed to fetch questions:', error)
    return NextResponse.json({ error: 'Failed to fetch questions' }, { status: 500 })
  }
}
