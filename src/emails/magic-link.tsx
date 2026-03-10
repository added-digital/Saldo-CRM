import { Text, Button } from '@react-email/components';
import { EmailLayout } from './layout';

interface MagicLinkEmailProps {
  url: string;
}

export function MagicLinkEmail({ url }: MagicLinkEmailProps) {
  return (
    <EmailLayout previewText="Sign in to your account">
      <Text style={greeting}>Hello,</Text>
      <Text style={paragraph}>
        Click the button below to sign in to your account.
      </Text>
      <Button href={url} style={button}>
        Sign In
      </Button>
      <Text style={note}>
        This link expires in 24 hours.
      </Text>
      <Text style={note}>
        If you didn't request this, you can safely ignore this email.
      </Text>
    </EmailLayout>
  );
}

const greeting = {
  fontSize: '16px',
  fontWeight: '600',
  color: '#1f2937',
  marginBottom: '16px',
};

const paragraph = {
  fontSize: '14px',
  color: '#374151',
  lineHeight: '24px',
  marginBottom: '24px',
};

const button = {
  backgroundColor: '#4F46E5',
  borderRadius: '6px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: '600',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'block',
  padding: '12px 24px',
  marginBottom: '24px',
};

const note = {
  fontSize: '13px',
  color: '#6b7280',
  lineHeight: '20px',
  marginTop: '8px',
};
