import * as React from "react";
import { Text, Button, Section } from "@react-email/components";
import { EmailLayout } from "./layout";

function renderWithSoftBreaks(text: string): React.ReactNode {
  const lines = text.split("\n");
  return lines.map((line, index) => (
    <React.Fragment key={index}>
      {line}
      {index < lines.length - 1 ? <br /> : null}
    </React.Fragment>
  ));
}

interface ContentTemplateEmailProps {
  title: string;
  previewText?: string;
  greeting?: string;
  paragraphs?: string[];
  ctaLabel?: string;
  ctaUrl?: string;
  footnote?: string;
  appUrl?: string;
  brandName?: string;
}

export function ContentTemplateEmail({
  title,
  previewText,
  greeting,
  paragraphs = [],
  ctaLabel,
  ctaUrl,
  footnote,
  appUrl,
  brandName,
}: ContentTemplateEmailProps) {
  const hasCta = Boolean(ctaLabel && ctaUrl);

  return (
    <EmailLayout
      previewText={previewText ?? title}
      appUrl={appUrl}
      brandName={brandName}
    >
      <Section style={frame}>
        <Text style={heading}>{title}</Text>

        {greeting ? <Text style={greetingStyle}>{greeting}</Text> : null}

        {paragraphs.length > 0 && (
          <Section style={paragraphGroup}>
            {paragraphs.map((paragraph, index) => (
              <Text
                key={`${index}-${paragraph.slice(0, 16)}`}
                style={paragraphStyle}
              >
                {renderWithSoftBreaks(paragraph)}
              </Text>
            ))}
          </Section>
        )}

        {hasCta && (
          <Section style={buttonRow}>
            <Button href={ctaUrl} style={button}>
              {ctaLabel}
            </Button>
          </Section>
        )}

        {footnote ? <Text style={note}>{footnote}</Text> : null}
      </Section>
    </EmailLayout>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const frame = {
  padding: "48px 48px",
  textAlign: "center" as const,
};

const heading = {
  fontSize: "34px",
  fontWeight: "500",
  fontFamily: 'Satoshi, Inter, "Segoe UI", sans-serif',
  color: "#ffffff",
  marginTop: "0",
  marginBottom: "0",
  textAlign: "center" as const,
  lineHeight: "1.2",
  letterSpacing: "-0.4px",
};

const greetingStyle = {
  fontSize: "15px",
  fontWeight: "400",
  color: "#ffffff",
  marginTop: "14px",
  marginBottom: "0",
  textAlign: "center" as const,
  lineHeight: "1.4",
};

const paragraphGroup = {
  width: "100%",
  marginTop: "24px",
};

const paragraphStyle = {
  fontSize: "15px",
  fontFamily: '"Open Sans", Inter, "Segoe UI", sans-serif',
  color: "#ffffff",
  lineHeight: "1.4",
  marginTop: "0",
  marginBottom: "0",
  textAlign: "center" as const,
};

const button = {
  backgroundColor: "#eabf89",
  borderRadius: "100px",
  color: "#171717",
  fontSize: "13px",
  fontWeight: "500",
  fontFamily: 'Satoshi, Inter, "Segoe UI", sans-serif',
  letterSpacing: "-0.084px",
  textDecoration: "none",
  textAlign: "center" as const,
  display: "inline-block",
  padding: "9px 14px",
  margin: "0",
  boxShadow: "0px 1px 2px rgba(82, 88, 102, 0.06)",
};

const buttonRow = {
  marginTop: "24px",
  marginBottom: "0",
  textAlign: "center" as const,
};

const note = {
  fontSize: "13px",
  color: "#a1a1aa",
  lineHeight: "22px",
  marginTop: "14px",
  marginBottom: "0",
  textAlign: "center" as const,
};

export type { ContentTemplateEmailProps };
