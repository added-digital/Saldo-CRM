import { Text, Button } from '@react-email/components';
import { EmailLayout } from './layout';

interface WelcomeEmailProps {
  userName: string;
  systemName: string;
  dashboardUrl: string;
}

export function WelcomeEmail({ userName, systemName, dashboardUrl }: WelcomeEmailProps) {
  return (
    <EmailLayout previewText={`Welcome to ${systemName}`}>
      <Text style={heading}>Welcome to {systemName}</Text>
      <Text style={greeting}>Hi {userName},</Text>
      <Text style={paragraph}>
        We're excited to have you on board! {systemName} helps you manage customer
        relationships, track interactions, and grow your business with powerful
        integrations.
      </Text>
      <Text style={paragraph}>
        Get started by exploring your dashboard and connecting your integrations.
      </Text>
      <Button href={dashboardUrl} style={button}>
        Go to Dashboard
      </Button>
      <Text style={note}>
        If you have any questions, feel free to reach out to our support team.
      </Text>
    </EmailLayout>
  );
}

const heading = {
  fontSize: '24px',
  fontWeight: '700',
  color: '#1f2937',
  marginBottom: '24px',
  textAlign: 'center' as const,
};

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
  marginBottom: '16px',
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
  marginTop: '24px',
  marginBottom: '24px',
};

const note = {
  fontSize: '13px',
  color: '#6b7280',
  lineHeight: '20px',
  marginTop: '16px',
};
