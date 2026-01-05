'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'
import Image from 'next/image'

interface Question {
  id: string
  text: string
  type: 'text' | 'textarea' | 'audio'
  required: boolean
}

interface AudioState {
  isRecording: boolean
  audioBlob: Blob | null
  audioUrl: string | null
  uploadedFile: File | null
}

export default function ApplyPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [questions, setQuestions] = useState<Question[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [audioStates, setAudioStates] = useState<Record<string, AudioState>>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [existingApp, setExistingApp] = useState<any>(null)
  const [inGuild, setInGuild] = useState<boolean | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const serverName = process.env.NEXT_PUBLIC_SERVER_NAME || 'Our Server'

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/')
    }
  }, [status, router])

  useEffect(() => {
    if (session?.user?.id) {
      fetchData()
    }
  }, [session])

  async function fetchData() {
    try {
      // Check if user is in guild
      const guildRes = await fetch(`/api/check-guild?userId=${session?.user?.id}`)
      const guildData = await guildRes.json()
      setInGuild(guildData.inGuild)

      // Check for existing application
      const appRes = await fetch('/api/my-application')
      const appData = await appRes.json()
      if (appData.application) {
        setExistingApp(appData.application)
      }

      // Get questions
      const questionsRes = await fetch('/api/questions')
      const questionsData = await questionsRes.json()
      setQuestions(questionsData.questions || [])

      // Initialize audio states
      const initialAudioStates: Record<string, AudioState> = {}
      questionsData.questions?.forEach((q: Question) => {
        if (q.type === 'audio') {
          initialAudioStates[q.id] = {
            isRecording: false,
            audioBlob: null,
            audioUrl: null,
            uploadedFile: null,
          }
        }
      })
      setAudioStates(initialAudioStates)
    } catch (e) {
      console.error('Failed to fetch data:', e)
      setError('Failed to load application form')
    } finally {
      setLoading(false)
    }
  }

  async function startRecording(questionId: string) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        const url = URL.createObjectURL(blob)
        setAudioStates(prev => ({
          ...prev,
          [questionId]: {
            ...prev[questionId],
            isRecording: false,
            audioBlob: blob,
            audioUrl: url,
            uploadedFile: null,
          }
        }))
        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorder.start()
      setAudioStates(prev => ({
        ...prev,
        [questionId]: { ...prev[questionId], isRecording: true }
      }))
    } catch (e) {
      console.error('Failed to start recording:', e)
      setError('Failed to access microphone. Please allow microphone access.')
    }
  }

  function stopRecording(questionId: string) {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
  }

  function handleFileUpload(questionId: string, file: File) {
    const url = URL.createObjectURL(file)
    setAudioStates(prev => ({
      ...prev,
      [questionId]: {
        ...prev[questionId],
        audioBlob: null,
        audioUrl: url,
        uploadedFile: file,
      }
    }))
  }

  function clearAudio(questionId: string) {
    if (audioStates[questionId]?.audioUrl) {
      URL.revokeObjectURL(audioStates[questionId].audioUrl!)
    }
    setAudioStates(prev => ({
      ...prev,
      [questionId]: {
        isRecording: false,
        audioBlob: null,
        audioUrl: null,
        uploadedFile: null,
      }
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      // Prepare form data
      const formData = new FormData()
      formData.append('answers', JSON.stringify(answers))

      // Add audio files
      for (const [questionId, state] of Object.entries(audioStates)) {
        if (state.audioBlob) {
          formData.append(`audio_${questionId}`, state.audioBlob, `${questionId}.webm`)
        } else if (state.uploadedFile) {
          formData.append(`audio_${questionId}`, state.uploadedFile)
        }
      }

      const res = await fetch('/api/apply', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit application')
      }

      // Refresh to show submitted state
      setExistingApp(data.application)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    )
  }

  if (!session) return null

  if (inGuild === false) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="card max-w-md w-full text-center">
          <div className="text-red-500 text-5xl mb-4">!</div>
          <h1 className="text-2xl font-bold mb-4">Not in Discord Server</h1>
          <p className="text-zinc-400 mb-6">
            You must join the {serverName} Discord server before applying.
          </p>
          <button onClick={() => signOut()} className="btn btn-primary">
            Sign Out
          </button>
        </div>
      </main>
    )
  }

  if (existingApp) {
    const statusColors: Record<string, string> = {
      pending: 'text-yellow-500',
      approved: 'text-green-500',
      denied: 'text-red-500',
    }

    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="card max-w-md w-full text-center">
          <div className="flex items-center justify-center gap-3 mb-6">
            {session.user.image && (
              <Image
                src={session.user.image}
                alt=""
                width={48}
                height={48}
                className="rounded-full"
              />
            )}
            <div className="text-left">
              <p className="font-medium">{session.user.name}</p>
              <p className="text-sm text-zinc-400">Application submitted</p>
            </div>
          </div>

          <h1 className="text-2xl font-bold mb-2">Application Status</h1>
          <p className={`text-xl font-semibold capitalize ${statusColors[existingApp.status]}`}>
            {existingApp.status}
          </p>

          {existingApp.status === 'denied' && existingApp.denialReason && (
            <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-left">
              <p className="text-sm text-zinc-400 mb-1">Denial Reason:</p>
              <p className="text-red-400">{existingApp.denialReason}</p>
            </div>
          )}

          <p className="text-zinc-500 text-sm mt-6">
            Submitted {new Date(existingApp.createdAt).toLocaleDateString()}
          </p>

          <button onClick={() => signOut()} className="btn btn-primary mt-6">
            Sign Out
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="card mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {session.user.image && (
                <Image
                  src={session.user.image}
                  alt=""
                  width={40}
                  height={40}
                  className="rounded-full"
                />
              )}
              <div>
                <p className="font-medium">{session.user.name}</p>
                <p className="text-sm text-zinc-400">Applying for whitelist</p>
              </div>
            </div>
            <button onClick={() => signOut()} className="text-sm text-zinc-400 hover:text-white">
              Sign Out
            </button>
          </div>
        </div>

        <div className="card">
          <h1 className="text-2xl font-bold mb-2">{serverName} Application</h1>
          <p className="text-zinc-400 mb-8">Please answer all questions honestly.</p>

          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
              {error}
            </div>
          )}

          {questions.length === 0 ? (
            <p className="text-zinc-500 text-center py-8">
              No application questions have been set up yet. Please check back later.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {questions.map((question, index) => (
                <div key={question.id} className="space-y-2">
                  <label className="block font-medium">
                    {index + 1}. {question.text}
                    {question.required && <span className="text-red-500 ml-1">*</span>}
                  </label>

                  {question.type === 'text' && (
                    <input
                      type="text"
                      className="input"
                      value={answers[question.id] || ''}
                      onChange={(e) => setAnswers(prev => ({ ...prev, [question.id]: e.target.value }))}
                      required={question.required}
                    />
                  )}

                  {question.type === 'textarea' && (
                    <textarea
                      className="input min-h-[120px]"
                      value={answers[question.id] || ''}
                      onChange={(e) => setAnswers(prev => ({ ...prev, [question.id]: e.target.value }))}
                      required={question.required}
                    />
                  )}

                  {question.type === 'audio' && (
                    <div className="space-y-3">
                      {audioStates[question.id]?.audioUrl ? (
                        <div className="flex items-center gap-3">
                          <audio
                            src={audioStates[question.id].audioUrl!}
                            controls
                            className="flex-1"
                          />
                          <button
                            type="button"
                            onClick={() => clearAudio(question.id)}
                            className="btn btn-danger text-sm"
                          >
                            Clear
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-3">
                          {audioStates[question.id]?.isRecording ? (
                            <button
                              type="button"
                              onClick={() => stopRecording(question.id)}
                              className="btn bg-red-600 hover:bg-red-700 text-white flex items-center gap-2"
                            >
                              <span className="w-3 h-3 bg-white rounded-full animate-pulse"></span>
                              Stop Recording
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startRecording(question.id)}
                              className="btn btn-primary flex items-center gap-2"
                            >
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                              </svg>
                              Record Audio
                            </button>
                          )}

                          <label className="btn bg-zinc-700 hover:bg-zinc-600 text-white cursor-pointer">
                            Upload File
                            <input
                              type="file"
                              accept="audio/*"
                              className="hidden"
                              onChange={(e) => {
                                if (e.target.files?.[0]) {
                                  handleFileUpload(question.id, e.target.files[0])
                                }
                              }}
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              <button
                type="submit"
                disabled={submitting}
                className="btn btn-success w-full mt-8"
              >
                {submitting ? 'Submitting...' : 'Submit Application'}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  )
}
