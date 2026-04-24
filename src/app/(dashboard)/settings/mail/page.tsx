"use client"

import * as React from "react"
import { Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { useUser } from "@/hooks/use-user"
import { useTranslation } from "@/hooks/use-translation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import type { MailTemplate } from "@/types/database"
import { toast } from "sonner"

type MailTemplateType = "plain" | "plain_os" | "default"

type TemplateEditorState = {
  id: string | null
  name: string
  templateType: MailTemplateType
  isActive: boolean
  subject: string
  body: string
  title: string
  previewText: string
  greeting: string
  paragraphs: string
  ctaLabel: string
  ctaUrl: string
  footnote: string
  brandName: string
}

function toParagraphs(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

function createDefaultEditorState(
  t: (key: string, fallback?: string) => string,
): TemplateEditorState {
  return {
    id: null,
    name: "",
    templateType: "default",
    isActive: true,
    subject: "",
    body: "",
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

function toTemplatePayload(state: TemplateEditorState): Record<string, unknown> {
  if (state.templateType === "plain") {
    return {
      subject: state.subject,
      body: state.body,
    }
  }

  return {
    subject: state.subject,
    title: state.title,
    previewText: state.previewText,
    greeting: state.greeting,
    paragraphs: toParagraphs(state.paragraphs),
    ctaLabel: state.ctaLabel,
    ctaUrl: state.ctaUrl,
    footnote: state.footnote,
    brandName: state.brandName,
  }
}

function parseTemplatePayload(
  template: MailTemplate,
  t: (key: string, fallback?: string) => string,
): TemplateEditorState {
  const payload = template.payload ?? {}
  const defaultState = createDefaultEditorState(t)

  return {
    ...defaultState,
    id: template.id,
    name: template.name,
    templateType: template.template_type,
    isActive: template.is_active,
    subject: typeof payload.subject === "string" ? payload.subject : defaultState.subject,
    body: typeof payload.body === "string" ? payload.body : defaultState.body,
    title: typeof payload.title === "string" ? payload.title : defaultState.title,
    previewText:
      typeof payload.previewText === "string"
        ? payload.previewText
        : defaultState.previewText,
    greeting:
      typeof payload.greeting === "string" ? payload.greeting : defaultState.greeting,
    paragraphs: Array.isArray(payload.paragraphs)
      ? payload.paragraphs
          .filter((entry): entry is string => typeof entry === "string")
          .join("\n")
      : typeof payload.paragraphs === "string"
        ? payload.paragraphs
        : defaultState.paragraphs,
    ctaLabel:
      typeof payload.ctaLabel === "string" ? payload.ctaLabel : defaultState.ctaLabel,
    ctaUrl: typeof payload.ctaUrl === "string" ? payload.ctaUrl : defaultState.ctaUrl,
    footnote:
      typeof payload.footnote === "string" ? payload.footnote : defaultState.footnote,
    brandName:
      typeof payload.brandName === "string"
        ? payload.brandName
        : defaultState.brandName,
  }
}

export default function SettingsMailPage() {
  const { user, isAdmin } = useUser()
  const { t } = useTranslation()
  const [templates, setTemplates] = React.useState<MailTemplate[]>([])
  const [loadingTemplates, setLoadingTemplates] = React.useState(true)
  const [editorOpen, setEditorOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [previewLoading, setPreviewLoading] = React.useState(false)
  const [previewHtml, setPreviewHtml] = React.useState("")
  const [editor, setEditor] = React.useState<TemplateEditorState>(() =>
    createDefaultEditorState(t),
  )

  async function loadTemplates() {
    setLoadingTemplates(true)
    const supabase = createClient()
    const { data } = await supabase
      .from("mail_templates")
      .select("id, name, template_type, payload, is_active, created_by, created_at, updated_at")
      .order("updated_at", { ascending: false })

    setTemplates((data ?? []) as MailTemplate[])
    setLoadingTemplates(false)
  }

  React.useEffect(() => {
    void loadTemplates()
  }, [])

  React.useEffect(() => {
    if (!editorOpen) return
    const abortController = new AbortController()
    const timeout = window.setTimeout(async () => {
      setPreviewLoading(true)
      try {
        const response = await fetch("/api/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: ["preview@example.com"],
            template: editor.templateType === "plain" ? "plain" : "content",
            mode: "preview",
            data: toTemplatePayload(editor),
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
  }, [editor, editorOpen])

  function openCreateTemplate() {
    setEditor(createDefaultEditorState(t))
    setEditorOpen(true)
  }

  function openEditTemplate(template: MailTemplate) {
    setEditor(parseTemplatePayload(template, t))
    setEditorOpen(true)
  }

  async function handleSaveTemplate() {
    if (!editor.name.trim()) {
      toast.error(t("settings.mailTemplates.toast.nameRequired", "Template name is required"))
      return
    }

    setSaving(true)
    const supabase = createClient()
    const payload = toTemplatePayload(editor)

    if (editor.id) {
      const { error } = await supabase
        .from("mail_templates")
        .update({
          name: editor.name.trim(),
          template_type: editor.templateType,
          payload,
          is_active: editor.isActive,
        } as never)
        .eq("id", editor.id)

      if (error) {
        toast.error(t("settings.mailTemplates.toast.saveFailed", "Failed to save template"))
        setSaving(false)
        return
      }
    } else {
      const { error } = await supabase
        .from("mail_templates")
        .insert({
          name: editor.name.trim(),
          template_type: editor.templateType,
          payload,
          is_active: editor.isActive,
          created_by: user.id,
        } as never)

      if (error) {
        toast.error(t("settings.mailTemplates.toast.saveFailed", "Failed to save template"))
        setSaving(false)
        return
      }
    }

    toast.success(t("settings.mailTemplates.toast.saved", "Template saved"))
    setSaving(false)
    setEditorOpen(false)
    await loadTemplates()
  }

  async function handleDeleteTemplate(templateId: string) {
    const supabase = createClient()
    const { error } = await supabase
      .from("mail_templates")
      .delete()
      .eq("id", templateId)

    if (error) {
      toast.error(t("settings.mailTemplates.toast.deleteFailed", "Failed to delete template"))
      return
    }

    toast.success(t("settings.mailTemplates.toast.deleted", "Template deleted"))
    await loadTemplates()
  }

  if (!isAdmin) {
    return <div className="h-40 rounded-lg border bg-muted/20" />
  }

  return (
    <div className="space-y-6">
      {!editorOpen ? (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold">
                {t("settings.mailTemplates.existing", "Existing templates")}
              </h3>
              <p className="text-sm text-muted-foreground">
                {t(
                  "settings.mailTemplates.existingDescription",
                  "Templates available to users when sending emails.",
                )}
              </p>
            </div>

            <Button onClick={openCreateTemplate}>
              <Plus className="size-4" />
              {t("settings.mailTemplates.create", "Create new template")}
            </Button>
          </div>

          {loadingTemplates ? (
            <div className="h-36 animate-pulse rounded-lg border bg-muted/20" />
          ) : templates.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-sm text-muted-foreground">
                {t("settings.mailTemplates.empty", "No templates yet. Create your first template.")}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {templates.map((template) => (
                <Card key={template.id}>
                  <CardHeader className="space-y-1 pb-2">
                    <CardTitle className="text-sm font-semibold">{template.name}</CardTitle>
                    <CardDescription>
                      {template.template_type === "plain"
                        ? t("mail.send.optionPlain", "Plain")
                        : template.template_type === "plain_os"
                          ? t("mail.send.optionPlainOs", "Plain OS")
                          : t("mail.send.optionDefault", "Default")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between pt-0">
                    <span className="text-xs text-muted-foreground">
                      {template.is_active
                        ? t("settings.mailTemplates.active", "Active")
                        : t("settings.mailTemplates.inactive", "Inactive")}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEditTemplate(template)}>
                        <Pencil className="size-3.5" />
                        {t("settings.mailTemplates.edit", "Edit")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive"
                        onClick={() => handleDeleteTemplate(template.id)}
                      >
                        <Trash2 className="size-3.5" />
                        {t("common.delete", "Delete")}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1.05fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {editor.id
                  ? t("settings.mailTemplates.editTemplate", "Edit template")
                  : t("settings.mailTemplates.createTemplate", "Create template")}
              </CardTitle>
              <CardDescription>
                {t(
                  "settings.mailTemplates.editorDescription",
                  "Saved templates are available in the Mail send view.",
                )}
                <br />
                {t(
                  "settings.mailTemplates.dynamicTokensHelp",
                  "Use @customer and @company to create dynamic parts in the mail.",
                )}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="template-name">
                    {t("settings.mailTemplates.templateName", "Template name")}
                  </Label>
                  <Input
                    id="template-name"
                    value={editor.name}
                    onChange={(event) =>
                      setEditor((current) => ({ ...current, name: event.target.value }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="template-type">
                    {t("settings.mailTemplates.templateType", "Template type")}
                  </Label>
                  <Select
                    value={editor.templateType}
                    onValueChange={(value: MailTemplateType) =>
                      setEditor((current) => ({ ...current, templateType: value }))
                    }
                  >
                    <SelectTrigger id="template-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="plain">{t("mail.send.optionPlain", "Plain")}</SelectItem>
                      <SelectItem value="default">{t("mail.send.optionDefault", "Default")}</SelectItem>
                      <SelectItem value="plain_os">{t("mail.send.optionPlainOs", "Plain OS")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">
                    {t("settings.mailTemplates.active", "Active")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "settings.mailTemplates.activeDescription",
                      "Only active templates are shown in the Mail send view.",
                    )}
                  </p>
                </div>
                <Switch
                  checked={editor.isActive}
                  onCheckedChange={(checked) =>
                    setEditor((current) => ({ ...current, isActive: checked }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="template-subject">{t("settings.mail.subject", "Subject")}</Label>
                <Input
                  id="template-subject"
                  value={editor.subject}
                  onChange={(event) =>
                    setEditor((current) => ({ ...current, subject: event.target.value }))
                  }
                />
              </div>

              {editor.templateType === "plain" ? (
                <div className="space-y-2">
                  <Label htmlFor="template-body">{t("mail.send.body", "Body")}</Label>
                  <Textarea
                    id="template-body"
                    className="min-h-40"
                    value={editor.body}
                    onChange={(event) =>
                      setEditor((current) => ({ ...current, body: event.target.value }))
                    }
                  />
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="template-title">{t("settings.mail.emailTitle", "Title")}</Label>
                    <Input
                      id="template-title"
                      value={editor.title}
                      onChange={(event) =>
                        setEditor((current) => ({ ...current, title: event.target.value }))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="template-preview-text">
                      {t("settings.mail.previewText", "Preview text")}
                    </Label>
                    <Input
                      id="template-preview-text"
                      value={editor.previewText}
                      onChange={(event) =>
                        setEditor((current) => ({ ...current, previewText: event.target.value }))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="template-greeting">{t("settings.mail.greeting", "Greeting")}</Label>
                    <Input
                      id="template-greeting"
                      value={editor.greeting}
                      onChange={(event) =>
                        setEditor((current) => ({ ...current, greeting: event.target.value }))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="template-paragraphs">
                      {t("settings.mail.contentParagraphs", "Content paragraphs (one line per paragraph)")}
                    </Label>
                    <Textarea
                      id="template-paragraphs"
                      className="min-h-36"
                      value={editor.paragraphs}
                      onChange={(event) =>
                        setEditor((current) => ({ ...current, paragraphs: event.target.value }))
                      }
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="template-cta-label">{t("settings.mail.ctaLabel", "CTA label")}</Label>
                      <Input
                        id="template-cta-label"
                        value={editor.ctaLabel}
                        onChange={(event) =>
                          setEditor((current) => ({ ...current, ctaLabel: event.target.value }))
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="template-cta-url">{t("settings.mail.ctaUrl", "CTA URL")}</Label>
                      <Input
                        id="template-cta-url"
                        value={editor.ctaUrl}
                        onChange={(event) =>
                          setEditor((current) => ({ ...current, ctaUrl: event.target.value }))
                        }
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="template-footnote">{t("settings.mail.footnote", "Footnote")}</Label>
                    <Textarea
                      id="template-footnote"
                      className="min-h-20"
                      value={editor.footnote}
                      onChange={(event) =>
                        setEditor((current) => ({ ...current, footnote: event.target.value }))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="template-brand">{t("settings.mail.brandName", "Brand name")}</Label>
                    <Input
                      id="template-brand"
                      value={editor.brandName}
                      onChange={(event) =>
                        setEditor((current) => ({ ...current, brandName: event.target.value }))
                      }
                    />
                  </div>
                </>
              )}

              <div className="flex items-center gap-2">
                <Button onClick={handleSaveTemplate} disabled={saving || previewLoading}>
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  {t("settings.mailTemplates.saveTemplate", "Save template")}
                </Button>
                <Button variant="outline" onClick={() => setEditorOpen(false)}>
                  <X className="size-4" />
                  {t("common.cancel", "Cancel")}
                </Button>
              </div>
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
      )}
    </div>
  )
}
