// Только для списка: страница записи вызывает notFound(), а под loading.tsx
// ответ начинал бы стримиться раньше, и «не найдено» уходило со статусом 200.
export default function InterviewsLoading() {
  return <div role="status" className="mx-auto max-w-6xl space-y-5"><h1 className="text-2xl font-bold">Собеседования</h1><p className="text-sm text-muted-foreground">Загружаем записи…</p></div>
}
