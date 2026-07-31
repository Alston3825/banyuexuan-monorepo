import { http } from '../client'
import type {
  AvailableExam,
  CreateTrainingExamDto,
  ExamAttempt,
  GradeExamAttemptDto,
  SubmitExamAttemptDto,
  TrainingExam,
  UpdateTrainingExamDto,
} from '../types/training'

export const trainingExamApi = {
  list: () => http.get<TrainingExam[]>('/training/exams').then((r) => r.data),
  get: (id: string) => http.get<TrainingExam>(`/training/exams/${id}`).then((r) => r.data),
  create: (body: CreateTrainingExamDto) => http.post<TrainingExam>('/training/exams', body).then((r) => r.data),
  update: (id: string, body: UpdateTrainingExamDto) => http.patch<TrainingExam>(`/training/exams/${id}`, body).then((r) => r.data),
}

export const examAttemptApi = {
  listAvailableExams: () => http.get<AvailableExam[]>('/training/attempts/available-exams').then((r) => r.data),
  getExamForAttempt: (examId: string) => http.get<AvailableExam>(`/training/attempts/exams/${examId}`).then((r) => r.data),
  submit: (body: SubmitExamAttemptDto) => http.post<ExamAttempt>('/training/attempts', body).then((r) => r.data),
  listMine: () => http.get<ExamAttempt[]>('/training/attempts/mine').then((r) => r.data),
  listPendingGrading: () => http.get<ExamAttempt[]>('/training/attempts/pending-grading').then((r) => r.data),
  get: (id: string) => http.get<ExamAttempt>(`/training/attempts/${id}`).then((r) => r.data),
  grade: (id: string, body: GradeExamAttemptDto) => http.post<ExamAttempt>(`/training/attempts/${id}/grade`, body).then((r) => r.data),
}
