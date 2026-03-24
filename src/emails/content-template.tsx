import { Text, Button } from "@react-email/components";
import { EmailLayout } from "./layout";

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
  return (
    <EmailLayout previewText={previewText ?? title} appUrl={appUrl} brandName={brandName}>
      <Text style={heading}>{title}</Text>
      {greeting ? <Text style={greetingStyle}>{greeting}</Text> : null}

      {paragraphs.map((paragraph, index) => (
        <Text key={`${index}-${paragraph.slice(0, 16)}`} style={paragraphStyle}>
          {paragraph}
        </Text>
      ))}

      {ctaLabel && ctaUrl ? (
        <Button href={ctaUrl} style={button}>
          {ctaLabel}
        </Button>
      ) : null}

      {footnote ? <Text style={note}>{footnote}</Text> : null}
    </EmailLayout>
  );
}

const heading = {
  fontSize: "24px",
  fontWeight: "700",
  color: "#1f2937",
  marginBottom: "24px",
  textAlign: "center" as const,
};

const greetingStyle = {
  fontSize: "16px",
  fontWeight: "600",
  color: "#1f2937",
  marginBottom: "16px",
};

const paragraphStyle = {
  fontSize: "14px",
  color: "#374151",
  lineHeight: "24px",
  marginBottom: "16px",
};

const button = {
  backgroundColor: "#4F46E5",
  borderRadius: "6px",
  color: "#ffffff",
  fontSize: "16px",
  fontWeight: "600",
  textDecoration: "none",
  textAlign: "center" as const,
  display: "block",
  padding: "12px 24px",
  marginTop: "24px",
  marginBottom: "24px",
};

const note = {
  fontSize: "13px",
  color: "#6b7280",
  lineHeight: "20px",
  marginTop: "16px",
};

export type { ContentTemplateEmailProps };
