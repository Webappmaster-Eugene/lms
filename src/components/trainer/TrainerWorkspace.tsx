'use client'

import { useState, useCallback } from 'react'
import { Play, RotateCcw, CheckCircle2 } from 'lucide-react'
import { CodeEditor } from './CodeEditor'
import { useCodeRunner } from './CodeRunner'
import { OutputPanel } from './OutputPanel'
import { HintsAccordion } from './HintsAccordion'
import { validateOutput } from '@/lib/trainer-validation'

type TrainerWorkspaceProps = {
  taskId: string
  starterCode: string
  expectedOutput: string
  hints: Array<{ hint: string; id?: string }>
  isAlreadyCompleted: boolean
}

export function TrainerWorkspace({
  taskId,
  starterCode,
  expectedOutput,
  hints,
  isAlreadyCompleted,
}: TrainerWorkspaceProps) {
  const [code, setCode] = useState(starterCode)
  const [output, setOutput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [timedOut, setTimedOut] = useState(false)
  const [passed, setPassed] = useState<boolean | null>(isAlreadyCompleted ? true : null)
  const [isRunning, setIsRunning] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [attempts, setAttempts] = useState(0)

  const { execute } = useCodeRunner()

  const handleRun = useCallback(async () => {
    setIsRunning(true)
    setOutput('')
    setError(null)
    setTimedOut(false)
    setPassed(null)

    const result = await execute(code)

    setOutput(result.output)
    setError(result.error)
    setTimedOut(result.timedOut)
    setAttempts((a) => a + 1)

    // Проверяем output
    if (!result.error && !result.timedOut) {
      const isCorrect = validateOutput(result.output, expectedOutput)
      setPassed(isCorrect)

      if (isCorrect && !isAlreadyCompleted) {
        await submitSolution(code, result.output)
      }
    } else {
      setPassed(false)
    }

    setIsRunning(false)
  }, [code, expectedOutput, execute, isAlreadyCompleted])

  const submitSolution = async (userCode: string, userOutput: string) => {
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/trainer-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          taskId,
          userCode,
          output: userOutput,
        }),
      })

      if (!res.ok) {
        console.error('Failed to submit solution:', await res.text())
      }
    } catch (err) {
      console.error('Failed to submit solution:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleReset = () => {
    setCode(starterCode)
    setOutput('')
    setError(null)
    setTimedOut(false)
    setPassed(null)
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleRun}
          disabled={isRunning || !code.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          <Play className="h-4 w-4" />
          {isRunning ? 'Выполняется...' : 'Запустить'}
        </button>

        <button
          onClick={handleReset}
          disabled={isRunning}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          <RotateCcw className="h-4 w-4" />
          Сбросить
        </button>

        {passed === true && (
          <div className="ml-auto flex items-center gap-1.5 text-sm font-medium text-success">
            <CheckCircle2 className="h-4 w-4" />
            {isSubmitting ? 'Сохранение...' : isAlreadyCompleted ? 'Уже решено' : 'Решено!'}
          </div>
        )}

        {attempts > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">
            Попыток: {attempts}
          </span>
        )}
      </div>

      {/* Code Editor */}
      <CodeEditor value={code} onChange={setCode} readOnly={isRunning} />

      {/* Output */}
      <OutputPanel
        output={output}
        error={error}
        timedOut={timedOut}
        passed={passed}
        isRunning={isRunning}
      />

      {/* Expected Output (for reference) */}
      <div className="rounded-lg border border-border bg-card p-3">
        <p className="text-xs font-medium text-muted-foreground mb-1">Ожидаемый вывод:</p>
        <pre className="text-sm text-foreground/70 whitespace-pre-wrap font-mono">{expectedOutput}</pre>
      </div>

      {/* Hints */}
      <HintsAccordion hints={hints} />
    </div>
  )
}
