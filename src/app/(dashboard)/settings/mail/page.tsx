"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Send } from "lucide-react";

import { useUser } from "@/hooks/use-user";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type MailFormState = {
  to: string;
  subject: string;
  title: string;
  previewText: string;
  greeting: string;
  paragraphs: string;
  ctaLabel: string;
  ctaUrl: string;
  footnote: string;
  brandName: string;
};

const INITIAL_STATE: MailFormState = {
  to: "",
  subject: "",
  title: "Headline",
  previewText: "Quick update from Saldo",
  greeting: "",
  paragraphs: "This is a preview of your custom email content.",
  ctaLabel: "Call to action",
  ctaUrl: process.env.NEXT_PUBLIC_APP_URL || "",
  footnote: "",
  brandName: "Saldo Redovisning",
};

function toParagraphs(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function toRecipients(raw: string): string[] {
  return raw
    .split(/[\r\n,;]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export default function SettingsMailPage() {
  const { isAdmin } = useUser();
  const searchParams = useSearchParams();
  const [form, setForm] = React.useState<MailFormState>(INITIAL_STATE);
  const [previewHtml, setPreviewHtml] = React.useState("");
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [sendSeparately, setSendSeparately] = React.useState(false);

  const payloadData = React.useMemo(
    () => ({
      subject: form.subject,
      title: form.title,
      previewText: form.previewText,
      greeting: form.greeting,
      paragraphs: toParagraphs(form.paragraphs),
      ctaLabel: form.ctaLabel,
      ctaUrl: form.ctaUrl,
      footnote: form.footnote,
      brandName: form.brandName,
    }),
    [form],
  );

  React.useEffect(() => {
    const toParam = searchParams.get("to");
    if (!toParam) return;

    setForm((current) => {
      if (current.to.trim().length > 0) return current;
      return {
        ...current,
        to: toParam,
      };
    });
  }, [searchParams]);

  React.useEffect(() => {
    const abortController = new AbortController();
    const timeout = window.setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const response = await fetch("/api/email", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            to: toRecipients(form.to).length > 0 ? toRecipients(form.to) : ["preview@example.com"],
            template: "content",
            mode: "preview",
            data: payloadData,
          }),
          signal: abortController.signal,
        });

        const result = (await response.json()) as {
          html?: string;
          error?: string;
          message?: string;
        };
        if (!response.ok) {
          setPreviewHtml("");
          return;
        }

        setPreviewHtml(result.html ?? "");
      } catch {
        if (!abortController.signal.aborted) {
          setPreviewHtml("");
        }
      } finally {
        if (!abortController.signal.aborted) {
          setPreviewLoading(false);
        }
      }
    }, 320);

    return () => {
      abortController.abort();
      window.clearTimeout(timeout);
    };
  }, [form.to, payloadData]);

  async function handleSend() {
    const recipients = toRecipients(form.to);
    if (recipients.length === 0) {
      toast.error("Recipient email is required");
      return;
    }

    setSending(true);
    try {
      const response = await fetch("/api/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: recipients,
          template: "content",
          mode: "send",
          deliveryMode: sendSeparately ? "separate" : "grouped",
          data: payloadData,
        }),
      });

      const result = (await response.json()) as {
        error?: string;
        message?: string;
        sent_count?: number;
      };

      if (!response.ok) {
        toast.error(result.message || result.error || "Failed to send email");
        return;
      }

      if (sendSeparately) {
        const sentCount = result.sent_count ?? recipients.length;
        toast.success(`Sent ${sentCount} separate email${sentCount === 1 ? "" : "s"}`);
      } else {
        toast.success("Email sent as grouped message");
      }
    } catch {
      toast.error("Failed to send email");
    } finally {
      setSending(false);
    }
  }

  function updateField<K extends keyof MailFormState>(
    field: K,
    value: MailFormState[K],
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <div className="h-48 animate-pulse rounded-lg border bg-muted" />
      </div>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1.05fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mail composer</CardTitle>
          <CardDescription>
            Choose recipient and customize template content.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="mail-to">Send to</Label>
            <Textarea
              id="mail-to"
              className="min-h-20"
              placeholder="name@example.com\nsecond@example.com"
              value={form.to}
              onChange={(event) => updateField("to", event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Add one email per line (or separate with comma/semicolon).
            </p>
          </div>

          <div className="flex items-start justify-between gap-4 rounded-md border p-3">
            <div className="space-y-1">
              <Label htmlFor="mail-send-separately">Send separate emails</Label>
              <p className="text-xs text-muted-foreground">
                When enabled, each recipient gets an individual email. When disabled,
                all recipients are included in one grouped message.
              </p>
            </div>
            <Switch
              id="mail-send-separately"
              checked={sendSeparately}
              onCheckedChange={setSendSeparately}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="mail-subject">Subject</Label>
              <Input
                id="mail-subject"
                value={form.subject}
                onChange={(event) => updateField("subject", event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="mail-brand">Brand name</Label>
              <Input
                id="mail-brand"
                value={form.brandName}
                onChange={(event) =>
                  updateField("brandName", event.target.value)
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mail-title">Title</Label>
            <Input
              id="mail-title"
              value={form.title}
              onChange={(event) => updateField("title", event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="mail-preview">Preview text</Label>
            <Input
              id="mail-preview"
              value={form.previewText}
              onChange={(event) =>
                updateField("previewText", event.target.value)
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="mail-greeting">Greeting</Label>
            <Input
              id="mail-greeting"
              value={form.greeting}
              onChange={(event) => updateField("greeting", event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="mail-paragraphs">
              Content paragraphs (one line per paragraph)
            </Label>
            <Textarea
              id="mail-paragraphs"
              className="min-h-36"
              value={form.paragraphs}
              onChange={(event) =>
                updateField("paragraphs", event.target.value)
              }
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="mail-cta-label">CTA label</Label>
              <Input
                id="mail-cta-label"
                value={form.ctaLabel}
                onChange={(event) =>
                  updateField("ctaLabel", event.target.value)
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="mail-cta-url">CTA URL</Label>
              <Input
                id="mail-cta-url"
                value={form.ctaUrl}
                onChange={(event) => updateField("ctaUrl", event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mail-footnote">Footnote</Label>
            <Textarea
              id="mail-footnote"
              className="min-h-20"
              value={form.footnote}
              onChange={(event) => updateField("footnote", event.target.value)}
            />
          </div>

          <Button onClick={handleSend} disabled={sending || previewLoading}>
            {sending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            Send email
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rendered HTML preview</CardTitle>
          <CardDescription>
            Live server-rendered template output.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {previewLoading ? (
            <div className="flex h-[875px] items-center justify-center rounded-md border bg-muted/20">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <iframe
              title="Mail preview"
              className="h-[875px] w-full rounded-md border bg-white"
              srcDoc={previewHtml}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
