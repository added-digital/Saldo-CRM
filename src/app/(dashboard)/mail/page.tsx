"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import { Check, ChevronDown, ChevronLeft, ChevronRight, Loader2, Search, Send, X } from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useTranslation } from "@/hooks/use-translation"
import { useUser } from "@/hooks/use-user"
import type { CustomerContact, MailTemplate, Segment } from "@/types/database"
import { toast } from "sonner"

type MailTemplateType = "plain" | "plain_os" | "default"

type MailRecipientCustomer = {
  id: string
  name: string
  fortnox_customer_number: string | null
  status: string | null
  fortnox_cost_center: string | null
  email: string | null
  primaryContactName: string | null
  segmentIds: string[]
}

type CustomerOptionWithStatus = {
  id: string
  name: string
  fortnox_customer_number: string | null
  status: string | null
}

type MailRecipientContact = CustomerContact & {
  primaryCustomers: CustomerOptionWithStatus[]
  customers: CustomerOptionWithStatus[]
  segmentIds: string[]
}

type RecipientSegment = Pick<Segment, "id" | "name" | "color">
type RecipientType = "customers" | "contacts"

type ResolvedRecipient = {
  id: string
  type: RecipientType
  name: string
  email: string | null
  customerName: string
  companyName: string
}

type PlainForm = {
  subject: string
  body: string
}

type PlainOsForm = {
  subject: string
  title: string
  previewText: string
  greeting: string
  paragraphs: string
  ctaLabel: string
  ctaUrl: string
  footnote: string
  brandName: string
}

const SELECTED_RECIPIENT_PREVIEW_LIMIT = 8

