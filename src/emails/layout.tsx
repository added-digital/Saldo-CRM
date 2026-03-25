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
      <Head>{previewText ? <Preview>{previewText}</Preview> : null}</Head>
      <Body style={main}>
        <Container style={outerContainer}>
          <Section style={shell}>
            <Section style={header}>
              <Img
                src={headerImageUrl}
                width="560"
                alt={`${brandName} Header`}
                style={headerImage}
              />
            </Section>

            <Section style={content}>{children}</Section>

            <Hr style={hr} />

            <Section style={footer}>
              <Img
                src={footerMarkUrl}
                width="54"
                height="54"
                alt={`${brandName} mark`}
                style={footerLogo}
              />
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

// ─── Styles ────────────────────────────────────────────────────────────────

const main = {
  fontFamily: 'Inter, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
};

const outerContainer = {
  margin: "0 auto",
  width: "100%",
  padding: "16px 0 22px",
  maxWidth: "560px",
};

const shell = {
  borderRadius: "20px",
  backgroundColor: "#171717",
  border: "1px solid #2e2f34",
  overflow: "hidden",
};

const header = {
  margin: "0",
  padding: "0",
  lineHeight: "0",
};

const headerImage = {
  display: "block",
  width: "100%",
  maxWidth: "560px",
  margin: "0",
};

const content = {
  padding: "0",
  backgroundColor: "#171717",
};

const hr = {
  borderColor: "#2f2f33",
  margin: "0",
};

const footer = {
  padding: "40px 36px",
  textAlign: "center" as const,
  backgroundColor: "#171717",
};

const footerLogo = {
  margin: "0 auto 18px",
  display: "block",
};

const footerBrand = {
  fontSize: "14px",
  lineHeight: "24px",
  fontWeight: "700",
  fontFamily: 'Satoshi, Inter, "Segoe UI", sans-serif',
  color: "#ffffff",
  margin: "0",
  textAlign: "center" as const,
};

const footerDomain = {
  fontSize: "14px",
  lineHeight: "24px",
  fontWeight: "400",
  fontFamily: 'Satoshi, Inter, "Segoe UI", sans-serif',
  color: "#988f86",
  margin: "0 0 18px",
  textAlign: "center" as const,
};

const footerText = {
  fontSize: "14px",
  fontWeight: "400",
  color: "#988f86",
  lineHeight: "24px",
  margin: "0",
  textAlign: "center" as const,
};

const footerLink = {
  color: "#7793e4",
  textDecoration: "none",
};
