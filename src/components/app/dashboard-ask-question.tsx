"use client"

import * as React from "react"
import Image from "next/image"
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
      <div
        className={cn(
          "mx-auto flex h-full w-full max-w-5xl flex-col px-4 md:px-6",
          hasMessages ? "pt-6" : "justify-center"
        )}
      >
        <div
          className={cn(
            "mx-auto flex max-w-2xl flex-col items-center text-center transition-all duration-500",
            hasMessages
              ? "max-h-0 -translate-y-3 overflow-hidden opacity-0"
              : "max-h-[26rem] translate-y-0 opacity-100"
          )}
        >
          <Image
            src="/brand/logo.svg"
            alt="Saldo"
            width={160}
            height={40}
            className="h-10 w-auto"
            priority
          />
          <h1 className="mt-8 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            What can we help you with today?
          </h1>
          <p className="mt-3 text-sm text-muted-foreground md:text-base">
            Ask questions about our services, packages and how we can help your business
          </p>
        </div>

        <div
          className={cn(
            "flex-1 overflow-y-auto pr-1 transition-all duration-500",
            hasMessages ? "mt-0 translate-y-0 opacity-100" : "pointer-events-none mt-4 translate-y-4 opacity-0"
          )}
        >
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 pb-36 pt-2">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex w-full",
                  message.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {message.role === "user" ? (
                  <div className="max-w-[85%] rounded-2xl bg-foreground px-4 py-3 text-sm text-background md:max-w-[70%]">
                    {message.content}
                  </div>
                ) : (
                  <div className="max-w-[90%] md:max-w-[78%]">
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {t("dashboard.ask.assistant", "Assistant")}
                    </p>
                    <p className="text-sm leading-relaxed text-foreground">
                      {message.content}
                    </p>
                    {message.sources && message.sources.length > 0 ? (
                      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                        {message.sources.map((source) => (
                          <p key={`${message.id}-${source.file_name}-${source.document_type}`}>
                            {`Källa: ${source.file_name} (${Math.round(source.similarity * 100)}% match)`}
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div
        className={cn(
          "absolute left-1/2 z-20 w-[min(700px,calc(100%-2rem))] -translate-x-1/2 transition-all duration-500",
          hasMessages ? "bottom-6" : "top-1/2 mt-28"
        )}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void submitQuestion()
          }}
          className={cn(
            "rounded-2xl border bg-background p-2 shadow-sm transition-all duration-500",
            hasMessages ? "mx-auto max-w-[700px]" : "mx-auto max-w-[600px]"
          )}
        >
          <div className="relative">
            <Input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask about our services..."
              className="h-12 rounded-xl border-0 bg-transparent pr-12 text-sm shadow-none focus-visible:ring-0"
            />
            <button
              type="submit"
              className={cn(
                "absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full border transition-colors",
                loading || question.trim().length === 0
                  ? "cursor-not-allowed border-muted-foreground/30 text-muted-foreground/50"
                  : "border-border text-foreground hover:bg-muted"
              )}
              disabled={loading || question.trim().length === 0}
              aria-label={t("dashboard.ask.send", "Send")}
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
