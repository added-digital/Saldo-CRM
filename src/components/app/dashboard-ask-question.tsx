"use client"

import * as React from "react"
import { Check, ChevronDown, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

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
  openai_sql_response?: string
  sql_candidate?: string
  [key: string]: unknown
}

type PickerProps = {
  title: string
  placeholder: string
  searchPlaceholder: string
  options: PickerOption[]
  value: string | null
  onChange: (value: string | null) => void
  allLabel: string
}

function Picker({
  title,
  placeholder,
  searchPlaceholder,
  options,
  value,
  onChange,
  allLabel,
}: PickerProps) {
  const [open, setOpen] = React.useState(false)
  const selected = options.find((option) => option.id === value) ?? null

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{title}</p>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-full justify-between">
            <span className="truncate text-left">{selected?.label ?? placeholder}</span>
            <ChevronDown className="size-4 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandItem
                value={allLabel}
                onSelect={() => {
                  onChange(null)
                  setOpen(false)
                }}
              >
                <Check className={cn("size-4", value === null ? "opacity-100" : "opacity-0")} />
                <span>{allLabel}</span>
              </CommandItem>
              <CommandEmpty>No options found.</CommandEmpty>
              {options.map((option) => (
                <CommandItem
                  key={option.id}
                  value={`${option.label} ${option.subLabel ?? ""}`}
                  onSelect={() => {
                    onChange(option.id)
                    setOpen(false)
                  }}
                >
                  <Check className={cn("size-4", value === option.id ? "opacity-100" : "opacity-0")} />
                  <div className="min-w-0">
                    <p className="truncate">{option.label}</p>
                    {option.subLabel ? <p className="truncate text-xs text-muted-foreground">{option.subLabel}</p> : null}
                  </div>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}

export function DashboardAskQuestion({ customers, users }: AskQuestionProps) {
  const [selectedCustomerId, setSelectedCustomerId] = React.useState<string | null>(null)
  const [selectedUserId, setSelectedUserId] = React.useState<string | null>(null)
  const [question, setQuestion] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [result, setResult] = React.useState<AskQuestionResponse | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [errorPayload, setErrorPayload] = React.useState<string | null>(null)

  async function submitQuestion() {
    const trimmedQuestion = question.trim()
    if (!trimmedQuestion) return

    setLoading(true)
    setError(null)
    setErrorPayload(null)

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
        setResult(null)
        setError("error" in data ? (data.error ?? "Failed to ask question") : "Failed to ask question")
        setErrorPayload(JSON.stringify(data, null, 2))
        return
      }

      setResult(data as AskQuestionResponse)
    } catch {
      setResult(null)
      setError("Failed to ask question")
      setErrorPayload(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Picker
          title="Customer"
          placeholder="All customers"
          searchPlaceholder="Search customers..."
          options={customers}
          value={selectedCustomerId}
          onChange={setSelectedCustomerId}
          allLabel="All customers"
        />
        <Picker
          title="User"
          placeholder="All users"
          searchPlaceholder="Search users..."
          options={users}
          value={selectedUserId}
          onChange={setSelectedUserId}
          allLabel="All users"
        />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Ask a question</p>
        <Textarea
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Example: Which active customers have the highest total hours this year?"
          className="min-h-28"
        />
      </div>

      <div className="flex justify-end">
        <Button onClick={submitQuestion} disabled={loading || question.trim().length === 0}>
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Asking...
            </>
          ) : (
            "Ask"
          )}
        </Button>
      </div>

      {error ? (
        <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
          <p className="text-sm text-destructive">{error}</p>
          {errorPayload ? (
            <pre className="max-h-72 overflow-auto rounded-md bg-background p-3 text-xs text-foreground">
              {errorPayload}
            </pre>
          ) : null}
        </div>
      ) : null}

      {result ? (
        <div className="space-y-3 rounded-md border p-4">
          <div>
            <p className="text-xs uppercase text-muted-foreground">Answer</p>
            <p className="text-sm">{result.answer}</p>
          </div>

          <div>
            <p className="text-xs uppercase text-muted-foreground">Generated SQL</p>
            <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{result.sql}</pre>
          </div>

          {result.openai_sql_response ? (
            <div>
              <p className="text-xs uppercase text-muted-foreground">OpenAI SQL response</p>
              <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{result.openai_sql_response}</pre>
            </div>
          ) : null}

          <div>
            <p className="text-xs uppercase text-muted-foreground">Rows ({result.rows.length})</p>
            <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">
              {JSON.stringify(result.rows, null, 2)}
            </pre>
          </div>
        </div>
      ) : null}
    </div>
  )
}
