// Только для дашборда и списка рассылок: страницы с notFound() лежат вне группы,
// иначе ответ начинал стримиться до notFound(), и «не найдено» уходило со статусом 200.
export default function ContentLoading() {
  return <p role="status" className="py-8 text-sm text-muted-foreground">Загружаем учебный контент…</p>
}
