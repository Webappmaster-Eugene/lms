import { notFound } from 'next/navigation'

// Несуществующий адрес иначе получил бы корневую 404 Next: корневой layout
// не рисует <html>, и страница выходила бы белой и без меню платформы.
export default function CatchAll(): never {
  notFound()
}
