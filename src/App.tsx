import { FormEvent, useMemo, useState } from 'react'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { compareAsc, format, isBefore, parseISO } from 'date-fns'

interface Homework {
  id: string
  title: string
  subject: string
  description: string
  dueDate: string
  completed: boolean
  createdAt: string
}

interface HomeworkFormState {
  title: string
  subject: string
  description: string
  dueDate: string
}

const HOMEWORK_KEY = 'homework_items_v1'
const API_KEY_STORAGE = 'gemini_api_key'

const emptyForm: HomeworkFormState = {
  title: '',
  subject: '',
  description: '',
  dueDate: '',
}

function safeReadHomeworks(): Homework[] {
  const raw = localStorage.getItem(HOMEWORK_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as Homework[]
    return parsed.filter((item) => item.id && item.title && item.dueDate)
  } catch {
    return []
  }
}

function App() {
  const [apiKeyInput, setApiKeyInput] = useState(localStorage.getItem(API_KEY_STORAGE) ?? '')
  const [apiKey, setApiKey] = useState(localStorage.getItem(API_KEY_STORAGE) ?? '')
  const [apiError, setApiError] = useState<string>('')
  const [homeworks, setHomeworks] = useState<Homework[]>(safeReadHomeworks)
  const [form, setForm] = useState<HomeworkFormState>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [aiResult, setAiResult] = useState('')
  const [aiLoading, setAiLoading] = useState(false)

  const sortedHomeworks = useMemo(
    () =>
      [...homeworks].sort((a, b) => {
        const dueCompare = compareAsc(parseISO(a.dueDate), parseISO(b.dueDate))
        if (dueCompare !== 0) return dueCompare
        return compareAsc(parseISO(a.createdAt), parseISO(b.createdAt))
      }),
    [homeworks],
  )

  const completeCount = homeworks.filter((item) => item.completed).length
  const overdueCount = homeworks.filter((item) => !item.completed && isBefore(parseISO(item.dueDate), new Date())).length

  const persistHomeworks = (next: Homework[]) => {
    setHomeworks(next)
    localStorage.setItem(HOMEWORK_KEY, JSON.stringify(next))
  }

  const handleSaveHomework = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!form.title.trim() || !form.subject.trim() || !form.dueDate) return

    if (editingId) {
      const updated = homeworks.map((item) =>
        item.id === editingId
          ? {
              ...item,
              title: form.title.trim(),
              subject: form.subject.trim(),
              description: form.description.trim(),
              dueDate: form.dueDate,
            }
          : item,
      )
      persistHomeworks(updated)
    } else {
      const now = new Date().toISOString()
      const created: Homework = {
        id: crypto.randomUUID(),
        title: form.title.trim(),
        subject: form.subject.trim(),
        description: form.description.trim(),
        dueDate: form.dueDate,
        completed: false,
        createdAt: now,
      }
      persistHomeworks([...homeworks, created])
    }

    setForm(emptyForm)
    setEditingId(null)
  }

  const handleEditHomework = (item: Homework) => {
    setEditingId(item.id)
    setForm({
      title: item.title,
      subject: item.subject,
      description: item.description,
      dueDate: item.dueDate,
    })
  }

  const handleDeleteHomework = (id: string) => {
    persistHomeworks(homeworks.filter((item) => item.id !== id))
    if (editingId === id) {
      setEditingId(null)
      setForm(emptyForm)
    }
  }

  const handleToggleComplete = (id: string) => {
    persistHomeworks(homeworks.map((item) => (item.id === id ? { ...item, completed: !item.completed } : item)))
  }

  const handleSaveApiKey = async () => {
    setApiError('')
    if (!apiKeyInput.trim()) {
      localStorage.removeItem(API_KEY_STORAGE)
      setApiKey('')
      return
    }

    try {
      const client = new GoogleGenerativeAI(apiKeyInput.trim())
      const model = client.getGenerativeModel({ model: 'gemini-3-flash-preview' })
      await model.generateContent('API key validation test. Respond with OK.')

      localStorage.setItem(API_KEY_STORAGE, apiKeyInput.trim())
      setApiKey(apiKeyInput.trim())
    } catch {
      setApiError('API Key가 유효하지 않거나 네트워크 오류가 발생했습니다.')
      setApiKey('')
    }
  }

  const requestAiHelp = async (homework?: Homework) => {
    if (!apiKey) {
      setApiError('AI 기능을 사용하려면 API Key를 먼저 저장하세요.')
      return
    }

    setAiLoading(true)
    setAiResult('')
    setApiError('')

    const prompt = homework
      ? `다음 숙제에 대한 학습 가이드 작성:\n제목:${homework.title}\n과목:${homework.subject}\n설명:${homework.description || '없음'}\n마감:${homework.dueDate}\n요구사항: 핵심 개념 3개, 30분 단위 학습 계획, 자주 하는 실수 3개`
      : `아래 숙제 목록으로 오늘의 우선순위 계획을 작성해줘:\n${sortedHomeworks
          .map((item) => `- [${item.completed ? '완료' : '미완료'}] ${item.subject} ${item.title} (마감 ${item.dueDate})`)
          .join('\n')}\n요구사항: 1) 오늘 할 일 TOP3 2) 과목별 학습 팁 3) 시험 대비 체크리스트`

    try {
      const client = new GoogleGenerativeAI(apiKey)
      const model = client.getGenerativeModel({ model: 'gemini-3-flash-preview' })
      const response = await model.generateContent(prompt)
      setAiResult(response.response.text())
    } catch {
      setApiError('AI 요청 중 오류가 발생했습니다. API Key와 네트워크 상태를 확인하세요.')
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-8 md:px-8 md:py-10">
      <section className="mb-8 rounded-3xl border border-white/70 bg-white/85 p-6 shadow-xl shadow-slate-300/40 backdrop-blur-xl md:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-2 inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold tracking-wide text-sky-700">
              SMART STUDY DASHBOARD
            </p>
            <h1 className="text-3xl font-black tracking-tight text-slate-900 md:text-4xl">📚 AI 숙제 관리 앱</h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 md:text-base">
              마감일 중심으로 숙제를 체계적으로 정리하고, Gemini를 활용해 우선순위 플랜과 학습 가이드를 생성하세요.
            </p>
          </div>
          <div className="grid w-full gap-3 sm:grid-cols-3 lg:w-auto">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-center">
              <p className="text-xs font-medium text-slate-500">전체 숙제</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{homeworks.length}</p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-center">
              <p className="text-xs font-medium text-emerald-600">완료</p>
              <p className="mt-1 text-2xl font-bold text-emerald-700">{completeCount}</p>
            </div>
            <div className="rounded-2xl border border-rose-200 bg-rose-50/70 px-4 py-3 text-center">
              <p className="text-xs font-medium text-rose-600">지연</p>
              <p className="mt-1 text-2xl font-bold text-rose-700">{overdueCount}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mb-6 rounded-2xl border border-white/70 bg-white/85 p-5 shadow-lg shadow-slate-300/30 backdrop-blur-xl md:p-6">
        <h2 className="mb-2 text-lg font-bold text-slate-900">1) Gemini API Key 설정</h2>
        <p className="mb-3 text-sm text-slate-600">API Key는 브라우저 localStorage에만 저장되며, 서버로 전송되지 않습니다.</p>
        <div className="flex flex-col gap-2 md:flex-row">
          <input
            type="password"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder="Gemini API Key 입력"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm shadow-inner shadow-slate-100 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
          />
          <button
            type="button"
            onClick={handleSaveApiKey}
            className="rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:from-sky-500 hover:to-indigo-500"
          >
            저장/검증
          </button>
        </div>
        <p className="mt-2 text-sm font-medium text-slate-500">현재 상태: {apiKey ? '✅ 사용 가능' : '⚠️ 미설정 (AI 비활성)'}</p>
        {apiError && <p className="mt-2 text-sm font-medium text-rose-600">{apiError}</p>}
      </section>

      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-2xl border border-white/70 bg-white/85 p-5 shadow-lg shadow-slate-300/30 backdrop-blur-xl md:p-6">
          <h2 className="mb-4 text-lg font-bold text-slate-900">2) 숙제 등록 / 수정</h2>
          <form onSubmit={handleSaveHomework} className="space-y-3">
            <input
              required
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="숙제 제목"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
            />
            <input
              required
              value={form.subject}
              onChange={(e) => setForm((prev) => ({ ...prev, subject: e.target.value }))}
              placeholder="과목"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
            />
            <textarea
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="설명"
              className="h-24 w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
            />
            <input
              required
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm((prev) => ({ ...prev, dueDate: e.target.value }))}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
            />
            <div className="flex gap-2">
              <button
                className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:from-emerald-500 hover:to-teal-500"
                type="submit"
              >
                {editingId ? '수정 완료' : '숙제 추가'}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(null)
                    setForm(emptyForm)
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  취소
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/85 p-5 shadow-lg shadow-slate-300/30 backdrop-blur-xl md:p-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-lg font-bold text-slate-900">3) 숙제 목록 (마감일 정렬)</h2>
            <button
              type="button"
              onClick={() => requestAiHelp()}
              disabled={!apiKey || aiLoading || homeworks.length === 0}
              className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 py-2 text-sm font-semibold text-white shadow-md transition hover:from-violet-500 hover:to-fuchsia-500 disabled:cursor-not-allowed disabled:from-violet-300 disabled:to-fuchsia-300"
            >
              {aiLoading ? 'AI 분석 중...' : 'AI 오늘 계획 생성'}
            </button>
          </div>

          <ul className="space-y-3">
            {sortedHomeworks.map((item) => {
              const overdue = !item.completed && isBefore(parseISO(item.dueDate), new Date())
              return (
                <li
                  key={item.id}
                  className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50/70 p-4 shadow-sm transition hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className={`font-semibold ${item.completed ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                        {item.title}
                      </p>
                      <p className="text-sm text-slate-600">
                        {item.subject} · 마감 {format(parseISO(item.dueDate), 'yyyy-MM-dd')} {overdue ? '⏰ 지남' : ''}
                      </p>
                      {item.description && <p className="mt-1 text-sm text-slate-500">{item.description}</p>}
                    </div>
                    <input type="checkbox" checked={item.completed} onChange={() => handleToggleComplete(item.id)} className="mt-1 h-4 w-4" />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => handleEditHomework(item)}
                      className="rounded-lg bg-amber-500 px-2.5 py-1.5 text-sm font-medium text-white transition hover:bg-amber-400"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => handleDeleteHomework(item.id)}
                      className="rounded-lg bg-rose-500 px-2.5 py-1.5 text-sm font-medium text-white transition hover:bg-rose-400"
                    >
                      삭제
                    </button>
                    <button
                      onClick={() => requestAiHelp(item)}
                      disabled={!apiKey || aiLoading}
                      className="rounded-lg bg-indigo-600 px-2.5 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:bg-indigo-300"
                    >
                      AI 학습도우미
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
          {sortedHomeworks.length === 0 && <p className="text-sm text-slate-500">등록된 숙제가 없습니다.</p>}
        </section>
      </div>

      <section className="mt-6 rounded-2xl border border-white/70 bg-white/85 p-5 shadow-lg shadow-slate-300/30 backdrop-blur-xl md:p-6">
        <h2 className="mb-2 text-lg font-bold text-slate-900">4) AI 결과</h2>
        {!apiKey && <p className="text-sm text-slate-500">API Key를 저장하면 AI 결과가 표시됩니다.</p>}
        {aiLoading && <p className="text-sm text-slate-500">응답 생성 중...</p>}
        {aiResult && (
          <pre className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
            {aiResult}
          </pre>
        )}
      </section>
    </main>
  )
}

export default App
