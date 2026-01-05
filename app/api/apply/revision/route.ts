import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { v2 as cloudinary } from 'cloudinary'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const formData = await req.formData()
    const answersJson = formData.get('answers') as string
    const textAnswers = JSON.parse(answersJson || '{}')

    // Find the user's application in revision status
    const application = await prisma.application.findFirst({
      where: {
        discordId: (session.user as any).id,
        status: 'revision',
      },
      include: {
        answers: true,
      },
    })

    if (!application) {
      return NextResponse.json({ error: 'No revision requested' }, { status: 400 })
    }

    // Update answers for the revision questions
    const revisionQuestionIds = application.revisionQuestionIds as string[]
    for (const questionId of revisionQuestionIds) {
      // Check if there's a text answer
      if (textAnswers[questionId]) {
        await prisma.answer.updateMany({
          where: {
            applicationId: application.id,
            questionId,
          },
          data: {
            textAnswer: textAnswers[questionId],
          },
        })
      }

      // Check if there's an audio file
      const audioFile = formData.get(`audio_${questionId}`) as File | null
      if (audioFile) {
        const bytes = await audioFile.arrayBuffer()
        const buffer = Buffer.from(bytes)

        // Upload to Cloudinary
        const result = await new Promise<any>((resolve, reject) => {
          cloudinary.uploader.upload_stream(
            {
              resource_type: 'auto',
              folder: 'whitelist-applications',
            },
            (error, result) => {
              if (error) reject(error)
              else resolve(result)
            }
          ).end(buffer)
        })

        await prisma.answer.updateMany({
          where: {
            applicationId: application.id,
            questionId,
          },
          data: {
            audioUrl: result.secure_url,
          },
        })
      }
    }

    // Update application status back to pending
    const updatedApp = await prisma.application.update({
      where: { id: application.id },
      data: {
        status: 'pending',
        revisionReason: null,
        revisionQuestionIds: [],
        reviewedBy: null,
        reviewedById: null,
        reviewedAt: null,
      },
      include: {
        answers: {
          include: { question: true },
        },
      },
    })

    return NextResponse.json({ application: updatedApp })
  } catch (error) {
    console.error('Failed to submit revision:', error)
    return NextResponse.json({ error: 'Failed to submit revision' }, { status: 500 })
  }
}
