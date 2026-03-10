import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Img,
  Hr,
} from "@react-email/components";

interface EmailLayoutProps {
  children: React.ReactNode;
  previewText?: string;
}

export function EmailLayout({ children, previewText }: EmailLayoutProps) {
  return (
    <Html>
      <Head>
        {previewText && <meta name="preview" content={previewText} />}
      </Head>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Img
              src="/brand/company_logo.png"
              width="150"
              height="50"
              alt="Company Logo"
              style={logo}
            />
            <Text style={systemName}>Saldo CRM</Text>
          </Section>
          <Hr style={hr} />
          <Section style={content}>{children}</Section>
          <Hr style={hr} />
          <Section style={footer}>
            <Text style={footerText}>
              © 2026 Saldo CRM. All rights reserved.
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
