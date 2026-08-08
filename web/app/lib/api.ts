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
}

export interface Task {
  id: string;
  kind: TaskKind;
  order: number;
  prompt: string;
  payload: TrialPayload | { rationale: string } | null;
  generatedByAi: boolean;
  modelId: string;
}

export interface Signal {
  trait: string;
  weight: number;
  evidence: string;
}

export interface StartResponse {
  sessionId: string;
  locale: 'RU' | 'KK';
  task: Task;
  disclaimer: string;
}

export interface AnswerResponse {
  assessment: { summary: string; feedback: string };
  profile: Signal[];
  task: Task | null;
  finished: boolean;
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

export interface ResultResponse {
  sessionId: string;
  profile: Signal[];
  confidence: number;
  matches: Match[];
  dialogue: { question: string; answer: string }[];
  disclaimer: string;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `Сервер ответил ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const startSession = (locale: 'RU' | 'KK') =>
  fetch(`${API}/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ consentAccepted: true, locale }),
  }).then(json<StartResponse>);

export const submitAnswer = (sessionId: string, text: string) =>
  fetch(`${API}/sessions/${sessionId}/answers`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  }).then(json<AnswerResponse>);

export const getResult = (sessionId: string) =>
  fetch(`${API}/sessions/${sessionId}/result`).then(json<ResultResponse>);

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
