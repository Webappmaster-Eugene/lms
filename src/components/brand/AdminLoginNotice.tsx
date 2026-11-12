import Link from 'next/link'

/** Вход в админку нарочно не похож на /login платформы: при быстрой работе вкладки путали. */
export function AdminLoginNotice() {
  return (
    <div className="admin-login-notice">
      {/* Лента дублирует заголовок, поэтому для чтения с экрана скрыта. */}
      <p className="admin-login-tape" aria-hidden="true"><span>Панель администратора</span></p>
      <p className="admin-login-notice__badge">Админка</p>
      <h1 className="admin-login-notice__title">Вход для администратора</h1>
    </div>
  )
}

export function AdminLoginStudentLink() {
  return (
    <p className="admin-login-student">
      Вы ученик? <Link href="/login" prefetch={false}>Вход для учеников</Link>
    </p>
  )
}
