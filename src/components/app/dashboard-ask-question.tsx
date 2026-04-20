"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
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
    <div className="pb-36">
      <div className="space-y-3 text-sm">
        {messages.map((message) => (
          <p key={message.id}>
            <span className="font-medium">
              {message.role === "user"
                ? t("dashboard.ask.you", "You")
                : t("dashboard.ask.assistant", "Assistant")}
              :
            </span>{" "}
            {message.content}
            {message.role === "assistant" && message.sources && message.sources.length > 0 ? (
              <span className="mt-1 block text-xs text-muted-foreground">
                {message.sources.map((source) => (
                  <span key={`${message.id}-${source.file_name}-${source.document_type}`} className="block">
                    {`Källa: ${source.file_name} (${Math.round(source.similarity * 100)}% match)`}
                  </span>
                ))}
              </span>
            ) : null}
          </p>
        ))}
      </div>

      <div className="fixed inset-x-4 bottom-4 z-50 mx-auto w-[min(900px,calc(100vw-2rem))] rounded-lg border bg-background p-3 shadow-lg">
        <div className="flex items-end gap-2">
          <Textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={t("dashboard.ask.placeholder", "Ask something...")}
            className="min-h-12 border"
          />
          <Button
            onClick={() => {
              void submitQuestion()
            }}
            disabled={loading || question.trim().length === 0}
          >
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t("dashboard.ask.sending", "Sending...")}
              </>
            ) : (
              t("dashboard.ask.send", "Send")
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
