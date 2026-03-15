import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { assignRole, removeRole, assignWhitelistRole, removeWhitelistRole, sendEmbedDM } from '@/lib/discord'
import { canReviewForm } from '@/lib/permissions'

const DISCORD_WHITELIST_ROLE_ID = process.env.DISCORD_WHITELIST_ROLE_ID!

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userRoles = session.user.roles || []

  try {
    const { status, denialReason, revisionReason, revisionQuestionIds } = await req.json()
    const appId = params.id

    const application = await prisma.application.findUnique({
      where: { id: appId },
      include: {
        answers: {
          include: { question: true }
        },
        form: true,
      }
    })

    if (!application) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 })
    }

    // Permission check: can this user review this form?
    if (!canReviewForm(userRoles, application.form)) {
      return NextResponse.json({ error: 'Unauthorized for this form' }, { status: 401 })
    }

    const serverName = process.env.NEXT_PUBLIC_SERVER_NAME || 'Our Server'
    const formName = application.form?.name || 'Whitelist'
    const cooldownDays = application.form?.cooldownDays ?? 7

    // Determine which role to use
    const roleId = application.form?.roleId || (application.formId === null ? DISCORD_WHITELIST_ROLE_ID : null)

    // Build update data
    const updateData: any = {
      status,
      reviewedBy: session.user.name,
      reviewedById: session.user.id,
      reviewedAt: new Date(),
    }

    if (status === 'denied') {
      updateData.denialReason = denialReason
      updateData.revisionReason = null
      updateData.revisionQuestionIds = []
      updateData.revisedQuestionIds = []
    } else if (status === 'revision') {
      updateData.revisionReason = revisionReason
      updateData.revisionQuestionIds = revisionQuestionIds || []
      updateData.revisedQuestionIds = []
      updateData.denialReason = null
    } else if (status === 'approved') {
      updateData.denialReason = null
      updateData.revisionReason = null
      updateData.revisionQuestionIds = []
      updateData.revisedQuestionIds = []
    }

    // Update application with reviewer info
    const updatedApp = await prisma.application.update({
      where: { id: appId },
      data: updateData,
    })

    // Handle Discord actions
    if (status === 'approved') {
      // Assign role if configured
      if (roleId) {
        await assignRole(application.discordId, roleId)
      }

      // Send approval DM
      await sendEmbedDM(application.discordId, {
        title: `${formName} Application Approved!`,
        description: `Congratulations! Your **${formName}** application to **${serverName}** has been approved.`,
        color: 0x22c55e,
        timestamp: new Date().toISOString(),
      })
    } else if (status === 'denied') {
      // Remove role if they had it
      if (roleId) {
        await removeRole(application.discordId, roleId)
      }

      // Send denial DM
      await sendEmbedDM(application.discordId, {
        title: `${formName} Application Denied`,
        description: denialReason
          ? `Unfortunately, your **${formName}** application to **${serverName}** was not approved.\n\n**Reason:** ${denialReason}\n\nYou may re-apply after ${cooldownDays} days.`
          : `Unfortunately, your **${formName}** application to **${serverName}** was not approved at this time.\n\nYou may re-apply after ${cooldownDays} days.`,
        color: 0xef4444,
        timestamp: new Date().toISOString(),
      })
    } else if (status === 'revision') {
      // Get question texts for the revision request
      const questionTexts = application.answers
        .filter(a => revisionQuestionIds?.includes(a.questionId))
        .map(a => `- ${a.question.text}`)
        .join('\n')

      const appUrl = process.env.NEXTAUTH_URL || 'https://whitelist.rosalitarp.com'
      const applyUrl = application.form
        ? `${appUrl}/apply?form=${application.form.slug}`
        : `${appUrl}/apply`

      // Send revision DM
      await sendEmbedDM(application.discordId, {
        title: `${formName} Application Revision Requested`,
        description: `Your **${formName}** application to **${serverName}** requires revision.\n\n**Reason:** ${revisionReason || 'Please review and update your answers.'}\n\n**Questions to revise:**\n${questionTexts}\n\n[Click here to submit your revised answers](${applyUrl})`,
        color: 0xf59e0b,
        timestamp: new Date().toISOString(),
      })
    }

    return NextResponse.json({ application: updatedApp })
  } catch (error) {
    console.error('Failed to update application:', error)
    return NextResponse.json({ error: 'Failed to update application' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userRoles = session.user.roles || []

  try {
    const application = await prisma.application.findUnique({
      where: { id: params.id },
      include: { form: { select: { id: true, reviewerRoleId: true } } },
    })

    if (!application) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 })
    }

    // Permission check
    if (!canReviewForm(userRoles, application.form)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Application has cascade delete for answers in schema, so just delete
    await prisma.application.delete({
      where: { id: params.id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete application:', error)
    return NextResponse.json({ error: 'Failed to delete application' }, { status: 500 })
  }
}
