export async function register(): Promise<void> {
  // Условие обязано остаться в этой форме: Next подставляет NEXT_RUNTIME литералом,
  // и только так ветка вместе с импортом вырезается из edge-сборки. При раннем
  // выходе SDK попадает в edge-бандл и тянет gRPC — сборка падает на `fs`.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      await import('./instrumentation.node')
    } catch (error) {
      console.error('[instrumentation] телеметрия не инициализирована', error)
    }
  }
}
