import { BrandMark, BrandWordmark } from './BrandMark'

/** Логотип на входе в админку: без него Payload показывает свой знак. */
export function AdminLogo() {
  return (
    <span className="admin-brand-logo">
      <BrandMark size={48} />
      <BrandWordmark className="admin-brand-logo__name" />
    </span>
  )
}

/** Значок в навигации админки, 18 px: берётся плотная отрисовка для малых размеров. */
export function AdminIcon() {
  return <BrandMark size={18} />
}
