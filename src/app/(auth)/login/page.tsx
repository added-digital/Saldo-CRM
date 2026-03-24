"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { system } from "@/config/system";

function MicrosoftIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 21 21"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}

function LoginHandler() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const urlError = searchParams.get("error");
    if (urlError === "auth_failed" || urlError === "confirmation_failed") {
      setError("Authentication failed. Please try again.");
    }
  }, [searchParams]);

  async function handleMicrosoftLogin() {
    setLoading(true);
    setError(null);

    const supabase = createClient();

    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "azure",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: "openid profile email User.Read Mail.Read",
      },
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle>Sign in to {system.shortName}</CardTitle>
        <CardDescription>
          Use your Microsoft account to continue
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <p className="text-center text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <Button
          className="w-full"
          variant="outline"
          onClick={handleMicrosoftLogin}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <MicrosoftIcon className="size-4" />
          )}
          {loading ? "Redirecting..." : "Continue with Microsoft"}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <React.Suspense
      fallback={
        <Card>
          <CardHeader className="text-center">
            <CardTitle>Sign in to {system.shortName}</CardTitle>
          </CardHeader>
          <CardContent>
            <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      }
    >
      <LoginHandler />
    </React.Suspense>
  );
}
