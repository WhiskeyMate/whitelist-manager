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
    const { status, denialReason } = await req.json()
    const appId = params.id

    const application = await prisma.application.findUnique({
      where: { id: appId },
    })

    if (!application) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 })
    }

    // Update application
    const updatedApp = await prisma.application.update({
      where: { id: appId },
      data: { status, denialReason },
    })

    const serverName = process.env.NEXT_PUBLIC_SERVER_NAME || 'Our Server'

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
          ? `Unfortunately, your application to **${serverName}** was not approved.\n\n**Reason:** ${denialReason}`
          : `Unfortunately, your application to **${serverName}** was not approved at this time.`,
        color: 0xef4444, // red
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
