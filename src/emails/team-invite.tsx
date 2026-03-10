import { Text, Button } from '@react-email/components';
import { EmailLayout } from './layout';

interface TeamInviteEmailProps {
  userName: string;
  teamName: string;
  invitedBy: string;
  dashboardUrl: string;
}

export function TeamInviteEmail({
  userName,
  teamName,
  invitedBy,
  dashboardUrl,
}: TeamInviteEmailProps) {
  return (
    <EmailLayout previewText={`You've been added to ${teamName}`}>
      <Text style={heading}>You've been added to a team</Text>
      <Text style={greeting}>Hi {userName},</Text>
      <Text style={paragraph}>
        {invitedBy} has added you to <strong>{teamName}</strong>.
      </Text>
      <Text style={paragraph}>
        You now have access to collaborate with your team members and share customer
        data within your organization.
      </Text>
      <Button href={dashboardUrl} style={button}>
        Go to Dashboard
      </Button>
      <Text style={note}>
        If you believe this was sent in error, please contact your administrator.
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