function toParagraphs(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

function defaultPlainForm(t: (key: string, fallback?: string) => string): PlainForm {
  return {
    subject: t("mail.send.defaults.plainSubject", "Message from Saldo"),
    body: "",
  }
}

function defaultPlainOsForm(t: (key: string, fallback?: string) => string): PlainOsForm {
  return {
    subject: "",
    title: t("settings.mail.defaults.title", "Hello, @customer"),
    previewText: t("settings.mail.defaults.previewText", "Quick update from Saldo"),
    greeting: "",
    paragraphs: t(
      "settings.mail.defaults.paragraphs",
      "This is a preview of your custom email content.",
    ),
    ctaLabel: t("settings.mail.defaults.ctaLabel", "Call to action"),
    ctaUrl: process.env.NEXT_PUBLIC_APP_URL || "",
    footnote: "",
    brandName: "Saldo Redovisning",
  }
}

function parseTemplatePayload(payload: Record<string, unknown> | null): {
  plain: Partial<PlainForm>
  plainOs: Partial<PlainOsForm>
} {
  const source = payload ?? {}
  return {
    plain: {
      subject: typeof source.subject === "string" ? source.subject : undefined,
      body: typeof source.body === "string" ? source.body : undefined,
    },
    plainOs: {
      subject: typeof source.subject === "string" ? source.subject : undefined,
      title: typeof source.title === "string" ? source.title : undefined,
      previewText: typeof source.previewText === "string" ? source.previewText : undefined,
      greeting: typeof source.greeting === "string" ? source.greeting : undefined,
      paragraphs: Array.isArray(source.paragraphs)
        ? source.paragraphs.filter((entry): entry is string => typeof entry === "string").join("\n")
        : typeof source.paragraphs === "string"
          ? source.paragraphs
          : undefined,
      ctaLabel: typeof source.ctaLabel === "string" ? source.ctaLabel : undefined,
      ctaUrl: typeof source.ctaUrl === "string" ? source.ctaUrl : undefined,
      footnote: typeof source.footnote === "string" ? source.footnote : undefined,
      brandName: typeof source.brandName === "string" ? source.brandName : undefined,
    },
  }
}

function replaceTemplateTokens(
  value: string,
  customerName: string,
  companyName: string,
): string {
  return value
    .replace(/@customer/gi, customerName)
    .replace(/@company|@compay/gi, companyName)
}

function personalizePayload(
  payload: Record<string, unknown>,
  templateType: MailTemplateType,
  customerName: string,
  companyName: string,
): Record<string, unknown> {
  if (templateType === "plain") {
    return {
      subject: replaceTemplateTokens(String(payload.subject ?? ""), customerName, companyName),
      body: replaceTemplateTokens(String(payload.body ?? ""), customerName, companyName),
    }
  }

  const paragraphsSource = Array.isArray(payload.paragraphs)
    ? payload.paragraphs.filter((entry): entry is string => typeof entry === "string")
    : []

  return {
    subject: replaceTemplateTokens(String(payload.subject ?? ""), customerName, companyName),
    title: replaceTemplateTokens(String(payload.title ?? ""), customerName, companyName),
    previewText: replaceTemplateTokens(String(payload.previewText ?? ""), customerName, companyName),
    greeting: replaceTemplateTokens(String(payload.greeting ?? ""), customerName, companyName),
    paragraphs: paragraphsSource.map((paragraph) =>
      replaceTemplateTokens(paragraph, customerName, companyName),
    ),
    ctaLabel: replaceTemplateTokens(String(payload.ctaLabel ?? ""), customerName, companyName),
    ctaUrl: replaceTemplateTokens(String(payload.ctaUrl ?? ""), customerName, companyName),
    footnote: replaceTemplateTokens(String(payload.footnote ?? ""), customerName, companyName),
    brandName: replaceTemplateTokens(String(payload.brandName ?? ""), customerName, companyName),
  }
}

function includesSearch(haystack: string, query: string): boolean {
  if (!query) return true
  return haystack.toLowerCase().includes(query.toLowerCase())
}

function isActiveCustomer(status: string | null): boolean {
  return !status || status.toLowerCase() === "active"
}

function isArchivedCustomer(status: string | null): boolean {
  return status?.toLowerCase() === "archived"
}

function isActiveContact(contact: MailRecipientContact): boolean {
  const relatedCustomers = [...contact.primaryCustomers, ...contact.customers]
  if (relatedCustomers.length === 0) {
    return true
  }

  return relatedCustomers.some((customer) => !isArchivedCustomer(customer.status))
}

export default function MailPage() {
  const { t } = useTranslation()
  const { user } = useUser()
  const searchParams = useSearchParams()
  const [customerOptions, setCustomerOptions] = React.useState<MailRecipientCustomer[]>([])
  const [contactOptions, setContactOptions] = React.useState<MailRecipientContact[]>([])
  const [segmentOptions, setSegmentOptions] = React.useState<RecipientSegment[]>([])
  const [selectedCustomerIds, setSelectedCustomerIds] = React.useState<string[]>([])
  const [selectedContactIds, setSelectedContactIds] = React.useState<string[]>([])
  const [recipientType, setRecipientType] = React.useState<RecipientType>("customers")
  const [recipientSearch, setRecipientSearch] = React.useState("")
  const [selectedSegmentIds, setSelectedSegmentIds] = React.useState<string[]>([])
  const [recipientPickerOpen, setRecipientPickerOpen] = React.useState(false)
  const [showAllSelectedRecipients, setShowAllSelectedRecipients] = React.useState(false)
  const [selectedTemplateValue, setSelectedTemplateValue] = React.useState<string>("default")
  const [templateType, setTemplateType] = React.useState<MailTemplateType>("default")
  const [plainForm, setPlainForm] = React.useState<PlainForm>(() => defaultPlainForm(t))
  const [plainOsForm, setPlainOsForm] = React.useState<PlainOsForm>(() => defaultPlainOsForm(t))
  const [templates, setTemplates] = React.useState<MailTemplate[]>([])
  const [previewHtml, setPreviewHtml] = React.useState("")
  const [previewLoading, setPreviewLoading] = React.useState(false)
  const [sending, setSending] = React.useState(false)
  const [previewCustomerIndex, setPreviewCustomerIndex] = React.useState(0)
  const hasAutoSelectedMyCustomersRef = React.useRef(false)

  const selectedSavedTemplate = React.useMemo(
    () =>
      selectedTemplateValue === "plain" || selectedTemplateValue === "plain_os"
        || selectedTemplateValue === "default"
        ? null
        : templates.find((template) => template.id === selectedTemplateValue) ?? null,
    [selectedTemplateValue, templates],
  )

  const hasRecipientSearchParams = React.useMemo(
    () => Boolean(searchParams.get("customerIds") || searchParams.get("contactIds")),
    [searchParams],
  )

  const selectedCustomers = React.useMemo(() => {
    const byId = new Map(customerOptions.map((customer) => [customer.id, customer]))
    return selectedCustomerIds
      .map((id) => byId.get(id))
      .filter((customer): customer is MailRecipientCustomer => Boolean(customer))
      .filter((customer) => isActiveCustomer(customer.status))
  }, [customerOptions, selectedCustomerIds])

  const selectedContacts = React.useMemo(() => {
    const byId = new Map(contactOptions.map((contact) => [contact.id, contact]))
    return selectedContactIds
      .map((id) => byId.get(id))
      .filter((contact): contact is MailRecipientContact => Boolean(contact))
      .filter((contact) => isActiveContact(contact))
  }, [contactOptions, selectedContactIds])

  const selectedRecipients = React.useMemo<ResolvedRecipient[]>(() => {
    const customerRecipients = selectedCustomers.map((customer) => ({
      id: customer.id,
      type: "customers" as const,
      name: customer.name,
      email: customer.email,
      customerName: customer.primaryContactName?.trim() || customer.name,
      companyName: customer.name || t("mail.send.fallbackCompany", "Company"),
    }))

    const contactRecipients = selectedContacts.map((contact) => {
      const primaryCompany = contact.primaryCustomers[0]?.name
      const relatedCompany = contact.customers[0]?.name
      return {
        id: contact.id,
        type: "contacts" as const,
        name: contact.name,
        email: contact.email,
        customerName: contact.name || primaryCompany || relatedCompany || t("mail.send.fallbackCompany", "Company"),
        companyName: primaryCompany || relatedCompany || t("mail.send.fallbackCompany", "Company"),
      }
    })

    return [...customerRecipients, ...contactRecipients]
  }, [selectedContacts, selectedCustomers, t])

  const visibleSelectedRecipients = React.useMemo(
    () =>
      showAllSelectedRecipients
        ? selectedRecipients
        : selectedRecipients.slice(0, SELECTED_RECIPIENT_PREVIEW_LIMIT),
    [selectedRecipients, showAllSelectedRecipients],
  )

  const hiddenSelectedRecipientCount = Math.max(
    0,
    selectedRecipients.length - SELECTED_RECIPIENT_PREVIEW_LIMIT,
  )

  React.useEffect(() => {
    setPreviewCustomerIndex((current) => {
    if (selectedRecipients.length === 0) return 0
    return Math.min(current, selectedRecipients.length - 1)
  })
  }, [selectedRecipients])

  React.useEffect(() => {
    const customerIdsParam = searchParams.get("customerIds")
    const contactIdsParam = searchParams.get("contactIds")

    if (!customerIdsParam && !contactIdsParam) return

    if (customerIdsParam) {
      const ids = customerIdsParam
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id.length > 0)

      if (ids.length > 0) {
        setSelectedCustomerIds(ids)
        setRecipientType("customers")
      }
    }

    if (contactIdsParam) {
      const ids = contactIdsParam
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id.length > 0)

      if (ids.length > 0) {
        setSelectedContactIds(ids)
        if (!customerIdsParam) {
          setRecipientType("contacts")
        }
      }
    }
  }, [searchParams])

  React.useEffect(() => {
    async function loadRecipients() {
      const supabase = createClient()

      const PAGE_SIZE = 1000
      const contactsPromise = fetch("/api/contacts", { cache: "no-store" })

      const customerData: Array<{
        id: string
        name: string
        fortnox_customer_number: string | null
        status: string | null
        fortnox_cost_center: string | null
        email: string | null
        contact_name: string | null
      }> = []

      let customerOffset = 0
      while (true) {
        const { data } = await supabase
          .from("customers")
          .select("id, name, fortnox_customer_number, status, fortnox_cost_center, email, contact_name")
          .order("name", { ascending: true })
          .range(customerOffset, customerOffset + PAGE_SIZE - 1)

        if (!data || data.length === 0) {
          break
        }

        customerData.push(
          ...(data as Array<{
            id: string
            name: string
            fortnox_customer_number: string | null
            status: string | null
            fortnox_cost_center: string | null
            email: string | null
            contact_name: string | null
          }>),
        )

        if (data.length < PAGE_SIZE) {
          break
        }

        customerOffset += PAGE_SIZE
      }

      const customerSegmentRows: Array<{
        customer_id: string
        segment: RecipientSegment | null
      }> = []

      let customerSegmentOffset = 0
      while (true) {
        const { data } = await supabase
          .from("customer_segments")
          .select("customer_id, segment:segments(id, name, color)")
          .order("customer_id", { ascending: true })
          .range(customerSegmentOffset, customerSegmentOffset + PAGE_SIZE - 1)

        if (!data || data.length === 0) {
          break
        }

        customerSegmentRows.push(
          ...(data as Array<{
            customer_id: string
            segment: RecipientSegment | null
          }>),
        )

        if (data.length < PAGE_SIZE) {
          break
        }

        customerSegmentOffset += PAGE_SIZE
      }

      const contactsResponse = await contactsPromise

      const customerSegmentsMap = new Map<string, string[]>()
      const segmentMap = new Map<string, RecipientSegment>()

      for (const row of customerSegmentRows) {
        if (!row.segment) continue
        segmentMap.set(row.segment.id, row.segment)
        const existing = customerSegmentsMap.get(row.customer_id) ?? []
        customerSegmentsMap.set(row.customer_id, [...existing, row.segment.id])
      }

      const customers = customerData.map((customer) => ({
          id: customer.id,
          name: customer.name,
          fortnox_customer_number: customer.fortnox_customer_number,
          status: customer.status,
          fortnox_cost_center: customer.fortnox_cost_center,
          email: customer.email,
          primaryContactName: customer.contact_name,
          segmentIds: customerSegmentsMap.get(customer.id) ?? [],
        }))

      setCustomerOptions(customers)
      setSegmentOptions(
        Array.from(segmentMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
      )

      const contactsPayload = (await contactsResponse.json().catch(() => null)) as {
        contacts?: Array<
          CustomerContact & {
            primaryCustomers: CustomerOptionWithStatus[]
            customers: CustomerOptionWithStatus[]
          }
        >
      } | null

      const contacts = (contactsPayload?.contacts ?? []).map((contact) => {
        const relatedCustomerIds = [
          ...contact.primaryCustomers.map((customer) => customer.id),
          ...contact.customers.map((customer) => customer.id),
        ]
        const segmentIds = Array.from(
          new Set(relatedCustomerIds.flatMap((customerId) => customerSegmentsMap.get(customerId) ?? [])),
        )

        return {
          ...contact,
          segmentIds,
        }
      })

      setContactOptions(contacts)
    }

    void loadRecipients()
  }, [])

  const filteredCustomerOptions = React.useMemo(() => {
    return customerOptions.filter((customer) => {
      if (!isActiveCustomer(customer.status)) {
        return false
      }

      if (
        selectedSegmentIds.length > 0 &&
        !selectedSegmentIds.some((segmentId) => customer.segmentIds.includes(segmentId))
      ) {
        return false
      }

      const segmentNames = customer.segmentIds
        .map((segmentId) => segmentOptions.find((segment) => segment.id === segmentId)?.name ?? "")
        .join(" ")

      const searchableText = [
        customer.name,
        customer.email ?? "",
        customer.fortnox_customer_number ?? "",
        segmentNames,
      ].join(" ")

      return includesSearch(searchableText, recipientSearch)
    })
  }, [customerOptions, recipientSearch, segmentOptions, selectedSegmentIds])

  const filteredContactOptions = React.useMemo(() => {
    return contactOptions.filter((contact) => {
      if (!isActiveContact(contact)) {
        return false
      }

      if (
        selectedSegmentIds.length > 0 &&
        !selectedSegmentIds.some((segmentId) => contact.segmentIds.includes(segmentId))
      ) {
        return false
      }

      const linkedCustomers = [
        ...contact.primaryCustomers.map((customer) => customer.name),
        ...contact.customers.map((customer) => customer.name),
      ].join(" ")

      const segmentNames = contact.segmentIds
        .map((segmentId) => segmentOptions.find((segment) => segment.id === segmentId)?.name ?? "")
        .join(" ")

      const searchableText = [
        contact.name,
        contact.email ?? "",
        contact.phone ?? "",
        linkedCustomers,
        segmentNames,
      ].join(" ")

      return includesSearch(searchableText, recipientSearch)
    })
  }, [contactOptions, recipientSearch, segmentOptions, selectedSegmentIds])

  const myCustomerIds = React.useMemo(() => {
    if (!user.fortnox_cost_center) return []

    return customerOptions
      .filter(
        (customer) =>
          isActiveCustomer(customer.status) &&
          customer.fortnox_cost_center === user.fortnox_cost_center,
      )
      .map((customer) => customer.id)
  }, [customerOptions, user.fortnox_cost_center])

  const myCustomerIdSet = React.useMemo(() => new Set(myCustomerIds), [myCustomerIds])

  const myContactIds = React.useMemo(() => {
    if (myCustomerIdSet.size === 0) return []

    return contactOptions
      .filter((contact) => {
        const linkedCustomerIds = [
          ...contact.primaryCustomers.map((customer) => customer.id),
          ...contact.customers.map((customer) => customer.id),
        ]

        return linkedCustomerIds.some((customerId) => myCustomerIdSet.has(customerId))
      })
      .map((contact) => contact.id)
  }, [contactOptions, myCustomerIdSet])

  const activeFilteredOptions = React.useMemo(
    () => (recipientType === "customers" ? filteredCustomerOptions : filteredContactOptions),
    [filteredContactOptions, filteredCustomerOptions, recipientType],
  )

  const activeSelectedIds = recipientType === "customers" ? selectedCustomerIds : selectedContactIds
  const myRecipientIds = recipientType === "customers" ? myCustomerIds : myContactIds

  const allMyRecipientsSelected = React.useMemo(() => {
    if (myRecipientIds.length === 0) return false
    return myRecipientIds.every((id) => activeSelectedIds.includes(id))
  }, [activeSelectedIds, myRecipientIds])

  React.useEffect(() => {
    if (hasAutoSelectedMyCustomersRef.current) {
      return
    }

    if (hasRecipientSearchParams) {
      hasAutoSelectedMyCustomersRef.current = true
      return
    }

    if (selectedCustomerIds.length > 0 || selectedContactIds.length > 0) {
      hasAutoSelectedMyCustomersRef.current = true
      return
    }

    if (myCustomerIds.length === 0) {
      return
    }

    setSelectedCustomerIds(myCustomerIds)
    setRecipientType("customers")
    hasAutoSelectedMyCustomersRef.current = true
  }, [
    hasRecipientSearchParams,
    myCustomerIds,
    selectedContactIds.length,
    selectedCustomerIds.length,
  ])

  const allVisibleSelected = React.useMemo(() => {
    if (activeFilteredOptions.length === 0) return false
    return activeFilteredOptions.every((option) => activeSelectedIds.includes(option.id))
  }, [activeFilteredOptions, activeSelectedIds])

  function toggleSegmentFilter(segmentId: string) {
    setSelectedSegmentIds((current) =>
      current.includes(segmentId)
        ? current.filter((value) => value !== segmentId)
        : [...current, segmentId],
    )
  }

  function toggleRecipientSelection(recipientId: string) {
    if (recipientType === "customers") {
      setSelectedCustomerIds((current) =>
        current.includes(recipientId)
          ? current.filter((id) => id !== recipientId)
          : [...current, recipientId],
      )
      return
    }

    setSelectedContactIds((current) =>
      current.includes(recipientId)
        ? current.filter((id) => id !== recipientId)
        : [...current, recipientId],
    )
  }

  function toggleSelectAllVisible() {
    const visibleIds = activeFilteredOptions.map((option) => option.id)
    if (recipientType === "customers") {
      setSelectedCustomerIds((current) => {
        if (allVisibleSelected) {
          return current.filter((id) => !visibleIds.includes(id))
        }

        return Array.from(new Set([...current, ...visibleIds]))
      })
      return
    }

    setSelectedContactIds((current) => {
      if (allVisibleSelected) {
        return current.filter((id) => !visibleIds.includes(id))
      }

      return Array.from(new Set([...current, ...visibleIds]))
    })
  }

  function toggleSelectMyRecipients() {
    if (myRecipientIds.length === 0) return

    if (recipientType === "customers") {
      setSelectedCustomerIds((current) => {
        if (allMyRecipientsSelected) {
          return current.filter((id) => !myRecipientIds.includes(id))
        }

        return Array.from(new Set([...current, ...myRecipientIds]))
      })
      return
    }

    setSelectedContactIds((current) => {
      if (allMyRecipientsSelected) {
        return current.filter((id) => !myRecipientIds.includes(id))
      }

      return Array.from(new Set([...current, ...myRecipientIds]))
    })
  }

  function removeSelectedRecipient(recipientId: string, type: RecipientType) {
    if (type === "customers") {
      setSelectedCustomerIds((current) => current.filter((id) => id !== recipientId))
      return
    }
    setSelectedContactIds((current) => current.filter((id) => id !== recipientId))
  }

  React.useEffect(() => {
    async function loadTemplates() {
      const supabase = createClient()
      const { data } = await supabase
        .from("mail_templates")
        .select("id, name, template_type, payload, is_active, created_by, created_at, updated_at")
        .eq("is_active", true)
        .order("updated_at", { ascending: false })

      setTemplates((data ?? []) as MailTemplate[])
    }

    void loadTemplates()
  }, [])

  React.useEffect(() => {
    setPlainForm(defaultPlainForm(t))
    setPlainOsForm(defaultPlainOsForm(t))

    if (selectedTemplateValue === "plain") {
      setTemplateType("plain")
      return
    }
    if (selectedTemplateValue === "plain_os") {
      setTemplateType("plain_os")
      return
    }
    if (selectedTemplateValue === "default") {
      setTemplateType("default")
      return
    }

    const selected = templates.find((template) => template.id === selectedTemplateValue)
    if (!selected) return

    setTemplateType(selected.template_type)
  }, [selectedTemplateValue, t, templates])

  const plainPayload = React.useMemo(
    () => ({
      subject: plainForm.subject,
      body: plainForm.body,
    }),
    [plainForm],
  )

  const plainOsPayload = React.useMemo(
    () => ({
      subject: plainOsForm.subject,
      title: plainOsForm.title,
      previewText: plainOsForm.previewText,
      greeting: plainOsForm.greeting,
      paragraphs: toParagraphs(plainOsForm.paragraphs),
      ctaLabel: plainOsForm.ctaLabel,
      ctaUrl: plainOsForm.ctaUrl,
      footnote: plainOsForm.footnote,
      brandName: plainOsForm.brandName,
    }),
    [plainOsForm],
  )

  const activePayload = React.useMemo(() => {
    if (selectedSavedTemplate) {
      const parsed = parseTemplatePayload(selectedSavedTemplate.payload)
      if (selectedSavedTemplate.template_type === "plain") {
        return {
          subject: parsed.plain.subject ?? "",
          body: parsed.plain.body ?? "",
        }
      }

      return {
        subject: parsed.plainOs.subject ?? "",
        title: parsed.plainOs.title ?? "",
        previewText: parsed.plainOs.previewText ?? "",
        greeting: parsed.plainOs.greeting ?? "",
        paragraphs: toParagraphs(parsed.plainOs.paragraphs ?? ""),
        ctaLabel: parsed.plainOs.ctaLabel ?? "",
        ctaUrl: parsed.plainOs.ctaUrl ?? "",
        footnote: parsed.plainOs.footnote ?? "",
        brandName: parsed.plainOs.brandName ?? "",
      }
    }

    return templateType === "plain" ? plainPayload : plainOsPayload
  }, [plainOsPayload, plainPayload, selectedSavedTemplate, templateType])

  React.useEffect(() => {
    const abortController = new AbortController()
    const timeout = window.setTimeout(async () => {
      setPreviewLoading(true)
      try {
        const previewRecipient = selectedRecipients[previewCustomerIndex] ?? null
        const previewEmail = previewRecipient?.email?.trim() || "preview@example.com"
        const previewCustomerName =
          previewRecipient?.customerName || previewRecipient?.name || t("mail.send.fallbackCustomer", "Customer")
        const previewCompanyName =
          previewRecipient?.companyName || t("mail.send.fallbackCompany", "Company")

        const response = await fetch("/api/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: [previewEmail],
            template: templateType === "plain" ? "plain" : "content",
            mode: "preview",
            data: personalizePayload(
              activePayload,
              templateType,
              previewCustomerName,
              previewCompanyName,
            ),
          }),
          signal: abortController.signal,
        })

        const result = (await response.json()) as { html?: string }
        if (!response.ok) {
          setPreviewHtml("")
          return
        }
        setPreviewHtml(result.html ?? "")
      } catch {
        if (!abortController.signal.aborted) {
          setPreviewHtml("")
        }
      } finally {
        if (!abortController.signal.aborted) {
          setPreviewLoading(false)
        }
      }
    }, 280)

    return () => {
      abortController.abort()
      window.clearTimeout(timeout)
    }
  }, [activePayload, previewCustomerIndex, selectedRecipients, t, templateType])

  async function handleSend() {
    if (selectedRecipients.length === 0) {
      toast.error(t("mail.send.toast.customerRequired", "Select at least one recipient"))
      return
    }

    const recipients = selectedRecipients
      .map((recipient) => ({
        recipient,
        email: recipient.email?.trim() || "",
      }))
      .filter((item) => item.email.length > 0)

    if (recipients.length === 0) {
      toast.error(t("mail.send.toast.noEmails", "No selected recipients have an email"))
      return
    }

    setSending(true)
    try {
      let sentCount = 0

      for (const { recipient, email } of recipients) {
        const customerName = recipient.customerName || recipient.name || recipient.companyName
        const companyName = recipient.companyName || t("mail.send.fallbackCompany", "Company")

        const response = await fetch("/api/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: [email],
            template: templateType === "plain" ? "plain" : "content",
            mode: "send",
            deliveryMode: "separate",
            data: personalizePayload(
              activePayload,
              templateType,
              customerName,
              companyName,
            ),
          }),
        })

        const result = (await response.json()) as {
          error?: string
          message?: string
          sent_count?: number
        }

        if (!response.ok) {
          toast.error(result.message || result.error || t("settings.mail.toast.sendFailed", "Failed to send email"))
          return
        }

        sentCount += result.sent_count ?? 1
      }

      toast.success(
        `${t("settings.mail.toast.sentPrefix", "Sent")} ${sentCount} ${
          sentCount === 1
            ? t("settings.mail.toast.separateEmailSingular", "separate email")
            : t("settings.mail.toast.separateEmailPlural", "separate emails")
        }`,
      )
    } catch {
      toast.error(t("settings.mail.toast.sendFailed", "Failed to send email"))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1.05fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("mail.send.title", "Mail")}</CardTitle>
          <CardDescription>
            {t("mail.send.description", "Select template and send emails to selected recipients.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="mail-template-select">
              {t("mail.send.templateSelect", "Template")}
            </Label>
            <Select value={selectedTemplateValue} onValueChange={setSelectedTemplateValue}>
              <SelectTrigger id="mail-template-select">
                <SelectValue placeholder={t("mail.send.templateSelect", "Template")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="plain">{t("mail.send.optionPlain", "Plain")}</SelectItem>
                <SelectItem value="default">{t("mail.send.optionDefault", "Default")}</SelectItem>
                <SelectItem value="plain_os">{t("mail.send.optionPlainOs", "Plain OS")}</SelectItem>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label>{t("mail.send.recipients.title", "Recipients")}</Label>
            <Tabs value={recipientType} onValueChange={(value) => setRecipientType(value as RecipientType)}>
              <TabsList variant="line" className="w-full justify-start">
                <TabsTrigger value="customers">
                  {t("mail.send.recipients.customers", "Customers")}
                  <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1 text-xs">
                    {selectedCustomerIds.length}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="contacts">
                  {t("mail.send.recipients.contacts", "Contacts")}
                  <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1 text-xs">
                    {selectedContactIds.length}
                  </Badge>
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <Popover open={recipientPickerOpen} onOpenChange={setRecipientPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-between font-normal">
                  <span className="truncate">
                    {recipientType === "customers"
                      ? t("mail.send.recipients.chooseCustomers", "Choose customers")
                      : t("mail.send.recipients.chooseContacts", "Choose contacts")}
                  </span>
                  <ChevronDown className="size-4 text-muted-foreground" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-(--radix-popover-trigger-width) space-y-3 p-3" align="start">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={recipientSearch}
                    onChange={(event) => setRecipientSearch(event.target.value)}
                    placeholder={
                      recipientType === "customers"
                        ? t("mail.send.recipients.searchCustomers", "Search customers...")
                        : t("mail.send.recipients.searchContacts", "Search contacts...")
                    }
                    className="pl-9"
                  />
                </div>

                {segmentOptions.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      {t("mail.send.recipients.filterSegments", "Filter by segments")}
                    </p>
                    <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
                      {segmentOptions.map((segment) => {
                        const selected = selectedSegmentIds.includes(segment.id)
                        return (
                          <button
                            key={segment.id}
                            type="button"
                            onClick={() => toggleSegmentFilter(segment.id)}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs transition-colors",
                              selected ? "bg-muted" : "hover:bg-muted/50",
                            )}
                            style={{ borderColor: segment.color, color: segment.color }}
                          >
                            {selected ? <Check className="size-3" /> : null}
                            {segment.name}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : null}

                <div className="flex items-center justify-between gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={toggleSelectAllVisible}>
                    {allVisibleSelected
                      ? t("mail.send.recipients.clearSelection", "Clear selection")
                      : recipientType === "customers"
                        ? t("mail.send.recipients.selectAllActiveCustomers", "Select all active customers")
                        : t("mail.send.recipients.selectAllActiveContacts", "Select all active contacts")}
                  </Button>
                  {myRecipientIds.length > 0 ? (
                    <Button type="button" variant="ghost" size="sm" onClick={toggleSelectMyRecipients}>
                      {allMyRecipientsSelected
                        ? recipientType === "customers"
                          ? t("mail.send.recipients.clearMyCustomers", "Clear my customers")
                          : t("mail.send.recipients.clearMyContacts", "Clear my contacts")
                        : recipientType === "customers"
                          ? t("mail.send.recipients.selectMyCustomers", "Select my customers")
                          : t("mail.send.recipients.selectMyContacts", "Select my contacts")}
                    </Button>
                  ) : null}
                </div>

                <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-1">
                  {activeFilteredOptions.length === 0 ? (
                    <p className="px-2 py-3 text-sm text-muted-foreground">
                      {t("mail.send.recipients.noMatches", "No recipients match this filter")}
                    </p>
                  ) : (
                    activeFilteredOptions.map((recipient) => {
                      const selected = activeSelectedIds.includes(recipient.id)
                      const segmentCount = recipient.segmentIds.length
                      const secondaryLabel =
                        recipientType === "customers"
                          ? (recipient as MailRecipientCustomer).fortnox_customer_number
                            ? `#${(recipient as MailRecipientCustomer).fortnox_customer_number}`
                            : recipient.email ?? ""
                          : (recipient as MailRecipientContact).email ?? (recipient as MailRecipientContact).phone ?? ""

                      return (
                        <div
                          key={recipient.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => toggleRecipientSelection(recipient.id)}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter" && event.key !== " ") return
                            event.preventDefault()
                            toggleRecipientSelection(recipient.id)
                          }}
                          className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/60"
                        >
                          <Checkbox checked={selected} className="mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{recipient.name}</p>
                            {secondaryLabel ? (
                              <p className="truncate text-xs text-muted-foreground">{secondaryLabel}</p>
                            ) : null}
                          </div>
                          {segmentCount > 0 ? (
                            <span className="text-xs text-muted-foreground">{segmentCount}</span>
                          ) : null}
                        </div>
                      )
                    })
                  )}
                </div>
              </PopoverContent>
            </Popover>

            {selectedRecipients.length > 0 ? (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {visibleSelectedRecipients.map((recipient) => (
                  <span
                    key={`${recipient.type}-${recipient.id}`}
                    className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs"
                  >
                    <span className="max-w-48 truncate">{recipient.name}</span>
                    <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                      {recipient.type === "customers"
                        ? t("mail.send.recipients.customerShort", "C")
                        : t("mail.send.recipients.contactShort", "P")}
                    </Badge>
                    <button
                      type="button"
                      className="rounded-sm opacity-60 transition-opacity hover:opacity-100"
                      onClick={() => removeSelectedRecipient(recipient.id, recipient.type)}
                    >
                      <X className="size-3" />
                      <span className="sr-only">Remove {recipient.name}</span>
                    </button>
                  </span>
                  ))}
                </div>

                {hiddenSelectedRecipientCount > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-0 text-xs text-muted-foreground"
                    onClick={() => setShowAllSelectedRecipients((current) => !current)}
                  >
                    {showAllSelectedRecipients
                      ? t("mail.send.recipients.showLess", "Show less")
                      : t(
                          "mail.send.recipients.showAll",
                          `Show all (${hiddenSelectedRecipientCount} more)`,
                        )}
                  </Button>
                ) : null}
              </div>
            ) : null}

            <p className="text-xs text-muted-foreground">
              {t(
                "mail.send.customerTokenHelp",
                "@customer is replaced with each selected recipient name. @company is replaced with the company name.",
              )}
            </p>
          </div>

          {selectedSavedTemplate ? (
            <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
              {t(
                "mail.send.savedTemplateLocked",
                "Using saved template content. To edit fields, switch to Plain or Plain OS.",
              )}
            </div>
          ) : templateType === "plain" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="mail-plain-subject">{t("settings.mail.subject", "Subject")}</Label>
                <Input
                  id="mail-plain-subject"
                  value={plainForm.subject}
                  onChange={(event) =>
                    setPlainForm((current) => ({ ...current, subject: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mail-plain-body">{t("mail.send.body", "Body")}</Label>
                <Textarea
                  id="mail-plain-body"
                  className="min-h-36"
                  value={plainForm.body}
                  onChange={(event) =>
                    setPlainForm((current) => ({ ...current, body: event.target.value }))
                  }
                />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="mail-subject">{t("settings.mail.subject", "Subject")}</Label>
                <Input
                  id="mail-subject"
                  value={plainOsForm.subject}
                  onChange={(event) =>
                    setPlainOsForm((current) => ({ ...current, subject: event.target.value }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="mail-title">{t("settings.mail.emailTitle", "Title")}</Label>
                <Input
                  id="mail-title"
                  value={plainOsForm.title}
                  onChange={(event) =>
                    setPlainOsForm((current) => ({ ...current, title: event.target.value }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="mail-preview-text">
                  {t("settings.mail.previewText", "Preview text")}
                </Label>
                <Input
                  id="mail-preview-text"
                  value={plainOsForm.previewText}
                  onChange={(event) =>
                    setPlainOsForm((current) => ({ ...current, previewText: event.target.value }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="mail-greeting">{t("settings.mail.greeting", "Greeting")}</Label>
                <Input
                  id="mail-greeting"
                  value={plainOsForm.greeting}
                  onChange={(event) =>
                    setPlainOsForm((current) => ({ ...current, greeting: event.target.value }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="mail-paragraphs">
                  {t("settings.mail.contentParagraphs", "Content paragraphs (one line per paragraph)")}
                </Label>
                <Textarea
                  id="mail-paragraphs"
                  className="min-h-32"
                  value={plainOsForm.paragraphs}
                  onChange={(event) =>
                    setPlainOsForm((current) => ({ ...current, paragraphs: event.target.value }))
                  }
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="mail-cta-label">{t("settings.mail.ctaLabel", "CTA label")}</Label>
                  <Input
                    id="mail-cta-label"
                    value={plainOsForm.ctaLabel}
                    onChange={(event) =>
                      setPlainOsForm((current) => ({ ...current, ctaLabel: event.target.value }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="mail-cta-url">{t("settings.mail.ctaUrl", "CTA URL")}</Label>
                  <Input
                    id="mail-cta-url"
                    value={plainOsForm.ctaUrl}
                    onChange={(event) =>
                      setPlainOsForm((current) => ({ ...current, ctaUrl: event.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mail-footnote">{t("settings.mail.footnote", "Footnote")}</Label>
                <Textarea
                  id="mail-footnote"
                  className="min-h-20"
                  value={plainOsForm.footnote}
                  onChange={(event) =>
                    setPlainOsForm((current) => ({ ...current, footnote: event.target.value }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="mail-brand-name">{t("settings.mail.brandName", "Brand name")}</Label>
                <Input
                  id="mail-brand-name"
                  value={plainOsForm.brandName}
                  onChange={(event) =>
                    setPlainOsForm((current) => ({ ...current, brandName: event.target.value }))
                  }
                />
              </div>
            </>
          )}

          <Button onClick={handleSend} disabled={sending || previewLoading}>
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {t("settings.mail.sendEmail", "Send email")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("settings.mail.previewTitle", "Rendered HTML preview")}
          </CardTitle>
          <CardDescription>
            {t("settings.mail.previewDescription", "Live server-rendered template output.")}
          </CardDescription>
          {selectedRecipients.length > 1 ? (
            <div className="flex items-center gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setPreviewCustomerIndex((current) =>
                    current <= 0 ? selectedRecipients.length - 1 : current - 1,
                  )
                }
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="text-xs text-muted-foreground">
                {t("mail.send.previewFor", "Preview for")}: {selectedRecipients[previewCustomerIndex]?.name} ({previewCustomerIndex + 1}/{selectedRecipients.length})
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setPreviewCustomerIndex((current) =>
                    current >= selectedRecipients.length - 1 ? 0 : current + 1,
                  )
                }
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          ) : null}
        </CardHeader>
        <CardContent>
          {previewLoading ? (
            <div className="flex h-[875px] items-center justify-center rounded-md border bg-muted/20">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <iframe
              title={t("settings.mail.previewIframeTitle", "Mail preview")}
              className="h-[875px] w-full rounded-md border bg-white"
              srcDoc={previewHtml}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
