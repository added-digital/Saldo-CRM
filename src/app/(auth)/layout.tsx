import Image from "next/image"
import { system } from "@/config/system"

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center space-y-2">
          <Image
            src={system.logoMark}
            alt={system.name}
            width={48}
            height={48}
            className="size-12"
            priority
          />
          <h1 className="text-xl font-semibold tracking-tight">
            {system.name}
          </h1>
        </div>
        {children}
      </div>
    </div>
  )
}
