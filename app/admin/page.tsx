'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import Image from 'next/image'

interface Application {
  id: string
  discordId: string
  discordName: string
  discordAvatar: string | null
  status: string
  denialReason: string | null
  revisionReason: string | null
  revisionQuestionIds: string[]
  revisedQuestionIds: string[]
  reviewedBy: string | null
  reviewedById: string | null
  reviewedAt: string | null
  createdAt: string
  form?: { id: string; name: string; slug: string } | null
  answers: {
    id: string
    textAnswer: string | null
    audioUrl: string | null
    previousTextAnswer: string | null
    previousAudioUrl: string | null
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

interface Form {
  id: string
  name: string
  slug: string
  description: string | null
  enabled: boolean
  roleId: string | null
  webhookUrl: string | null
  reviewerRoleId: string | null
  cooldownDays: number
  _count?: { applications: number }
}

// Helper function to convert URLs in text to clickable links
function linkifyText(text: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/g
  const parts = text.split(urlRegex)

  return parts.map((part, index) => {
    if (part.match(urlRegex)) {
      return (
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#c4a574] hover:text-[#d4c4a8] underline break-all"
        >
          {part}
        </a>
      )
    }
    return part
  })
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export default function AdminPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [tab, setTab] = useState<'applications' | 'questions' | 'manual' | 'forms'>('applications')
  const [applications, setApplications] = useState<Application[]>([])
  const [questions, setQuestions] = useState<Question[]>([])
  const [forms, setForms] = useState<Form[]>([])
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null) // null = whitelist
  const [selectedApp, setSelectedApp] = useState<Application | null>(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [denialReason, setDenialReason] = useState('')
  const [showDenialModal, setShowDenialModal] = useState(false)
  const [draggedQuestion, setDraggedQuestion] = useState<Question | null>(null)

  // Revision state
  const [revisionQuestionIds, setRevisionQuestionIds] = useState<string[]>([])
  const [revisionReason, setRevisionReason] = useState('')
  const [showRevisionModal, setShowRevisionModal] = useState(false)

  // Question form
  const [newQuestion, setNewQuestion] = useState({ text: '', type: 'text', required: true })
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null)

  // Manual whitelist state
  const [manualDiscordId, setManualDiscordId] = useState('')
  const [manualWhitelistLoading, setManualWhitelistLoading] = useState(false)
  const [manualWhitelistResult, setManualWhitelistResult] = useState<{ success: boolean; message: string } | null>(null)

  // Form management state
  const [newForm, setNewForm] = useState({ name: '', slug: '', description: '', roleId: '', webhookUrl: '', reviewerRoleId: '', cooldownDays: 7, enabled: true })
  const [editingForm, setEditingForm] = useState<Form | null>(null)
  const [editFormData, setEditFormData] = useState({ name: '', slug: '', description: '', roleId: '', webhookUrl: '', reviewerRoleId: '', cooldownDays: 7, enabled: true })
  const [formError, setFormError] = useState('')
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null)

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'revision' | 'approved' | 'denied'>('all')

