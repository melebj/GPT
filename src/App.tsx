import { FormEvent, useMemo, useState } from 'react'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { compareAsc, format, isBefore, parseISO } from 'date-fns'

interface Student {
  id: string
  name: string
}

interface Homework {
  id: string
  studentId: string
  title: string
  subject: string
  description: string
  dueDate: string
  completed: boolean
  createdAt: string
}

interface HomeworkFormState {
  studentId: string
  title: string
  subject: string
  description: string
  dueDate: string
}

const HOMEWORK_KEY = 'homework_items_v1'
const STUDENTS_KEY = 'students_v1'
const API_KEY_STORAGE = 'gemini_api_key'
const AI_RESULTS_KEY = 'ai_results_by_student_v1'

function safeReadStudents(): Student[] {
  const raw = localStorage.getItem(STUDENTS_KEY)
  if (!raw) {
    return [{ id: crypto.randomUUID(), name: '학생 1' }]
  }

  try {
    const parsed = JSON.parse(raw) as Student[]
    const valid = parsed.filter((item) => item.id && item.name)
    return valid.length > 0 ? valid : [{ id: crypto.randomUUID(), name: '학생 1' }]
  } catch {
    return [{ id: crypto.randomUUID(), name: '학생 1' }]
  }
}

function safeReadHomeworks(studentId: string): Homework[] {
  const raw = localStorage.getItem(HOMEWORK_KEY)
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw) as Array<Homework & { studentId?: string }>
    return parsed
      .filter((item) => item.id && item.title && item.dueDate)
      .map((item) => ({
        ...item,
        studentId: item.studentId ?? studentId,
      }))
  } catch {
    return []
  }
}

function safeReadAiResults(): Record<string, string> {
  const raw = localStorage.getItem(AI_RESULTS_KEY)
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, string>
  } catch {
    return {}
  }
}

