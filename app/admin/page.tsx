'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Image from 'next/image'

interface Application {
  id: string
  discordId: string
  discordName: string
  discordAvatar: string | null
  status: string
  createdAt: string
  answers: {
    id: string
    textAnswer: string | null
    audioUrl: string | null
    question: {
      id: string
      text: string
      type: string
    }
  }[]
}

interface Question {
  id: string
  text: string
  type: string
  required: boolean
  order: number
}

export default function AdminPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [tab, setTab] = useState<'applications' | 'questions'>('applications')
  const [applications, setApplications] = useState<Application[]>([])
  const [questions, setQuestions] = useState<Question[]>([])
  const [selectedApp, setSelectedApp] = useState<Application | null>(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [denialReason, setDenialReason] = useState('')
  const [showDenialModal, setShowDenialModal] = useState(false)

  // Question form
  const [newQuestion, setNewQuestion] = useState({ text: '', type: 'text', required: true })
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null)

  const serverName = process.env.NEXT_PUBLIC_SERVER_NAME || 'Our Server'

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/')
    } else if (session && !session.user.isAdmin) {
      router.push('/apply')
    }
  }, [status, session, router])

  useEffect(() => {
    if (session?.user?.isAdmin) {
      fetchData()
    }
  }, [session])

  async function fetchData() {
    try {
      const [appsRes, questionsRes] = await Promise.all([
        fetch('/api/admin/applications'),
        fetch('/api/questions'),
      ])
      const appsData = await appsRes.json()
      const questionsData = await questionsRes.json()
      setApplications(appsData.applications || [])
      setQuestions(questionsData.questions || [])
    } catch (e) {
      console.error('Failed to fetch data:', e)
    } finally {
      setLoading(false)
    }
  }

  async function handleApprove(appId: string) {
    setProcessing(true)
    try {
      const res = await fetch(`/api/admin/applications/${appId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      })
      if (res.ok) {
        setApplications(prev => prev.map(a => a.id === appId ? { ...a, status: 'approved' } : a))
        setSelectedApp(null)
      }
    } catch (e) {
      console.error('Failed to approve:', e)
    } finally {
      setProcessing(false)
    }
  }

  async function handleDeny(appId: string) {
    setProcessing(true)
    try {
      const res = await fetch(`/api/admin/applications/${appId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'denied', denialReason }),
      })
      if (res.ok) {
        setApplications(prev => prev.map(a => a.id === appId ? { ...a, status: 'denied' } : a))
        setSelectedApp(null)
        setShowDenialModal(false)
        setDenialReason('')
      }
    } catch (e) {
      console.error('Failed to deny:', e)
    } finally {
      setProcessing(false)
    }
  }

  async function handleAddQuestion() {
    if (!newQuestion.text.trim()) {
      alert('Please enter question text')
      return
    }
    try {
      const res = await fetch('/api/admin/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newQuestion),
      })
      const data = await res.json()
      if (res.ok) {
        setQuestions(prev => [...prev, data.question])
        setNewQuestion({ text: '', type: 'text', required: true })
      } else {
        alert(`Error: ${data.error || 'Failed to add question'}`)
      }
    } catch (e) {
      console.error('Failed to add question:', e)
      alert('Failed to add question - check console for details')
    }
  }

  async function handleUpdateQuestion() {
    if (!editingQuestion) return
    try {
      const res = await fetch(`/api/admin/questions/${editingQuestion.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingQuestion),
      })
      if (res.ok) {
        setQuestions(prev => prev.map(q => q.id === editingQuestion.id ? editingQuestion : q))
        setEditingQuestion(null)
      }
    } catch (e) {
      console.error('Failed to update question:', e)
    }
  }

  async function handleDeleteQuestion(id: string) {
    if (!confirm('Delete this question? This will also delete all answers to this question.')) return
    try {
      const res = await fetch(`/api/admin/questions/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setQuestions(prev => prev.filter(q => q.id !== id))
      } else {
        const data = await res.json()
        alert(`Error: ${data.error || 'Failed to delete question'}`)
      }
    } catch (e) {
      console.error('Failed to delete question:', e)
      alert('Failed to delete question')
    }
  }

  async function handleDeleteApplication(id: string) {
    if (!confirm('Delete this application? This will allow the user to re-apply.')) return
    try {
      const res = await fetch(`/api/admin/applications/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setApplications(prev => prev.filter(a => a.id !== id))
        setSelectedApp(null)
      } else {
        const data = await res.json()
        alert(`Error: ${data.error || 'Failed to delete application'}`)
      }
    } catch (e) {
      console.error('Failed to delete application:', e)
      alert('Failed to delete application')
    }
  }

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#c4a574]"></div>
      </div>
    )
  }

  if (!session?.user?.isAdmin) return null

  const pendingApps = applications.filter(a => a.status === 'pending')
  const processedApps = applications.filter(a => a.status !== 'pending')

  return (
    <main className="min-h-screen py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Image
              src="/logo.png"
              alt={serverName}
              width={60}
              height={60}
              className="opacity-90"
            />
            <div>
              <h1 className="text-2xl">Admin Dashboard</h1>
              <p className="text-[#8b7355]">Manage whitelist applications</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-[#8b7355]">{session.user.name}</span>
            <button onClick={() => signOut()} className="btn btn-primary text-sm">
              Sign Out
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setTab('applications')}
            className={`px-4 py-2 rounded font-medium transition-colors ${
              tab === 'applications'
                ? 'bg-[#c4a574] text-[#1a1410]'
                : 'bg-[#2d261f] text-[#8b7355] hover:text-[#c4a574] border border-[#8b7355]/30'
            }`}
          >
            Applications ({pendingApps.length} pending)
          </button>
          <button
            onClick={() => setTab('questions')}
            className={`px-4 py-2 rounded font-medium transition-colors ${
              tab === 'questions'
                ? 'bg-[#c4a574] text-[#1a1410]'
                : 'bg-[#2d261f] text-[#8b7355] hover:text-[#c4a574] border border-[#8b7355]/30'
            }`}
          >
            Questions ({questions.length})
          </button>
        </div>

        {/* Applications Tab */}
        {tab === 'applications' && (
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Applications List */}
            <div className="lg:col-span-1 space-y-4">
              <h2 className="font-['Special_Elite'] text-[#c4a574] uppercase tracking-wider text-sm">Pending</h2>
              {pendingApps.length === 0 ? (
                <p className="text-[#6b5a45] text-sm">No pending applications</p>
              ) : (
                pendingApps.map(app => (
                  <div
                    key={app.id}
                    onClick={() => setSelectedApp(app)}
                    className={`card cursor-pointer hover:border-[#c4a574] transition-colors ${
                      selectedApp?.id === app.id ? 'border-[#c4a574]' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {app.discordAvatar ? (
                        <Image
                          src={`https://cdn.discordapp.com/avatars/${app.discordId}/${app.discordAvatar}.png`}
                          alt=""
                          width={40}
                          height={40}
                          className="rounded-full border-2 border-[#8b7355]"
                        />
                      ) : (
                        <div className="w-10 h-10 bg-[#2d261f] rounded-full flex items-center justify-center border-2 border-[#8b7355] text-[#c4a574]">
                          {app.discordName[0]}
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-[#d4c4a8]">{app.discordName}</p>
                        <p className="text-sm text-[#6b5a45]">
                          {new Date(app.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}

              <h2 className="font-['Special_Elite'] text-[#c4a574] uppercase tracking-wider text-sm mt-8">Processed</h2>
              {processedApps.slice(0, 10).map(app => (
                <div
                  key={app.id}
                  onClick={() => setSelectedApp(app)}
                  className={`card cursor-pointer opacity-60 hover:opacity-100 transition-opacity ${
                    selectedApp?.id === app.id ? 'border-[#c4a574] opacity-100' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#2d261f] rounded-full flex items-center justify-center border-2 border-[#8b7355] text-[#c4a574]">
                      {app.discordName[0]}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-[#d4c4a8]">{app.discordName}</p>
                      <p className={`text-sm capitalize ${
                        app.status === 'approved' ? 'text-green-500' : 'text-red-500'
                      }`}>
                        {app.status}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Application Detail */}
            <div className="lg:col-span-2">
              {selectedApp ? (
                <div className="card">
                  <div className="flex items-center justify-between mb-6 pb-6 border-b border-[#8b7355]/30">
                    <div className="flex items-center gap-3">
                      {selectedApp.discordAvatar ? (
                        <Image
                          src={`https://cdn.discordapp.com/avatars/${selectedApp.discordId}/${selectedApp.discordAvatar}.png`}
                          alt=""
                          width={48}
                          height={48}
                          className="rounded-full border-2 border-[#8b7355]"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-[#2d261f] rounded-full flex items-center justify-center text-lg border-2 border-[#8b7355] text-[#c4a574]">
                          {selectedApp.discordName[0]}
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-lg text-[#d4c4a8]">{selectedApp.discordName}</p>
                        <p className="text-sm text-[#6b5a45]">ID: {selectedApp.discordId}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {selectedApp.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleApprove(selectedApp.id)}
                            disabled={processing}
                            className="btn btn-success"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => setShowDenialModal(true)}
                            disabled={processing}
                            className="btn btn-danger"
                          >
                            Deny
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handleDeleteApplication(selectedApp.id)}
                        disabled={processing}
                        className="btn bg-[#2d261f] hover:bg-[#3d3529] border-[#8b7355] text-[#d4c4a8] text-sm"
                        title="Delete application to allow re-apply"
                      >
                        Reset
                      </button>
                    </div>
                  </div>

                  <div className="space-y-6">
                    {selectedApp.answers.map(answer => (
                      <div key={answer.id} className="border-b border-[#8b7355]/20 pb-4 last:border-0">
                        <p className="font-medium text-[#c4a574] mb-2">{answer.question.text}</p>
                        {answer.textAnswer && (
                          <p className="text-[#d4c4a8] whitespace-pre-wrap">{answer.textAnswer}</p>
                        )}
                        {answer.audioUrl && (
                          <audio src={answer.audioUrl} controls className="w-full mt-2" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="card text-center text-[#6b5a45] py-12">
                  Select an application to view details
                </div>
              )}
            </div>
          </div>
        )}

        {/* Questions Tab */}
        {tab === 'questions' && (
          <div className="space-y-6">
            {/* Add Question Form */}
            <div className="card">
              <h2 className="font-['Special_Elite'] text-[#c4a574] uppercase tracking-wider mb-4">Add New Question</h2>
              <div className="grid md:grid-cols-4 gap-4">
                <div className="md:col-span-2">
                  <input
                    type="text"
                    placeholder="Question text"
                    className="input"
                    value={newQuestion.text}
                    onChange={(e) => setNewQuestion(prev => ({ ...prev, text: e.target.value }))}
                  />
                </div>
                <select
                  className="input"
                  value={newQuestion.type}
                  onChange={(e) => setNewQuestion(prev => ({ ...prev, type: e.target.value }))}
                >
                  <option value="text">Short Text</option>
                  <option value="textarea">Long Text</option>
                  <option value="audio">Audio Recording</option>
                </select>
                <button
                  onClick={handleAddQuestion}
                  disabled={!newQuestion.text}
                  className="btn btn-primary"
                >
                  Add Question
                </button>
              </div>
            </div>

            {/* Questions List */}
            <div className="space-y-4">
              {questions.map((question, index) => (
                <div key={question.id} className="card">
                  {editingQuestion?.id === question.id ? (
                    <div className="grid md:grid-cols-4 gap-4">
                      <div className="md:col-span-2">
                        <input
                          type="text"
                          className="input"
                          value={editingQuestion.text}
                          onChange={(e) => setEditingQuestion(prev => prev ? { ...prev, text: e.target.value } : null)}
                        />
                      </div>
                      <select
                        className="input"
                        value={editingQuestion.type}
                        onChange={(e) => setEditingQuestion(prev => prev ? { ...prev, type: e.target.value } : null)}
                      >
                        <option value="text">Short Text</option>
                        <option value="textarea">Long Text</option>
                        <option value="audio">Audio Recording</option>
                      </select>
                      <div className="flex gap-2">
                        <button onClick={handleUpdateQuestion} className="btn btn-success flex-1">
                          Save
                        </button>
                        <button onClick={() => setEditingQuestion(null)} className="btn bg-[#2d261f] border-[#8b7355] text-[#d4c4a8]">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-4">
                      <span className="text-[#c4a574] font-mono">{index + 1}.</span>
                      <div className="flex-1">
                        <p className="font-medium text-[#d4c4a8]">{question.text}</p>
                        <p className="text-sm text-[#6b5a45] capitalize">{question.type}</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditingQuestion(question)}
                          className="btn bg-[#2d261f] border-[#8b7355] text-[#d4c4a8] text-sm"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteQuestion(question.id)}
                          className="btn btn-danger text-sm"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Denial Modal */}
        {showDenialModal && selectedApp && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
            <div className="card max-w-md w-full">
              <h2 className="text-xl mb-4">Deny Application</h2>
              <p className="text-[#8b7355] mb-4">
                Optionally provide a reason for denying {selectedApp.discordName}'s application.
              </p>
              <textarea
                className="input mb-4"
                placeholder="Denial reason (optional)"
                value={denialReason}
                onChange={(e) => setDenialReason(e.target.value)}
              />
              <div className="flex gap-3">
                <button
                  onClick={() => handleDeny(selectedApp.id)}
                  disabled={processing}
                  className="btn btn-danger flex-1"
                >
                  Confirm Deny
                </button>
                <button
                  onClick={() => setShowDenialModal(false)}
                  className="btn bg-[#2d261f] border-[#8b7355] text-[#d4c4a8] flex-1"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
