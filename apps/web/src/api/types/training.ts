import type { ScopedEntityBase } from './common'

export type TrainingExamStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
export type ExamQuestionType = 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'SHORT_ANSWER'
export type ExamAttemptStatus = 'PENDING_GRADING' | 'COMPLETED'

export interface ExamQuestionOption {
  key: string
  text: string
}

/** 管理端（含正确答案）。 */
export interface ExamQuestion {
  id: string
  order: number
  type: ExamQuestionType
  content: string
  options: ExamQuestionOption[] | null
  correctAnswer: unknown
  score: number
}

/** 员工作答端（不含正确答案）。 */
export interface SanitizedExamQuestion {
  id: string
  order: number
  type: ExamQuestionType
  content: string
  options: ExamQuestionOption[] | null
  score: number
}

export interface TrainingExam extends ScopedEntityBase {
  title: string
  studyMaterial: string | null
  passScore: number | null
  status: TrainingExamStatus
  questions: ExamQuestion[]
}

export interface ExamQuestionInput {
  order: number
  type: ExamQuestionType
  content: string
  options?: ExamQuestionOption[]
  correctAnswer?: unknown
  score: number
}

export interface CreateTrainingExamDto {
  title: string
  studyMaterial?: string
  passScore?: number
  questions: ExamQuestionInput[]
}

export interface UpdateTrainingExamDto {
  title?: string
  studyMaterial?: string
  passScore?: number
  status?: TrainingExamStatus
  questions?: ExamQuestionInput[]
  version: number
}

export interface AvailableExam {
  id: string
  title: string
  studyMaterial: string | null
  passScore: number | null
  questions: SanitizedExamQuestion[]
}

export interface ExamAnswer {
  id: string
  questionId: string
  selectedKeys: unknown
  textAnswer: string | null
  isCorrect: boolean | null
  score: number
  question: SanitizedExamQuestion
}

export interface ExamAttemptAccount {
  id: string
  realName: string
  username: string
}

export interface ExamAttempt {
  id: string
  examId: string
  accountId: string
  autoScore: number
  manualScore: number | null
  totalScore: number | null
  status: ExamAttemptStatus
  submittedAt: string
  gradedById: string | null
  gradedAt: string | null
  version: number
  exam: { id: string; title: string; passScore: number | null }
  account: ExamAttemptAccount
  answers: ExamAnswer[]
}

export interface SubmitExamAnswerInput {
  questionId: string
  selectedKeys?: unknown
  textAnswer?: string
}

export interface SubmitExamAttemptDto {
  examId: string
  answers: SubmitExamAnswerInput[]
}

export interface GradeExamAttemptDto {
  answers: { answerId: string; score: number }[]
}