function App() {
  const initialStudents = safeReadStudents()

  const [students, setStudents] = useState<Student[]>(initialStudents)
  const [newStudentName, setNewStudentName] = useState('')
  const [homeworks, setHomeworks] = useState<Homework[]>(() => safeReadHomeworks(initialStudents[0].id))
  const [form, setForm] = useState<HomeworkFormState>(() => ({
    studentId: initialStudents[0].id,
    title: '',
    subject: '',
    description: '',
    dueDate: '',
  }))
  const [editingId, setEditingId] = useState<string | null>(null)

  const [apiKeyInput, setApiKeyInput] = useState(localStorage.getItem(API_KEY_STORAGE) ?? '')
  const [apiKey, setApiKey] = useState(localStorage.getItem(API_KEY_STORAGE) ?? '')
  const [apiError, setApiError] = useState<string>('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResultsByStudent, setAiResultsByStudent] = useState<Record<string, string>>(safeReadAiResults)

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

  const persistStudents = (next: Student[]) => {
    setStudents(next)
    localStorage.setItem(STUDENTS_KEY, JSON.stringify(next))
  }

  const persistHomeworks = (next: Homework[]) => {
    setHomeworks(next)
    localStorage.setItem(HOMEWORK_KEY, JSON.stringify(next))
  }

  const persistAiResults = (next: Record<string, string>) => {
    setAiResultsByStudent(next)
    localStorage.setItem(AI_RESULTS_KEY, JSON.stringify(next))
  }

  const handleAddStudent = () => {
    if (!newStudentName.trim()) return
    const created: Student = { id: crypto.randomUUID(), name: newStudentName.trim() }
    const nextStudents = [...students, created]
    persistStudents(nextStudents)
    setForm((prev) => ({ ...prev, studentId: created.id }))
    setNewStudentName('')
  }

  const handleSaveHomework = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!form.studentId || !form.title.trim() || !form.subject.trim() || !form.dueDate) return

    if (editingId) {
      const updated = homeworks.map((item) =>
        item.id === editingId
          ? {
              ...item,
              studentId: form.studentId,
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
        studentId: form.studentId,
        title: form.title.trim(),
        subject: form.subject.trim(),
        description: form.description.trim(),
        dueDate: form.dueDate,
        completed: false,
        createdAt: now,
      }
      persistHomeworks([...homeworks, created])
    }

    setForm((prev) => ({ ...prev, title: '', subject: '', description: '', dueDate: '' }))
    setEditingId(null)
  }

  const handleEditHomework = (item: Homework) => {
    setEditingId(item.id)
    setForm({
      studentId: item.studentId,
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
      setForm((prev) => ({ ...prev, title: '', subject: '', description: '', dueDate: '' }))
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

  const requestAiHelp = async (studentId: string, homework?: Homework) => {
    if (!apiKey) {
      setApiError('AI 기능을 사용하려면 API Key를 먼저 저장하세요.')
      return
    }

    const targetStudent = students.find((student) => student.id === studentId)
    const studentName = targetStudent?.name ?? '학생'
    const studentHomeworks = sortedHomeworks.filter((item) => item.studentId === studentId)

    setAiLoading(true)
    setApiError('')

    const prompt = homework
      ? `다음 숙제에 대한 학습 가이드 작성:\n학생:${studentName}\n제목:${homework.title}\n과목:${homework.subject}\n설명:${homework.description || '없음'}\n마감:${homework.dueDate}\n요구사항: 핵심 개념 3개, 30분 단위 학습 계획, 자주 하는 실수 3개`
      : `아래는 ${studentName}의 숙제 목록이야. 오늘의 우선순위 계획을 작성해줘:\n${studentHomeworks
          .map((item) => `- [${item.completed ? '완료' : '미완료'}] ${item.subject} ${item.title} (마감 ${item.dueDate})`)
          .join('\n')}\n요구사항: 1) 오늘 할 일 TOP3 2) 과목별 학습 팁 3) 시험 대비 체크리스트`

    try {
      const client = new GoogleGenerativeAI(apiKey)
      const model = client.getGenerativeModel({ model: 'gemini-3-flash-preview' })
      const response = await model.generateContent(prompt)
      persistAiResults({
        ...aiResultsByStudent,
        [studentId]: response.response.text(),
      })
    } catch {
      setApiError('AI 요청 중 오류가 발생했습니다. API Key와 네트워크 상태를 확인하세요.')
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-8 md:px-8 md:py-10">
      <section className="mb-8 rounded-3xl border border-white/70 bg-white/85 p-6 shadow-xl shadow-slate-300/40 backdrop-blur-xl md:p-8">
        <h1 className="text-3xl font-black tracking-tight text-slate-900 md:text-4xl">📚 AI 숙제 관리 앱</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 md:text-base">학생별 숙제 체크와 AI 학습 가이드를 관리하세요.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-center">
            <p className="text-xs font-medium text-slate-500">학생 수</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{students.length}</p>
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
      </section>

      <section className="mb-6 rounded-2xl border border-white/70 bg-white/85 p-5 shadow-lg shadow-slate-300/30 backdrop-blur-xl md:p-6">
        <h2 className="mb-2 text-lg font-bold text-slate-900">학생 추가</h2>
        <div className="flex flex-col gap-2 md:flex-row">
          <input
            value={newStudentName}
            onChange={(e) => setNewStudentName(e.target.value)}
            placeholder="학생 이름 입력"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
          />
          <button
            type="button"
            onClick={handleAddStudent}
            className="rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:from-sky-500 hover:to-indigo-500"
          >
            학생 추가
          </button>
        </div>
      </section>

      <section className="mb-6 rounded-2xl border border-white/70 bg-white/85 p-5 shadow-lg shadow-slate-300/30 backdrop-blur-xl md:p-6">
        <h2 className="mb-2 text-lg font-bold text-slate-900">Gemini API Key 설정</h2>
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

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-2xl border border-white/70 bg-white/85 p-5 shadow-lg shadow-slate-300/30 backdrop-blur-xl md:p-6">
          <h2 className="mb-4 text-lg font-bold text-slate-900">숙제 등록 / 수정</h2>
          <form onSubmit={handleSaveHomework} className="space-y-3">
            <select
              value={form.studentId}
              onChange={(e) => setForm((prev) => ({ ...prev, studentId: e.target.value }))}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
            >
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name}
                </option>
              ))}
            </select>
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
              <button className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-sm font-semibold text-white" type="submit">
                {editingId ? '수정 완료' : '숙제 추가'}
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/85 p-5 shadow-lg shadow-slate-300/30 backdrop-blur-xl md:p-6">
          <h2 className="mb-4 text-lg font-bold text-slate-900">학생별 숙제 체크리스트</h2>
          <div className="space-y-4">
            {students.map((student) => {
              const studentHomeworks = sortedHomeworks.filter((item) => item.studentId === student.id)
              return (
                <article key={student.id} className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-base font-bold text-slate-900">{student.name}</h3>
                    <button
                      type="button"
                      onClick={() => requestAiHelp(student.id)}
                      disabled={!apiKey || aiLoading || studentHomeworks.length === 0}
                      className="rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:from-violet-300 disabled:to-fuchsia-300"
                    >
                      {aiLoading ? 'AI 분석 중...' : '이 학생 계획 생성'}
                    </button>
                  </div>
                  <ul className="space-y-2">
                    {studentHomeworks.map((item) => {
                      const overdue = !item.completed && isBefore(parseISO(item.dueDate), new Date())
                      return (
                        <li key={item.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className={`font-semibold ${item.completed ? 'line-through text-slate-400' : 'text-slate-800'}`}>{item.title}</p>
                              <p className="text-sm text-slate-600">
                                {item.subject} · 마감 {format(parseISO(item.dueDate), 'yyyy-MM-dd')} {overdue ? '⏰ 지남' : ''}
                              </p>
                            </div>
                            <input
                              type="checkbox"
                              checked={item.completed}
                              onChange={() => handleToggleComplete(item.id)}
                              className="mt-1 h-4 w-4"
                              aria-label={`${student.name}-${item.title} 완료 체크`}
                            />
                          </div>
                          <div className="mt-2 flex gap-2">
                            <button onClick={() => handleEditHomework(item)} className="rounded-lg bg-amber-500 px-2 py-1 text-xs text-white">
                              수정
                            </button>
                            <button onClick={() => handleDeleteHomework(item.id)} className="rounded-lg bg-rose-500 px-2 py-1 text-xs text-white">
                              삭제
                            </button>
                            <button
                              onClick={() => requestAiHelp(student.id, item)}
                              disabled={!apiKey || aiLoading}
                              className="rounded-lg bg-indigo-600 px-2 py-1 text-xs text-white disabled:bg-indigo-300"
                            >
                              AI 학습도우미
                            </button>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                  {studentHomeworks.length === 0 && <p className="text-sm text-slate-500">등록된 숙제가 없습니다.</p>}
                </article>
              )
            })}
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-2xl border border-white/70 bg-white/85 p-5 shadow-lg shadow-slate-300/30 backdrop-blur-xl md:p-6">
        <h2 className="mb-4 text-lg font-bold text-slate-900">학생별 AI 결과</h2>
        {!apiKey && <p className="text-sm text-slate-500">API Key를 저장하면 학생별 AI 결과가 표시됩니다.</p>}
        {students.map((student) => (
          <article key={student.id} className="mb-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <h3 className="mb-2 font-semibold text-slate-900">{student.name}</h3>
            {aiResultsByStudent[student.id] ? (
              <pre className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{aiResultsByStudent[student.id]}</pre>
            ) : (
              <p className="text-sm text-slate-500">아직 생성된 결과가 없습니다.</p>
            )}
          </article>
        ))}
      </section>
    </main>
  )
}

export default App
