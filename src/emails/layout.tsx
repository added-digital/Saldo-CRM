import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Text,
  Img,
  Hr,
} from "@react-email/components";
import { system } from "@/config/system";

interface EmailLayoutProps {
  children: React.ReactNode;
  previewText?: string;
  appUrl?: string;
  brandName?: string;
}

function normalizeBaseUrl(appUrl?: string): string {
  const fallback = process.env.NEXT_PUBLIC_APP_URL || system.url;
  const candidate = (appUrl || fallback || "").trim();
  if (!candidate) return "";
  return candidate.endsWith("/") ? candidate.slice(0, -1) : candidate;
}

function toAbsoluteAssetUrl(baseUrl: string, assetPath: string): string {
  if (/^https?:\/\//.test(assetPath)) return assetPath;
  if (!baseUrl) return assetPath;
  return `${baseUrl}${assetPath.startsWith("/") ? assetPath : `/${assetPath}`}`;
}

export function EmailLayout({
  children,
  previewText,
  appUrl,
  brandName = system.companyName,
}: EmailLayoutProps) {
  const baseUrl = normalizeBaseUrl(appUrl);
  const logoUrl = toAbsoluteAssetUrl(baseUrl, system.logo);

  return (
    <Html>
      <Head>
        {previewText ? <Preview>{previewText}</Preview> : null}
      </Head>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Img src={logoUrl} width="150" height="50" alt={`${brandName} Logo`} style={logo} />
            <Text style={systemName}>{brandName}</Text>
          </Section>
          <Hr style={hr} />
          <Section style={content}>{children}</Section>
          <Hr style={hr} />
          <Section style={footer}>
            <Text style={footerText}>
              © 2026 {brandName}. All rights reserved.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "20px 0 48px",
  marginBottom: "64px",
  maxWidth: "600px",
};

const header = {
  padding: "32px 32px 0",
  textAlign: "center" as const,
};

const logo = {
  margin: "0 auto",
};

const systemName = {
  fontSize: "24px",
  fontWeight: "600",
  color: "#1f2937",
  marginTop: "16px",
  marginBottom: "0",
};

const content = {
  padding: "0 32px",
};

const hr = {
  borderColor: "#e5e7eb",
  margin: "32px 0",
};

const footer = {
  padding: "0 32px",
  textAlign: "center" as const,
};

const footerText = {
  fontSize: "12px",
  color: "#6b7280",
  lineHeight: "16px",
  margin: "0",
};
