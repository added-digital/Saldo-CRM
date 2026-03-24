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
  Link,
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
  const headerImageUrl = toAbsoluteAssetUrl(baseUrl, "/emails/saldo.png");
  const footerMarkUrl = toAbsoluteAssetUrl(baseUrl, system.logoMark);
  const homeUrl = baseUrl || system.url;

  return (
    <Html>
      <Head>
        {previewText ? <Preview>{previewText}</Preview> : null}
      </Head>
      <Body style={main}>
        <Container style={outerContainer}>
          <Section style={shell}>
            <Section style={header}>
              <Img src={headerImageUrl} width="600" alt={`${brandName} Header`} style={headerImage} />
            </Section>

            <Section style={content}>{children}</Section>

            <Hr style={hr} />

            <Section style={footer}>
              <Img src={footerMarkUrl} width="54" height="54" alt={`${brandName} mark`} style={footerLogo} />
              <Text style={footerBrand}>{brandName}</Text>
              <Text style={footerDomain}>saldoredo.se</Text>
              <Text style={footerText}>
                Trouble seeing this email?{" "}
                <Link href={homeUrl} style={footerLink}>
                  Open it in browser.
                </Link>
              </Text>
            </Section>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: "#1f2024",
  fontFamily:
    'Inter,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif',
};

const outerContainer = {
  margin: "0 auto",
  width: "100%",
  padding: "24px 0 30px",
  maxWidth: "600px",
};

const shell = {
  borderRadius: "28px",
  backgroundColor: "#121214",
  border: "1px solid #2e2f34",
  boxShadow: "0 16px 44px rgba(0, 0, 0, 0.42)",
  overflow: "hidden",
};

const header = {
  margin: "0",
  padding: "0",
};

const headerImage = {
  display: "block",
  width: "100%",
  maxWidth: "600px",
  margin: "0",
};

const content = {
  padding: "58px 48px 28px",
  backgroundColor: "#121214",
};

const hr = {
  borderColor: "#2f2f33",
  margin: "0",
};

const footer = {
  padding: "34px 48px 38px",
  textAlign: "center" as const,
  backgroundColor: "#121214",
};

const footerLogo = {
  margin: "0 auto 22px",
  display: "block",
};

const footerBrand = {
  fontSize: "42px",
  lineHeight: "1.08",
  letterSpacing: "-0.02em",
  fontWeight: "700",
  color: "#f4f4f5",
  margin: "0 0 6px",
};

const footerDomain = {
  fontSize: "34px",
  lineHeight: "1.1",
  fontWeight: "400",
  color: "#8f8f99",
  margin: "0 0 34px",
};

const footerText = {
  fontSize: "16px",
  fontWeight: "400",
  color: "#8f8f99",
  lineHeight: "24px",
  margin: "0",
};

const footerLink = {
  color: "#7793e4",
  textDecoration: "none",
};
