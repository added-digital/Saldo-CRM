import { Text, Button, Section } from "@react-email/components";
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
  const hasCta = Boolean(ctaLabel && ctaUrl);

  return (
    <EmailLayout previewText={previewText ?? title} appUrl={appUrl} brandName={brandName}>
      <Section style={frame}>
        <Text style={heading}>{title}</Text>

        {greeting ? <Text style={greetingStyle}>{greeting}</Text> : null}

        <Section style={paragraphGroup}>
          {paragraphs.map((paragraph, index) => (
            <Text key={`${index}-${paragraph.slice(0, 16)}`} style={paragraphStyle}>
              {paragraph}
            </Text>
          ))}
        </Section>

        {hasCta ? (
          <Button href={ctaUrl} style={button}>
            {ctaLabel}
          </Button>
        ) : null}

        {footnote ? <Text style={note}>{footnote}</Text> : null}
      </Section>
    </EmailLayout>
  );
}

const frame = {
  padding: "52px 64px",
  textAlign: "center" as const,
};

const heading = {
  fontSize: "40px",
  fontWeight: "500",
  fontFamily: 'Satoshi, Inter, "Segoe UI", sans-serif',
  color: "#f4f4f5",
  marginTop: "0",
  marginBottom: "0",
  textAlign: "center" as const,
  lineHeight: "1.2",
  letterSpacing: "-0.4px",
};

const greetingStyle = {
  fontSize: "16px",
  fontWeight: "400",
  color: "#ffffff",
  marginTop: "0",
  marginBottom: "10px",
  textAlign: "center" as const,
};

const paragraphGroup = {
  width: "100%",
  marginTop: "32px",
};

const paragraphStyle = {
  fontSize: "16px",
  fontFamily: '"Open Sans", Inter, "Segoe UI", sans-serif',
  color: "#ffffff",
  lineHeight: "1.4",
  marginTop: "0",
  marginBottom: "0",
  textAlign: "center" as const,
};

const button = {
  backgroundColor: "#eabf89",
  borderRadius: "999px",
  color: "#151518",
  fontSize: "14px",
  fontWeight: "500",
  fontFamily: 'Satoshi, Inter, "Segoe UI", sans-serif',
  textDecoration: "none",
  textAlign: "center" as const,
  display: "block",
  width: "fit-content",
  padding: "10px 16px",
  marginTop: "32px",
  marginBottom: "0",
  marginLeft: "auto",
  marginRight: "auto",
  boxShadow: "0px 1px 2px rgba(82, 88, 102, 0.06)",
};

const note = {
  fontSize: "14px",
  color: "#a1a1aa",
  lineHeight: "22px",
  marginTop: "18px",
  marginBottom: "0",
  textAlign: "center" as const,
};

export type { ContentTemplateEmailProps };
