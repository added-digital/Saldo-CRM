"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

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
  sql: string
  openai_sql_response?: string
  rows: Array<Record<string, unknown>>
}

type AskQuestionErrorResponse = {
  error?: string
  [key: string]: unknown
}

type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
}

export function DashboardAskQuestion({ customers, users }: AskQuestionProps) {
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
        content: "Thinking...",
      },
    ])
    setQuestion("")
    setLoading(true)

    try {
      const response = await fetch("/api/questions/ask-sql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: trimmedQuestion,
          customer_id: selectedCustomerId,
          user_id: selectedUserId,
        }),
      })

      const data = (await response.json()) as AskQuestionResponse | AskQuestionErrorResponse
      if (!response.ok) {
        const message = "error" in data ? (data.error ?? "Failed to ask question") : "Failed to ask question"
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
                content: "Failed to ask question",
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
            <span className="font-medium">{message.role === "user" ? "You" : "Assistant"}:</span>{" "}
            {message.content}
          </p>
        ))}
      </div>

      <div className="fixed inset-x-4 bottom-4 z-50 mx-auto w-[min(900px,calc(100vw-2rem))] rounded-lg border bg-background p-3 shadow-lg">
        <div className="flex items-end gap-2">
          <Textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ask something..."
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
                Sending...
              </>
            ) : (
              "Send"
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
