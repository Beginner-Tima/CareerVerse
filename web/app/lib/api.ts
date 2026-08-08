/**
 * Клиент к NestJS-бэкенду. Вся логика ИИ живёт там — фронт только показывает
 * то, что пришло, и никогда не видит ключа модели.
 */
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api';

export type TaskKind = 'CLARIFYING_QUESTION' | 'PROFESSION_TRIAL';

export interface TrialPayload {
  title: string;
  scenario: string;
  materials: string[];
  successLooksLike: string;
  profession: string;
  step?: number;
  totalSteps?: number;
}

export interface Task {
  id: string;
  kind: TaskKind;
  order: number;
  prompt: string;
  payload: TrialPayload | { rationale: string; retry?: boolean } | null;
  generatedByAi: boolean;
  modelId: string;
}

export interface Signal {
  trait: string;
  weight: number;
  evidence: string;
}

/**
 * Общего числа вопросов заранее нет: разговор кончается тогда, когда модель
 * говорит, что уже поняла человека. Поэтому здесь вилка, а не «шаг 2 из 3».
 */
export interface Progress {
  stage: 'questions' | 'trial' | 'done';
  asked: number;
  informative?: number;
  min: number;
  max: number;
  trialStep?: number;
  trialSteps: number;
}

export interface StartResponse {
  sessionId: string;
  locale: 'RU' | 'KK';
  grade: number | null;
  task: Task;
  progress: Progress;
  disclaimer: string;
}

export interface AnswerResponse {
  assessment: { summary: string; feedback: string };
  profile: Signal[];
  task: Task | null;
  finished: boolean;
  progress: Progress;
}

export interface Match {
  fit: number;
  because: string;
  profession?: { id: string; title: string; titleKk: string | null; description: string };
  labourMarket?: {
    medianSalaryKzt: number | null;
    vacancyCount: number | null;
    demandTrend: string | null;
    regions: string[] | null;
    source: string;
    collectedAt: string;
  };
}

export interface Reward {
  xp: number;
  coins: number;
  mentorCost: number;
}

/** Проба не входит в тест — экран результата решает, предлагать её или нет. */
export interface TrialState {
  done: boolean;
  steps: number;
  answered: number;
  rewardXp: number;
  rewardCoins: number;
}

export interface ResultResponse {
  sessionId: string;
  grade: number | null;
  claimed: boolean;
  reward: Reward;
  trial: TrialState;
  profile: Signal[];
  confidence: number;
  matches: Match[];
  dialogue: { question: string; answer: string }[];
  disclaimer: string;
}

export interface AuthUser {
  id: string;
  name: string | null;
  grade: number | null;
  city: string | null;
  xp: number;
  coins: number;
  level: number;
}

export interface RegisterResponse {
  token: string;
  loginCode: string;
  user: AuthUser;
  notice: string;
}

export interface HistoryEntry {
  sessionId: string;
  completedAt: string | null;
  confidence: number;
  topProfession: string | null;
  hasMentorReview: boolean;
}

export interface MeResponse {
  user: AuthUser;
  history: HistoryEntry[];
}

export interface MentorReviewContent {
  didWell: string;
  gaps: string;
  monthPlan: string[];
  closing: string;
}

export interface CareerPlanContent {
  entSubjects: string[];
  universities: { name: string; city: string; why: string }[];
  languages: string;
  toGetHired: string[];
  nextMonth: string[];
}

export interface Profession {
  id: string;
  title: string;
  titleKk: string | null;
  description: string;
  marketData?: {
    medianSalaryKzt: number | null;
    vacancyCount: number | null;
    demandTrend: string | null;
    regions: string[] | null;
    source: string;
    collectedAt: string;
  } | null;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `Сервер ответил ${res.status}`);
  }
  return res.json() as Promise<T>;
}

const headers = (token?: string) => ({
  'content-type': 'application/json',
  ...(token ? { authorization: `Bearer ${token}` } : {}),
});

export const startSession = (locale: 'RU' | 'KK', grade?: number) =>
  fetch(`${API}/sessions`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ consentAccepted: true, locale, grade }),
  }).then(json<StartResponse>);

export const submitAnswer = (sessionId: string, text: string) =>
  fetch(`${API}/sessions/${sessionId}/answers`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ text }),
  }).then(json<AnswerResponse>);

export const getResult = (sessionId: string) =>
  fetch(`${API}/sessions/${sessionId}/result`).then(json<ResultResponse>);

export const startTrial = (sessionId: string) =>
  fetch(`${API}/sessions/${sessionId}/trial`, {
    method: 'POST',
    headers: headers(),
  }).then(json<{ task: Task; progress: Progress }>);

export const claimSession = (sessionId: string, token: string) =>
  fetch(`${API}/sessions/${sessionId}/claim`, {
    method: 'POST',
    headers: headers(token),
  }).then(json<{ reward: Reward; user: AuthUser }>);

export const requestMentorReview = (sessionId: string, token: string) =>
  fetch(`${API}/sessions/${sessionId}/mentor-review`, {
    method: 'POST',
    headers: headers(token),
  }).then(json<{ content: MentorReviewContent; costCoins: number; alreadyPaid: boolean }>);

export const requestPlan = (sessionId: string, context?: string) =>
  fetch(`${API}/sessions/${sessionId}/plan`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ context }),
  }).then(json<{ content: CareerPlanContent; context: string | null; disclaimer: string }>);

export const register = (body: { name: string; grade: number; city?: string }) =>
  fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  }).then(json<RegisterResponse>);

export const login = (code: string) =>
  fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ code }),
  }).then(json<{ token: string; user: AuthUser }>);

export const getMe = (token: string) =>
  fetch(`${API}/auth/me`, { headers: headers(token) }).then(json<MeResponse>);

export const getProfessions = () =>
  fetch(`${API}/professions`).then(json<Profession[]>);

/**
 * Письмо родителям приходит по SSE. EventSource не используем: он не даёт
 * закрыть поток по завершении без лишнего переподключения.
 */
export async function streamParentLetter(
  sessionId: string,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API}/sessions/${sessionId}/parent-letter`, { signal });
  if (!res.ok || !res.body) throw new Error('Не удалось получить письмо');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const payload = JSON.parse(line.slice(5)) as { text?: string; done?: boolean };
      if (payload.done) {
        await reader.cancel();
        return;
      }
      if (payload.text) onChunk(payload.text);
    }
  }
}
