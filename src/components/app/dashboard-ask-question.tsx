"use client"

import * as React from "react"
import { ArrowUp, Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { useTranslation } from "@/hooks/use-translation"

type PickerOption = {
  id: string
  label: string
  subLabel?: string
}

type AskQuestionProps = {
  customers: PickerOption[]
  users: PickerOption[]
}

type AskQuestionResponse = {
  answer: string
  sources: Array<{ file_name: string; document_type: string; similarity: number }>
}

type AskQuestionErrorResponse = {
  error?: string
  [key: string]: unknown
}

type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  sources?: Array<{ file_name: string; document_type: string; similarity: number }>
}

export function DashboardAskQuestion({ customers, users }: AskQuestionProps) {
  const { t } = useTranslation()
  const [selectedCustomerId] = React.useState<string | null>(customers[0]?.id ?? null)
  const [selectedUserId] = React.useState<string | null>(users[0]?.id ?? null)
  const [question, setQuestion] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [messages, setMessages] = React.useState<ChatMessage[]>([])
  const hasMessages = messages.length > 0

  void selectedCustomerId
  void selectedUserId

  async function submitQuestion() {
    const trimmedQuestion = question.trim()
    if (!trimmedQuestion) return

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmedQuestion,
    }
    const assistantMessageId = crypto.randomUUID()

    setMessages((prev) => [
      ...prev,
      userMessage,
        {
          id: assistantMessageId,
          role: "assistant",
          content: t("dashboard.ask.thinking", "Thinking..."),
        },
      ])
    setQuestion("")
    setLoading(true)

    try {
      const response = await fetch("/api/questions/ask-documents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: trimmedQuestion,
        }),
      })

      const data = (await response.json()) as AskQuestionResponse | AskQuestionErrorResponse
      if (!response.ok) {
        const message =
          "error" in data
            ? (data.error ?? t("dashboard.ask.failed", "Failed to ask question"))
            : t("dashboard.ask.failed", "Failed to ask question")
        setMessages((prev) =>
          prev.map((item) =>
            item.id === assistantMessageId
              ? {
                  ...item,
                  content: message,
                }
              : item
          )
        )
        return
      }

      const successPayload = data as AskQuestionResponse
      setMessages((prev) =>
        prev.map((item) =>
          item.id === assistantMessageId
            ? {
                ...item,
                content: successPayload.answer,
                sources: successPayload.sources,
              }
            : item
        )
      )
    } catch {
      setMessages((prev) =>
        prev.map((item) =>
          item.id === assistantMessageId
            ? {
                ...item,
                content: t("dashboard.ask.failed", "Failed to ask question"),
              }
            : item
        )
      )
    } finally {
      setLoading(false)
    }
  }

  return (
  <div className="relative h-full overflow-hidden bg-background">
    {/* Messages - only visible when chat has started */}
    <div className={cn(
      "h-full overflow-y-auto transition-all duration-500",
      hasMessages ? "opacity-100" : "pointer-events-none opacity-0"
    )}>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 pb-36 pt-6">
        {messages.map((message) => (
          <div key={message.id} className={cn("flex w-full", message.role === "user" ? "justify-end" : "justify-start")}>
            {message.role === "user" ? (
              <div className="max-w-[85%] rounded-2xl bg-foreground px-4 py-3 text-sm text-background md:max-w-[70%]">
                {message.content}
              </div>
            ) : (
              <div className="max-w-[90%] md:max-w-[78%]">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Assistant</p>
                <p className="text-sm leading-relaxed text-foreground">{message.content}</p>
                {message.sources && message.sources.length > 0 && (
                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {message.sources.map((source) => (
                      <p key={`${message.id}-${source.file_name}`}>
                        {`Källa: ${source.file_name} (${Math.round(source.similarity * 100)}% match)`}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>

    {/* Centered hero — only visible before first message */}
    {!hasMessages && (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-4">
        <div className="text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            What can I help you with today?
          </h1>
          <p className="mt-3 text-sm text-muted-foreground md:text-base">
            Ask anything about our services, packages and how they fit your clients.
          </p>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); void submitQuestion() }}
          className="w-full max-w-[600px] rounded-2xl border bg-background p-2 shadow-sm"
        >
          <div className="relative">
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask about our services..."
              className="h-12 rounded-xl border-0 bg-transparent pr-12 text-sm shadow-none focus-visible:ring-0"
            />
            <button
              type="submit"
              disabled={loading || question.trim().length === 0}
              className={cn(
                "absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full border transition-colors",
                loading || question.trim().length === 0
                  ? "cursor-not-allowed border-muted-foreground/30 text-muted-foreground/50"
                  : "border-border text-foreground hover:bg-muted"
              )}
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
            </button>
          </div>
        </form>
      </div>
    )}

    {/* Bottom input — only visible after first message */}
    {hasMessages && (
      <div className="absolute bottom-6 left-1/2 z-20 w-[min(700px,calc(100%-2rem))] -translate-x-1/2">
        <form
          onSubmit={(e) => { e.preventDefault(); void submitQuestion() }}
          className="rounded-2xl border bg-background p-2 shadow-sm"
        >
          <div className="relative">
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask about our services..."
              className="h-12 rounded-xl border-0 bg-transparent pr-12 text-sm shadow-none focus-visible:ring-0"
            />
            <button
              type="submit"
              disabled={loading || question.trim().length === 0}
              className={cn(
                "absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full border transition-colors",
                loading || question.trim().length === 0
                  ? "cursor-not-allowed border-muted-foreground/30 text-muted-foreground/50"
                  : "border-border text-foreground hover:bg-muted"
              )}
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
            </button>
          </div>
        </form>
      </div>
    )}
  </div>
)
}