"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position="top-center"
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          success: "!bg-emerald-950/90 !border-emerald-500/30 !text-emerald-200 [&_svg]:!text-emerald-400",
          error: "!bg-red-950/90 !border-red-500/30 !text-red-200 [&_svg]:!text-red-400",
          warning: "!bg-amber-950/90 !border-amber-500/30 !text-amber-200 [&_svg]:!text-amber-400",
          info: "!bg-sky-950/90 !border-sky-500/30 !text-sky-200 [&_svg]:!text-sky-400",
          loading: "!bg-violet-950/90 !border-violet-500/30 !text-violet-200 [&_svg]:!text-violet-400",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
