import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { name, slug, description, roleId, webhookUrl, reviewerRoleId, cooldownDays, enabled } = await req.json()

    // If slug is changing, validate uniqueness
    if (slug) {
      if (!/^[a-z0-9-]+$/.test(slug)) {
        return NextResponse.json({ error: 'Slug must be lowercase alphanumeric with hyphens only' }, { status: 400 })
      }
      const existing = await prisma.form.findFirst({
        where: { slug, id: { not: params.id } },
      })
      if (existing) {
        return NextResponse.json({ error: 'A form with this slug already exists' }, { status: 400 })
      }
    }

    const form = await prisma.form.update({
      where: { id: params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(slug !== undefined && { slug }),
        ...(description !== undefined && { description: description || null }),
        ...(roleId !== undefined && { roleId: roleId || null }),
        ...(webhookUrl !== undefined && { webhookUrl: webhookUrl || null }),
        ...(reviewerRoleId !== undefined && { reviewerRoleId: reviewerRoleId || null }),
        ...(cooldownDays !== undefined && { cooldownDays }),
        ...(enabled !== undefined && { enabled }),
      },
    })

    return NextResponse.json({ form })
  } catch (error) {
    console.error('Failed to update form:', error)
    return NextResponse.json({ error: 'Failed to update form' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Check for existing applications
    const appCount = await prisma.application.count({
      where: { formId: params.id },
    })

    const force = req.nextUrl.searchParams.get('force') === 'true'

    if (appCount > 0 && !force) {
      return NextResponse.json({
        error: `This form has ${appCount} application(s). Disable it instead, or use force=true to delete everything.`,
        applicationCount: appCount,
      }, { status: 400 })
    }

    // Delete all related data: answers → applications → questions → form
    if (appCount > 0) {
      // Delete answers for all applications of this form
      await prisma.answer.deleteMany({
        where: { application: { formId: params.id } },
      })
      // Delete applications
      await prisma.application.deleteMany({
        where: { formId: params.id },
      })
    }

    // Delete questions for this form
    await prisma.question.deleteMany({
      where: { formId: params.id },
    })

    // Delete the form
    await prisma.form.delete({
      where: { id: params.id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete form:', error)
    return NextResponse.json({ error: 'Failed to delete form' }, { status: 500 })
  }
}
