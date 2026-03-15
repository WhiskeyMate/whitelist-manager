import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAdmin, canReviewForm } from '@/lib/permissions'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userRoles = session.user.roles || []

  try {
    const forms = await prisma.form.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { applications: { where: { status: 'pending' } } } },
      },
    })

    // Filter forms by permission — admins see all, reviewers see only their forms
    const accessibleForms = isAdmin(userRoles)
      ? forms
      : forms.filter(form => canReviewForm(userRoles, form))

    return NextResponse.json({ forms: accessibleForms })
  } catch (error) {
    console.error('Failed to fetch forms:', error)
    return NextResponse.json({ error: 'Failed to fetch forms' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { name, slug, description, roleId, webhookUrl, reviewerRoleId, cooldownDays, enabled } = await req.json()

    if (!name || !slug) {
      return NextResponse.json({ error: 'Name and slug are required' }, { status: 400 })
    }

    // Validate slug format
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return NextResponse.json({ error: 'Slug must be lowercase alphanumeric with hyphens only' }, { status: 400 })
    }

    // Check slug uniqueness
    const existing = await prisma.form.findUnique({ where: { slug } })
    if (existing) {
      return NextResponse.json({ error: 'A form with this slug already exists' }, { status: 400 })
    }

    const form = await prisma.form.create({
      data: {
        name,
        slug,
        description: description || null,
        roleId: roleId || null,
        webhookUrl: webhookUrl || null,
        reviewerRoleId: reviewerRoleId || null,
        cooldownDays: cooldownDays ?? 7,
        enabled: enabled ?? true,
      },
    })

    return NextResponse.json({ form })
  } catch (error) {
    console.error('Failed to create form:', error)
    return NextResponse.json({ error: 'Failed to create form' }, { status: 500 })
  }
}
