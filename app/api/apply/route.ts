import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { uploadAudio } from '@/lib/cloudinary'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Check for existing pending application
    const existingApp = await prisma.application.findFirst({
      where: {
        discordId: session.user.id,
        status: 'pending',
      },
    })

    if (existingApp) {
      return NextResponse.json({ error: 'You already have a pending application' }, { status: 400 })
    }

    const formData = await req.formData()
    const answersJson = formData.get('answers') as string
    const textAnswers = JSON.parse(answersJson || '{}')

    // Get all questions
    const questions = await prisma.question.findMany()

    // Create application
    const application = await prisma.application.create({
      data: {
        discordId: session.user.id,
        discordName: session.user.name || 'Unknown',
        discordAvatar: session.user.image?.split('/').pop()?.split('.')[0] || null,
      },
    })

    // Process answers
    for (const question of questions) {
      let textAnswer = textAnswers[question.id] || null
      let audioUrl = null

      // Check for audio file
      const audioFile = formData.get(`audio_${question.id}`) as File | null
      if (audioFile && audioFile.size > 0) {
        const buffer = await audioFile.arrayBuffer()
        const base64 = `data:${audioFile.type};base64,${Buffer.from(buffer).toString('base64')}`
        audioUrl = await uploadAudio(base64, `${application.id}_${question.id}`)
      }

      // Only create answer if there's content
      if (textAnswer || audioUrl) {
        await prisma.answer.create({
          data: {
            applicationId: application.id,
            questionId: question.id,
            textAnswer,
            audioUrl,
          },
        })
      }
    }

    // Fetch complete application
    const completeApp = await prisma.application.findUnique({
      where: { id: application.id },
      include: {
        answers: {
          include: { question: true },
        },
      },
    })

    return NextResponse.json({ application: completeApp })
  } catch (error) {
    console.error('Failed to submit application:', error)
    return NextResponse.json({ error: 'Failed to submit application' }, { status: 500 })
  }
}
