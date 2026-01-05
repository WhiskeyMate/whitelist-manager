import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { assignWhitelistRole, removeWhitelistRole, sendEmbedDM } from '@/lib/discord'

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { status, denialReason, revisionReason, revisionQuestionIds } = await req.json()
    const appId = params.id

    const application = await prisma.application.findUnique({
      where: { id: appId },
      include: {
        answers: {
          include: { question: true }
        }
      }
    })

    if (!application) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 })
    }

    const serverName = process.env.NEXT_PUBLIC_SERVER_NAME || 'Our Server'

    // Build update data
    const updateData: any = {
      status,
      reviewedBy: session.user.name,
      reviewedById: (session.user as any).id,
      reviewedAt: new Date(),
    }

    if (status === 'denied') {
      updateData.denialReason = denialReason
      updateData.revisionReason = null
      updateData.revisionQuestionIds = []
    } else if (status === 'revision') {
      updateData.revisionReason = revisionReason
      updateData.revisionQuestionIds = revisionQuestionIds || []
      updateData.denialReason = null
    } else if (status === 'approved') {
      updateData.denialReason = null
      updateData.revisionReason = null
      updateData.revisionQuestionIds = []
    }

    // Update application with reviewer info
    const updatedApp = await prisma.application.update({
      where: { id: appId },
      data: updateData,
    })

    // Handle Discord actions
    if (status === 'approved') {
      // Assign whitelist role
      await assignWhitelistRole(application.discordId)

      // Send approval DM
      await sendEmbedDM(application.discordId, {
        title: 'Application Approved!',
        description: `Congratulations! Your application to **${serverName}** has been approved. You now have access to the server.`,
        color: 0x22c55e, // green
        timestamp: new Date().toISOString(),
      })
    } else if (status === 'denied') {
      // Remove role if they had it
      await removeWhitelistRole(application.discordId)

      // Send denial DM
      await sendEmbedDM(application.discordId, {
        title: 'Application Denied',
        description: denialReason
          ? `Unfortunately, your application to **${serverName}** was not approved.\n\n**Reason:** ${denialReason}\n\nYou may re-apply after 7 days.`
          : `Unfortunately, your application to **${serverName}** was not approved at this time.\n\nYou may re-apply after 7 days.`,
        color: 0xef4444, // red
        timestamp: new Date().toISOString(),
      })
    } else if (status === 'revision') {
      // Get question texts for the revision request
      const questionTexts = application.answers
        .filter(a => revisionQuestionIds?.includes(a.questionId))
        .map(a => `- ${a.question.text}`)
        .join('\n')

      // Send revision DM
      await sendEmbedDM(application.discordId, {
        title: 'Application Revision Requested',
        description: `Your application to **${serverName}** requires revision.\n\n**Reason:** ${revisionReason || 'Please review and update your answers.'}\n\n**Questions to revise:**\n${questionTexts}\n\nPlease visit the application page to submit your revised answers.`,
        color: 0xf59e0b, // amber/orange
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

  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
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