  const serverName = process.env.NEXT_PUBLIC_SERVER_NAME || 'Our Server'
  const isAdmin = session?.user?.isAdmin ?? false
  const canManualWhitelist = session?.user?.canManualWhitelist ?? false

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/')
    }
  }, [status, router])

  // Check access: must be admin or have roles that match some form
  useEffect(() => {
    if (session && !session.user.isAdmin) {
      // Non-admin: check if they have access via reviewer roles
      // We'll verify after forms load — if they have no access, redirect
    }
  }, [session?.user?.isAdmin])

  useEffect(() => {
    if (session?.user?.id) {
      fetchForms()
    }
  }, [session?.user?.id])

  useEffect(() => {
    if (session?.user?.id) {
      fetchApplicationsAndQuestions()
    }
  }, [session?.user?.id, selectedFormId])

  // Reset revision checkboxes when selecting a different application
  useEffect(() => {
    setRevisionQuestionIds([])
  }, [selectedApp?.id])

  async function fetchForms() {
    try {
      const res = await fetch('/api/admin/forms')
      if (res.ok) {
        const data = await res.json()
        setForms(data.forms || [])
      } else if (res.status === 401) {
        // Check if user has whitelist reviewer access at least
        // If not, redirect
        if (!isAdmin) {
          // Try loading applications to see if they have whitelist access
          const appRes = await fetch('/api/admin/applications')
          if (!appRes.ok) {
            router.push('/apply')
            return
          }
        }
      }
    } catch (e) {
      console.error('Failed to fetch forms:', e)
    }
  }

  async function fetchApplicationsAndQuestions() {
    try {
      const formParam = selectedFormId ? `?formId=${selectedFormId}` : ''
      const [appsRes, questionsRes] = await Promise.all([
        fetch(`/api/admin/applications${formParam}`),
        fetch(`/api/questions${formParam}`),
      ])

      if (appsRes.status === 401) {
        // No access to this form
        if (!isAdmin) {
          router.push('/apply')
          return
        }
      }

      const appsData = await appsRes.json()
      const questionsData = await questionsRes.json()
      setApplications(appsData.applications || [])
      setQuestions(questionsData.questions || [])
      setSelectedApp(null)
    } catch (e) {
      console.error('Failed to fetch data:', e)
    } finally {
      setLoading(false)
    }
  }

  function warnDmFailed() {
    alert('Warning: The action was completed, but the DM could not be delivered. The user may have DMs disabled.')
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
        const data = await res.json()
        setApplications(prev => prev.map(a => a.id === appId ? { ...a, ...data.application } : a))
        setSelectedApp(prev => prev?.id === appId ? { ...prev, ...data.application } : prev)
        if (data.dmSent === false) warnDmFailed()
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
        const data = await res.json()
        setApplications(prev => prev.map(a => a.id === appId ? { ...a, ...data.application } : a))
        setSelectedApp(prev => prev?.id === appId ? { ...prev, ...data.application } : prev)
        setShowDenialModal(false)
        setDenialReason('')
        if (data.dmSent === false) warnDmFailed()
      }
    } catch (e) {
      console.error('Failed to deny:', e)
    } finally {
      setProcessing(false)
    }
  }

  async function handleSendRevision(appId: string) {
    if (revisionQuestionIds.length === 0) {
      alert('Please select at least one question to revise')
      return
    }
    setProcessing(true)
    try {
      const res = await fetch(`/api/admin/applications/${appId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'revision',
          revisionReason,
          revisionQuestionIds,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setApplications(prev => prev.map(a => a.id === appId ? { ...a, ...data.application } : a))
        setSelectedApp(prev => prev?.id === appId ? { ...prev, ...data.application } : prev)
        setShowRevisionModal(false)
        setRevisionReason('')
        setRevisionQuestionIds([])
        if (data.dmSent === false) warnDmFailed()
      }
    } catch (e) {
      console.error('Failed to send revision:', e)
    } finally {
      setProcessing(false)
    }
  }

  function toggleRevisionQuestion(questionId: string) {
    setRevisionQuestionIds(prev =>
      prev.includes(questionId)
        ? prev.filter(id => id !== questionId)
        : [...prev, questionId]
    )
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
        body: JSON.stringify({ ...newQuestion, formId: selectedFormId }),
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

  async function handleManualWhitelist() {
    if (!manualDiscordId.trim()) {
      setManualWhitelistResult({ success: false, message: 'Please enter a Discord ID' })
      return
    }

    setManualWhitelistLoading(true)
    setManualWhitelistResult(null)

    try {
      const res = await fetch('/api/admin/whitelist/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discordId: manualDiscordId.trim() }),
      })

      const data = await res.json()

      if (res.ok) {
        setManualWhitelistResult({ success: true, message: data.message })
        setManualDiscordId('')
      } else {
        setManualWhitelistResult({ success: false, message: data.error || 'Failed to whitelist user' })
      }
    } catch (e) {
      console.error('Failed to manually whitelist:', e)
      setManualWhitelistResult({ success: false, message: 'An error occurred while whitelisting the user' })
    } finally {
      setManualWhitelistLoading(false)
    }
  }

  // Form CRUD handlers
  async function handleCreateForm() {
    if (!newForm.name.trim() || !newForm.slug.trim()) {
      setFormError('Name and slug are required')
      return
    }
    setFormError('')
    try {
      const res = await fetch('/api/admin/forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newForm.name,
          slug: newForm.slug,
          description: newForm.description || null,
          roleId: newForm.roleId || null,
          webhookUrl: newForm.webhookUrl || null,
          reviewerRoleId: newForm.reviewerRoleId || null,
          cooldownDays: newForm.cooldownDays,
          enabled: newForm.enabled,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setForms(prev => [data.form, ...prev])
        setNewForm({ name: '', slug: '', description: '', roleId: '', webhookUrl: '', reviewerRoleId: '', cooldownDays: 7, enabled: true })
      } else {
        setFormError(data.error || 'Failed to create form')
      }
    } catch (e) {
      setFormError('Failed to create form')
    }
  }

  async function handleUpdateForm() {
    if (!editingForm) return
    try {
      const res = await fetch(`/api/admin/forms/${editingForm.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editFormData.name,
          slug: editFormData.slug,
          description: editFormData.description || null,
          roleId: editFormData.roleId || null,
          webhookUrl: editFormData.webhookUrl || null,
          reviewerRoleId: editFormData.reviewerRoleId || null,
          cooldownDays: editFormData.cooldownDays,
          enabled: editFormData.enabled,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setForms(prev => prev.map(f => f.id === editingForm.id ? { ...f, ...data.form } : f))
        setEditingForm(null)
      } else {
        alert(data.error || 'Failed to update form')
      }
    } catch (e) {
      alert('Failed to update form')
    }
  }

  async function handleDeleteForm(formId: string) {
    if (!confirm('Delete this form? This will also delete all its questions and applications. Consider disabling it instead.')) return
    try {
      const res = await fetch(`/api/admin/forms/${formId}?force=true`, { method: 'DELETE' })
      if (res.ok) {
        setForms(prev => prev.filter(f => f.id !== formId))
        if (selectedFormId === formId) {
          setSelectedFormId(null)
        }
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to delete form')
      }
    } catch (e) {
      alert('Failed to delete form')
    }
  }

  async function handleToggleForm(formId: string, enabled: boolean) {
    try {
      const res = await fetch(`/api/admin/forms/${formId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
      if (res.ok) {
        setForms(prev => prev.map(f => f.id === formId ? { ...f, enabled } : f))
      }
    } catch (e) {
      console.error('Failed to toggle form:', e)
    }
  }

  function copyFormLink(slug: string) {
    const url = `${window.location.origin}/apply?form=${slug}`
    navigator.clipboard.writeText(url)
    setCopiedSlug(slug)
    setTimeout(() => setCopiedSlug(null), 2000)
  }

  // Drag and drop handlers
  const handleDragStart = useCallback((e: React.DragEvent, question: Question) => {
    setDraggedQuestion(question)
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent, targetQuestion: Question) => {
    e.preventDefault()
    if (!draggedQuestion || draggedQuestion.id === targetQuestion.id) return

    const newQuestions = [...questions]
    const draggedIndex = newQuestions.findIndex(q => q.id === draggedQuestion.id)
    const targetIndex = newQuestions.findIndex(q => q.id === targetQuestion.id)

    // Remove dragged item and insert at target position
    newQuestions.splice(draggedIndex, 1)
    newQuestions.splice(targetIndex, 0, draggedQuestion)

    // Update local state immediately
    setQuestions(newQuestions)
    setDraggedQuestion(null)

    // Save to server
    try {
      await fetch('/api/admin/questions/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionIds: newQuestions.map(q => q.id) }),
      })
    } catch (e) {
      console.error('Failed to reorder questions:', e)
      fetchApplicationsAndQuestions()
    }
  }, [draggedQuestion, questions])

  const handleDragEnd = useCallback(() => {
    setDraggedQuestion(null)
  }, [])

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#c4a574]"></div>
      </div>
    )
  }

  if (!session) return null

  const searchLower = searchQuery.toLowerCase()
  const filtered = applications.filter(a =>
    !searchQuery || a.discordName.toLowerCase().includes(searchLower)
  )

  const pendingApps = filtered.filter(a => a.status === 'pending')
  const revisionApps = filtered.filter(a => a.status === 'revision')
  const approvedApps = filtered.filter(a => a.status === 'approved')
  const deniedApps = filtered.filter(a => a.status === 'denied')
  const processedApps = filtered.filter(a => a.status !== 'pending' && a.status !== 'revision')

  const showPending = statusFilter === 'all' || statusFilter === 'pending'
  const showRevision = statusFilter === 'all' || statusFilter === 'revision'
  const showProcessed = statusFilter === 'all' || statusFilter === 'approved' || statusFilter === 'denied'
  const visibleProcessedApps = statusFilter === 'approved' ? approvedApps
    : statusFilter === 'denied' ? deniedApps
    : processedApps

  const selectedFormName = selectedFormId
    ? forms.find(f => f.id === selectedFormId)?.name || 'Custom Form'
    : 'Whitelist'

  // Get status color helper
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'text-green-500'
      case 'denied': return 'text-red-500'
      case 'revision': return 'text-amber-500'
      default: return 'text-[#c4a574]'
    }
  }

  const getStatusBg = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-green-900/20 border-green-800/40'
      case 'denied': return 'bg-red-900/20 border-red-800/40'
      case 'revision': return 'bg-amber-900/20 border-amber-800/40'
      default: return 'bg-[#2d261f] border-[#8b7355]/30'
    }
  }

  // Form selector dropdown (shared between Applications and Questions tabs)
  const FormSelector = () => (
    <div className="flex items-center gap-3 mb-6">
      <label className="text-[#8b7355] text-sm whitespace-nowrap">Form:</label>
      <select
        className="input max-w-xs"
        value={selectedFormId || ''}
        onChange={(e) => setSelectedFormId(e.target.value || null)}
      >
        <option value="">Whitelist (Default)</option>
        {forms.map(form => (
          <option key={form.id} value={form.id}>
            {form.name} {!form.enabled ? '(Disabled)' : ''}
          </option>
        ))}
      </select>
    </div>
  )

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
              <p className="text-[#8b7355]">Manage applications</p>
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
        <div className="flex gap-2 mb-6 flex-wrap">
          <button
            onClick={() => setTab('applications')}
            className={`px-4 py-2 rounded font-medium transition-colors ${
              tab === 'applications'
                ? 'bg-[#c4a574] text-[#1a1410]'
                : 'bg-[#2d261f] text-[#8b7355] hover:text-[#c4a574] border border-[#8b7355]/30'
            }`}
          >
            Applications ({pendingApps.length} pending{revisionApps.length > 0 ? `, ${revisionApps.length} revision` : ''})
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
          {isAdmin && (
            <button
              onClick={() => setTab('forms')}
              className={`px-4 py-2 rounded font-medium transition-colors ${
                tab === 'forms'
                  ? 'bg-[#c4a574] text-[#1a1410]'
                  : 'bg-[#2d261f] text-[#8b7355] hover:text-[#c4a574] border border-[#8b7355]/30'
              }`}
            >
              Forms ({forms.length})
            </button>
          )}
          {canManualWhitelist && (
            <button
              onClick={() => setTab('manual')}
              className={`px-4 py-2 rounded font-medium transition-colors ${
                tab === 'manual'
                  ? 'bg-[#c4a574] text-[#1a1410]'
                  : 'bg-[#2d261f] text-[#8b7355] hover:text-[#c4a574] border border-[#8b7355]/30'
              }`}
            >
              Manual Whitelist
            </button>
          )}
        </div>

        {/* Applications Tab */}
        {tab === 'applications' && (
          <>
            <FormSelector />
            <div className="flex gap-3 mb-6">
              <input
                type="text"
                placeholder="Search by username..."
                className="input flex-1 max-w-xs"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <select
                className="input max-w-[10rem]"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="revision">Revision</option>
                <option value="approved">Approved</option>
                <option value="denied">Denied</option>
              </select>
            </div>
            <div className="grid lg:grid-cols-3 gap-6">
              {/* Applications List */}
              <div className="lg:col-span-1 space-y-4 lg:max-h-[calc(100vh-12rem)] lg:overflow-y-auto lg:pr-2">
                {showPending && (
                <>
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
                </>
                )}

                {/* Revision section */}
                {showRevision && revisionApps.length > 0 && (
                  <>
                    <h2 className="font-['Special_Elite'] text-amber-500 uppercase tracking-wider text-sm mt-8">Awaiting Revision</h2>
                    {revisionApps.map(app => (
                      <div
                        key={app.id}
                        onClick={() => setSelectedApp(app)}
                        className={`card cursor-pointer hover:border-amber-500 transition-colors ${
                          selectedApp?.id === app.id ? 'border-amber-500' : 'border-amber-800/30'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {app.discordAvatar ? (
                            <Image
                              src={`https://cdn.discordapp.com/avatars/${app.discordId}/${app.discordAvatar}.png`}
                              alt=""
                              width={40}
                              height={40}
                              className="rounded-full border-2 border-amber-700"
                            />
                          ) : (
                            <div className="w-10 h-10 bg-[#2d261f] rounded-full flex items-center justify-center border-2 border-amber-700 text-amber-500">
                              {app.discordName[0]}
                            </div>
                          )}
                          <div>
                            <p className="font-medium text-[#d4c4a8]">{app.discordName}</p>
                            <p className="text-sm text-amber-600">
                              {app.revisionQuestionIds?.length || 0} question(s) to revise
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {showProcessed && (
                <>
                <h2 className="font-['Special_Elite'] text-[#c4a574] uppercase tracking-wider text-sm mt-8">Processed</h2>
                {visibleProcessedApps.map(app => (
                  <div
                    key={app.id}
                    onClick={() => setSelectedApp(app)}
                    className={`card cursor-pointer opacity-60 hover:opacity-100 transition-opacity ${
                      selectedApp?.id === app.id ? 'border-[#c4a574] opacity-100' : ''
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
                      <div className="flex-1">
                        <p className="font-medium text-[#d4c4a8]">{app.discordName}</p>
                        <p className={`text-sm capitalize ${getStatusColor(app.status)}`}>
                          {app.status}
                          {app.reviewedBy && (
                            <span className="text-[#6b5a45]"> by {app.reviewedBy}</span>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
                </>
                )}
              </div>

              {/* Application Detail */}
              <div className="lg:col-span-2 lg:max-h-[calc(100vh-12rem)] lg:overflow-y-auto">
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
                          <p className="font-semibold text-lg text-[#d4c4a8]">
                            {selectedApp.discordName}
                            {selectedApp.form && (
                              <span className="ml-2 text-xs bg-[#2d261f] border border-[#8b7355]/30 px-2 py-0.5 rounded text-[#c4a574]">
                                {selectedApp.form.name}
                              </span>
                            )}
                          </p>
                          <p className="text-sm text-[#6b5a45]">ID: {selectedApp.discordId}</p>
                        </div>
                      </div>
                      <div className="flex gap-2 flex-wrap justify-end">
                        {(selectedApp.status === 'pending' || selectedApp.status === 'revision') && (
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
                        {selectedApp.status === 'pending' && revisionQuestionIds.length > 0 && (
                          <button
                            onClick={() => setShowRevisionModal(true)}
                            disabled={processing}
                            className="btn bg-amber-700 hover:bg-amber-600 text-white"
                          >
                            Send Revision ({revisionQuestionIds.length})
                          </button>
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

                    {/* Status info for processed applications */}
                    {selectedApp.status !== 'pending' && (
                      <div className={`mb-6 p-4 rounded border ${getStatusBg(selectedApp.status)}`}>
                        <div className="flex items-center justify-between">
                          <span className={`font-semibold capitalize ${getStatusColor(selectedApp.status)}`}>
                            {selectedApp.status === 'revision' ? 'Revision Requested' : selectedApp.status}
                          </span>
                          {selectedApp.reviewedBy && (
                            <span className="text-[#8b7355] text-sm">
                              by {selectedApp.reviewedBy}
                              {selectedApp.reviewedAt && (
                                <> on {new Date(selectedApp.reviewedAt).toLocaleDateString()}</>
                              )}
                            </span>
                          )}
                        </div>
                        {selectedApp.status === 'denied' && selectedApp.denialReason && (
                          <p className="mt-2 text-[#d4c4a8]">
                            <span className="text-[#8b7355]">Reason: </span>
                            {selectedApp.denialReason}
                          </p>
                        )}
                        {selectedApp.status === 'revision' && selectedApp.revisionReason && (
                          <p className="mt-2 text-[#d4c4a8]">
                            <span className="text-[#8b7355]">Reason: </span>
                            {selectedApp.revisionReason}
                          </p>
                        )}
                      </div>
                    )}

                    <div className="space-y-6">
                      {selectedApp.answers.map(answer => {
                        const needsRevision = (selectedApp.revisionQuestionIds || []).includes(answer.question.id)
                        const wasRevised = (selectedApp.revisedQuestionIds || []).includes(answer.question.id)
                        const isSelectedForRevision = revisionQuestionIds.includes(answer.question.id)
                        const shouldHighlight = needsRevision || wasRevised

                        return (
                          <div
                            key={answer.id}
                            className={`border-b border-[#8b7355]/20 pb-4 last:border-0 ${
                              shouldHighlight ? 'bg-amber-900/10 -mx-4 px-4 py-2 rounded border border-amber-800/30' : ''
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              {/* Checkbox for revision (only show for pending apps) */}
                              {selectedApp.status === 'pending' && (
                                <label className="flex items-center mt-1 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={isSelectedForRevision}
                                    onChange={() => toggleRevisionQuestion(answer.question.id)}
                                    className="w-4 h-4 rounded border-[#8b7355] bg-[#2d261f] text-amber-500 focus:ring-amber-500 cursor-pointer"
                                  />
                                </label>
                              )}
                              <div className="flex-1">
                                <p className={`font-medium mb-2 ${shouldHighlight ? 'text-amber-500' : 'text-[#c4a574]'}`}>
                                  {answer.question.text}
                                  {needsRevision && (
                                    <span className="ml-2 text-xs bg-amber-700 text-white px-2 py-0.5 rounded">
                                      Needs Revision
                                    </span>
                                  )}
                                  {wasRevised && !needsRevision && (
                                    <span className="ml-2 text-xs bg-amber-600 text-white px-2 py-0.5 rounded">
                                      Revised
                                    </span>
                                  )}
                                </p>
                                {wasRevised && (answer.previousTextAnswer || answer.previousAudioUrl) && (
                                  <div className="mb-3 border-l-2 border-[#8b7355]/40 pl-3">
                                    <p className="text-xs uppercase tracking-wide text-[#8b7355] mb-1">Previous answer</p>
                                    {answer.previousTextAnswer && (
                                      <p className="text-[#8b7355] whitespace-pre-wrap line-through decoration-[#8b7355]/40">
                                        {linkifyText(answer.previousTextAnswer)}
                                      </p>
                                    )}
                                    {answer.previousAudioUrl && (
                                      <audio src={answer.previousAudioUrl} controls className="w-full mt-2 opacity-60" />
                                    )}
                                  </div>
                                )}
                                {wasRevised && (answer.textAnswer || answer.audioUrl) && (
                                  <p className="text-xs uppercase tracking-wide text-amber-500 mb-1">Revised answer</p>
                                )}
                                {answer.textAnswer && (
                                  <p className="text-[#d4c4a8] whitespace-pre-wrap">
                                    {linkifyText(answer.textAnswer)}
                                  </p>
                                )}
                                {answer.audioUrl && (
                                  <audio src={answer.audioUrl} controls className="w-full mt-2" />
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="card text-center text-[#6b5a45] py-12">
                    Select an application to view details
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Forms Tab (Admin Only) */}
        {tab === 'forms' && isAdmin && (
          <div className="space-y-6">
            {/* Create Form */}
            <div className="card">
              <h2 className="font-['Special_Elite'] text-[#c4a574] uppercase tracking-wider mb-4">Create New Form</h2>

              {formError && (
                <div className="mb-4 p-3 bg-red-900/20 border border-red-800/40 rounded text-red-400 text-sm">
                  {formError}
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-[#8b7355] text-sm mb-1">Form Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Staff Application"
                    className="input"
                    value={newForm.name}
                    onChange={(e) => setNewForm(prev => ({
                      ...prev,
                      name: e.target.value,
                      slug: generateSlug(e.target.value),
                    }))}
                  />
                </div>
                <div>
                  <label className="block text-[#8b7355] text-sm mb-1">URL Slug *</label>
                  <input
                    type="text"
                    placeholder="e.g. staff-app"
                    className="input"
                    value={newForm.slug}
                    onChange={(e) => setNewForm(prev => ({ ...prev, slug: e.target.value }))}
                  />
                  <p className="text-[#6b5a45] text-xs mt-1">Used in URL: /apply?form={newForm.slug || '...'}</p>
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-[#8b7355] text-sm mb-1">Description</label>
                <textarea
                  placeholder="Shown to applicants on the form page"
                  className="input min-h-[60px]"
                  value={newForm.description}
                  onChange={(e) => setNewForm(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>

              <div className="grid md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-[#8b7355] text-sm mb-1">Approval Role ID</label>
                  <input
                    type="text"
                    placeholder="Discord role ID (optional)"
                    className="input"
                    value={newForm.roleId}
                    onChange={(e) => setNewForm(prev => ({ ...prev, roleId: e.target.value }))}
                  />
                  <p className="text-[#6b5a45] text-xs mt-1">Assigned to user on approval</p>
                </div>
                <div>
                  <label className="block text-[#8b7355] text-sm mb-1">Reviewer Role ID</label>
                  <input
                    type="text"
                    placeholder="Discord role ID (optional)"
                    className="input"
                    value={newForm.reviewerRoleId}
                    onChange={(e) => setNewForm(prev => ({ ...prev, reviewerRoleId: e.target.value }))}
                  />
                  <p className="text-[#6b5a45] text-xs mt-1">Can review this form's apps</p>
                </div>
                <div>
                  <label className="block text-[#8b7355] text-sm mb-1">Cooldown Days</label>
                  <input
                    type="number"
                    min="0"
                    className="input"
                    value={newForm.cooldownDays}
                    onChange={(e) => setNewForm(prev => ({ ...prev, cooldownDays: parseInt(e.target.value) || 7 }))}
                  />
                  <p className="text-[#6b5a45] text-xs mt-1">Re-apply wait after denial</p>
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-[#8b7355] text-sm mb-1">Staff Webhook URL</label>
                <input
                  type="text"
                  placeholder="Discord webhook URL (optional, falls back to default)"
                  className="input"
                  value={newForm.webhookUrl}
                  onChange={(e) => setNewForm(prev => ({ ...prev, webhookUrl: e.target.value }))}
                />
              </div>

              <button
                onClick={handleCreateForm}
                disabled={!newForm.name.trim() || !newForm.slug.trim()}
                className="btn btn-primary"
              >
                Create Form
              </button>
            </div>

            {/* Forms List */}
            <div className="space-y-4">
              {forms.length === 0 ? (
                <p className="text-[#6b5a45] text-center py-8">No custom forms created yet</p>
              ) : (
                forms.map(form => (
                  <div key={form.id} className="card">
                    {editingForm?.id === form.id ? (
                      /* Edit Mode */
                      <div className="space-y-4">
                        <div className="grid md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[#8b7355] text-sm mb-1">Form Name</label>
                            <input
                              type="text"
                              className="input"
                              value={editFormData.name}
                              onChange={(e) => setEditFormData(prev => ({ ...prev, name: e.target.value }))}
                            />
                          </div>
                          <div>
                            <label className="block text-[#8b7355] text-sm mb-1">URL Slug</label>
                            <input
                              type="text"
                              className="input"
                              value={editFormData.slug}
                              onChange={(e) => setEditFormData(prev => ({ ...prev, slug: e.target.value }))}
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[#8b7355] text-sm mb-1">Description</label>
                          <textarea
                            className="input min-h-[60px]"
                            value={editFormData.description}
                            onChange={(e) => setEditFormData(prev => ({ ...prev, description: e.target.value }))}
                          />
                        </div>
                        <div className="grid md:grid-cols-3 gap-4">
                          <div>
                            <label className="block text-[#8b7355] text-sm mb-1">Approval Role ID</label>
                            <input
                              type="text"
                              className="input"
                              value={editFormData.roleId}
                              onChange={(e) => setEditFormData(prev => ({ ...prev, roleId: e.target.value }))}
                            />
                          </div>
                          <div>
                            <label className="block text-[#8b7355] text-sm mb-1">Reviewer Role ID</label>
                            <input
                              type="text"
                              className="input"
                              value={editFormData.reviewerRoleId}
                              onChange={(e) => setEditFormData(prev => ({ ...prev, reviewerRoleId: e.target.value }))}
                            />
                          </div>
                          <div>
                            <label className="block text-[#8b7355] text-sm mb-1">Cooldown Days</label>
                            <input
                              type="number"
                              min="0"
                              className="input"
                              value={editFormData.cooldownDays}
                              onChange={(e) => setEditFormData(prev => ({ ...prev, cooldownDays: parseInt(e.target.value) || 7 }))}
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[#8b7355] text-sm mb-1">Staff Webhook URL</label>
                          <input
                            type="text"
                            className="input"
                            value={editFormData.webhookUrl}
                            onChange={(e) => setEditFormData(prev => ({ ...prev, webhookUrl: e.target.value }))}
                          />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={handleUpdateForm} className="btn btn-success">Save</button>
                          <button onClick={() => setEditingForm(null)} className="btn bg-[#2d261f] border-[#8b7355] text-[#d4c4a8]">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      /* Display Mode */
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold text-lg text-[#d4c4a8]">{form.name}</h3>
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              form.enabled
                                ? 'bg-green-900/30 text-green-400 border border-green-800/40'
                                : 'bg-red-900/30 text-red-400 border border-red-800/40'
                            }`}>
                              {form.enabled ? 'Active' : 'Disabled'}
                            </span>
                            {form._count?.applications !== undefined && form._count.applications > 0 && (
                              <span className="text-xs bg-[#2d261f] border border-[#8b7355]/30 px-2 py-0.5 rounded text-[#c4a574]">
                                {form._count.applications} pending
                              </span>
                            )}
                          </div>
                          {form.description && (
                            <p className="text-sm text-[#8b7355] mb-2">{form.description}</p>
                          )}
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#6b5a45]">
                            <span>Slug: <span className="text-[#c4a574]">{form.slug}</span></span>
                            {form.roleId && <span>Role: <span className="text-[#c4a574]">{form.roleId}</span></span>}
                            {form.reviewerRoleId && <span>Reviewer: <span className="text-[#c4a574]">{form.reviewerRoleId}</span></span>}
                            <span>Cooldown: <span className="text-[#c4a574]">{form.cooldownDays}d</span></span>
                          </div>
                        </div>
                        <div className="flex gap-2 flex-wrap justify-end">
                          <button
                            onClick={() => copyFormLink(form.slug)}
                            className="btn bg-[#2d261f] border-[#8b7355] text-[#d4c4a8] text-sm"
                          >
                            {copiedSlug === form.slug ? 'Copied!' : 'Copy Link'}
                          </button>
                          <button
                            onClick={() => handleToggleForm(form.id, !form.enabled)}
                            className={`btn text-sm ${
                              form.enabled
                                ? 'bg-amber-900/30 border-amber-800/40 text-amber-400'
                                : 'bg-green-900/30 border-green-800/40 text-green-400'
                            }`}
                          >
                            {form.enabled ? 'Disable' : 'Enable'}
                          </button>
                          <button
                            onClick={() => {
                              setEditingForm(form)
                              setEditFormData({
                                name: form.name,
                                slug: form.slug,
                                description: form.description || '',
                                roleId: form.roleId || '',
                                webhookUrl: form.webhookUrl || '',
                                reviewerRoleId: form.reviewerRoleId || '',
                                cooldownDays: form.cooldownDays,
                                enabled: form.enabled,
                              })
                            }}
                            className="btn bg-[#2d261f] border-[#8b7355] text-[#d4c4a8] text-sm"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteForm(form.id)}
                            className="btn btn-danger text-sm"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Manual Whitelist Tab */}
        {tab === 'manual' && canManualWhitelist && (
          <div className="max-w-xl">
            <div className="card">
              <h2 className="font-['Special_Elite'] text-[#c4a574] uppercase tracking-wider mb-4">Manual Whitelist</h2>
              <p className="text-[#8b7355] mb-6">
                Whitelist a user by their Discord ID without requiring them to complete an application.
                They will receive a DM notifying them of their whitelist status.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-[#c4a574] text-sm mb-2">Discord User ID</label>
                  <input
                    type="text"
                    placeholder="e.g. 123456789012345678"
                    className="input w-full"
                    value={manualDiscordId}
                    onChange={(e) => setManualDiscordId(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleManualWhitelist()}
                  />
                  <p className="text-[#6b5a45] text-xs mt-1">
                    Right-click the user in Discord and select "Copy User ID" (requires Developer Mode)
                  </p>
                </div>

                <button
                  onClick={handleManualWhitelist}
                  disabled={manualWhitelistLoading || !manualDiscordId.trim()}
                  className="btn btn-success w-full"
                >
                  {manualWhitelistLoading ? 'Whitelisting...' : 'Whitelist User'}
                </button>

                {manualWhitelistResult && (
                  <div className={`p-4 rounded border ${
                    manualWhitelistResult.success
                      ? 'bg-green-900/20 border-green-800/40 text-green-400'
                      : 'bg-red-900/20 border-red-800/40 text-red-400'
                  }`}>
                    {manualWhitelistResult.message}
                  </div>
                )}
              </div>
            </div>

            <div className="card mt-6">
              <h3 className="font-['Special_Elite'] text-[#c4a574] uppercase tracking-wider mb-3 text-sm">What happens when you whitelist someone manually?</h3>
              <ul className="text-[#8b7355] text-sm space-y-2">
                <li>1. The whitelist role is assigned to them in Discord</li>
                <li>2. They receive a DM explaining they've been vouched for</li>
                <li>3. The DM includes a link to the server rules</li>
              </ul>
            </div>
          </div>
        )}

        {/* Questions Tab */}
        {tab === 'questions' && (
          <div className="space-y-6">
            <FormSelector />

            {/* Add Question Form */}
            {isAdmin && (
              <div className="card">
                <h2 className="font-['Special_Elite'] text-[#c4a574] uppercase tracking-wider mb-4">
                  Add New Question {selectedFormId ? `to ${selectedFormName}` : ''}
                </h2>
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
            )}

            {/* Drag hint */}
            {isAdmin && (
              <p className="text-[#6b5a45] text-sm">Drag and drop questions to reorder them</p>
            )}

            {/* Questions List */}
            <div className="space-y-4">
              {questions.length === 0 ? (
                <p className="text-[#6b5a45] text-center py-8">No questions for this form yet</p>
              ) : (
                questions.map((question, index) => (
                  <div
                    key={question.id}
                    draggable={!editingQuestion && isAdmin}
                    onDragStart={(e) => handleDragStart(e, question)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, question)}
                    onDragEnd={handleDragEnd}
                    className={`card transition-all ${
                      draggedQuestion?.id === question.id ? 'opacity-50 scale-95' : ''
                    } ${!editingQuestion && isAdmin ? 'cursor-grab active:cursor-grabbing' : ''}`}
                  >
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
                        {isAdmin && (
                          <div className="text-[#6b5a45] cursor-grab">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                            </svg>
                          </div>
                        )}
                        <span className="text-[#c4a574] font-mono">{index + 1}.</span>
                        <div className="flex-1">
                          <p className="font-medium text-[#d4c4a8]">{question.text}</p>
                          <p className="text-sm text-[#6b5a45] capitalize">{question.type}</p>
                        </div>
                        {isAdmin && (
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
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
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

        {/* Revision Modal */}
        {showRevisionModal && selectedApp && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
            <div className="card max-w-md w-full">
              <h2 className="text-xl mb-4 text-amber-500">Request Revision</h2>
              <p className="text-[#8b7355] mb-2">
                Requesting revision for {revisionQuestionIds.length} question(s) from {selectedApp.discordName}.
              </p>
              <div className="mb-4 text-sm text-[#6b5a45]">
                <p className="mb-2">Questions to revise:</p>
                <ul className="list-disc list-inside">
                  {selectedApp.answers
                    .filter(a => revisionQuestionIds.includes(a.question.id))
                    .map(a => (
                      <li key={a.id} className="text-[#d4c4a8]">{a.question.text}</li>
                    ))}
                </ul>
              </div>
              <textarea
                className="input mb-4"
                placeholder="Reason for revision request"
                value={revisionReason}
                onChange={(e) => setRevisionReason(e.target.value)}
              />
              <div className="flex gap-3">
                <button
                  onClick={() => handleSendRevision(selectedApp.id)}
                  disabled={processing}
                  className="btn bg-amber-700 hover:bg-amber-600 text-white flex-1"
                >
                  Send Revision Request
                </button>
                <button
                  onClick={() => {
                    setShowRevisionModal(false)
                    setRevisionReason('')
                  }}
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
