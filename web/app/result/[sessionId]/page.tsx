'use client';

import { useParams } from 'next/navigation';
import { ResultScreen } from '../../components/ResultScreen';

/**
 * Результат живёт по своему адресу, а не в состоянии одного экрана: только так
 * к нему можно вернуться из истории прохождений и переслать ссылку.
 */
export default function ResultPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;

  return (
    <main className="mx-auto max-w-2xl px-5 py-12">
      {sessionId ? (
        <ResultScreen sessionId={sessionId} />
      ) : (
        <p className="text-zinc-500">Не понял, какое прохождение открыть.</p>
      )}
    </main>
  );
}
