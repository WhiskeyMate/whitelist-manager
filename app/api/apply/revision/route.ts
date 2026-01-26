import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { uploadAudio } from '@/lib/cloudinary'

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
      if (audioFile && audioFile.size > 0) {
        const buffer = await audioFile.arrayBuffer()
        const base64 = `data:${audioFile.type};base64,${Buffer.from(buffer).toString('base64')}`
        const audioUrl = await uploadAudio(base64, `${application.id}_${questionId}_rev`)

        await prisma.answer.updateMany({
          where: {
            applicationId: application.id,
            questionId,
          },
          data: {
            audioUrl,
          },
        })
      }
    }

    // Update application status back to pending, store which questions were revised
    const updatedApp = await prisma.application.update({
      where: { id: application.id },
      data: {
        status: 'pending',
        revisionReason: null,
        revisedQuestionIds: revisionQuestionIds, // Store for highlighting in admin
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
