import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { uploadAudio } from '@/lib/cloudinary'
import { sendWebhook } from '@/lib/discord'

const STAFF_WEBHOOK_URL = process.env.STAFF_WEBHOOK_URL

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const formData = await req.formData()
    const answersJson = formData.get('answers') as string
    const formSlug = formData.get('formSlug') as string | null
    const textAnswers = JSON.parse(answersJson || '{}')

    // Resolve form if slug provided
    let formId: string | null = null
    let formRecord: any = null

    if (formSlug) {
      formRecord = await prisma.form.findUnique({ where: { slug: formSlug } })
      if (!formRecord) {
        return NextResponse.json({ error: 'Form not found' }, { status: 404 })
      }
      if (!formRecord.enabled) {
        return NextResponse.json({ error: 'This form is currently closed' }, { status: 400 })
      }
      formId = formRecord.id
    }

    // Check for existing pending or revision application for this form
    const existingApp = await prisma.application.findFirst({
      where: {
        discordId: session.user.id,
        formId,
        status: { in: ['pending', 'revision'] },
      },
    })

    if (existingApp) {
      return NextResponse.json({ error: 'You already have a pending application for this form' }, { status: 400 })
    }

    // Get questions for this form
    const questions = await prisma.question.findMany({
      where: { formId },
    })

    // Create application
    const application = await prisma.application.create({
      data: {
        discordId: session.user.id,
        discordName: session.user.name || 'Unknown',
        discordAvatar: session.user.image?.split('/').pop()?.split('.')[0] || null,
        formId,
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

    // Send webhook notification to staff
    const webhookUrl = formRecord?.webhookUrl || STAFF_WEBHOOK_URL
    const formName = formRecord?.name || 'Whitelist'

    if (webhookUrl) {
      const serverName = process.env.NEXT_PUBLIC_SERVER_NAME || 'Our Server'

      await sendWebhook(webhookUrl, {
        title: `New ${formName} Application`,
        description: `**${session.user.name}** has submitted a ${formName.toLowerCase()} application.`,
        color: 0xc4a574, // Western gold color
        thumbnail: {
          url: session.user.image || `https://cdn.discordapp.com/embed/avatars/0.png`,
        },
        fields: [
          {
            name: 'Discord ID',
            value: session.user.id,
            inline: true,
          },
          {
            name: 'Questions Answered',
            value: String(completeApp?.answers.length || 0),
            inline: true,
          },
        ],
        footer: {
          text: serverName,
        },
        timestamp: new Date().toISOString(),
      })
    }

    return NextResponse.json({ application: completeApp })
  } catch (error) {
    console.error('Failed to submit application:', error)
    return NextResponse.json({ error: 'Failed to submit application' }, { status: 500 })
  }
}
