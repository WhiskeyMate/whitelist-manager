import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { cloudinary } from '@/lib/cloudinary'

// Secret key to protect the endpoint
const CLEANUP_SECRET = process.env.CLEANUP_SECRET

export async function POST(req: NextRequest) {
  // Verify the request is authorized
  const authHeader = req.headers.get('authorization')
  if (!CLEANUP_SECRET || authHeader !== `Bearer ${CLEANUP_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    // Find answers with audio URLs older than 7 days
    const oldAnswers = await prisma.answer.findMany({
      where: {
        audioUrl: { not: null },
        createdAt: { lt: sevenDaysAgo },
      },
      select: {
        id: true,
        audioUrl: true,
      },
    })

    let deletedCount = 0
    let failedCount = 0

    for (const answer of oldAnswers) {
      if (answer.audioUrl) {
        try {
          // Extract public ID from Cloudinary URL
          // URL format: https://res.cloudinary.com/{cloud}/video/upload/v{version}/{folder}/{public_id}.{ext}
          const urlParts = answer.audioUrl.split('/')
          const filenameWithExt = urlParts[urlParts.length - 1]
          const filename = filenameWithExt.split('.')[0]
          const folder = urlParts[urlParts.length - 2]
          const publicId = `${folder}/${filename}`

          // Delete from Cloudinary
          await cloudinary.uploader.destroy(publicId, { resource_type: 'video' })

          // Clear the audioUrl in database
          await prisma.answer.update({
            where: { id: answer.id },
            data: { audioUrl: null },
          })

          deletedCount++
        } catch (e) {
          console.error(`Failed to delete audio for answer ${answer.id}:`, e)
          failedCount++
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Cleaned up ${deletedCount} audio files, ${failedCount} failed`,
      deleted: deletedCount,
      failed: failedCount,
      total: oldAnswers.length,
    })
  } catch (error) {
    console.error('Cleanup error:', error)
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 })
  }
}
