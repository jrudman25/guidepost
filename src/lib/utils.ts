import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { toast } from "sonner"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export async function handleApiError(response: Response, defaultMessage: string = "Request failed") {
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || defaultMessage);
  }
}

/**
 * Return the URL only if it uses http(s), otherwise null.
 * Guards against javascript:/data: schemes in scraped or user-entered URLs.
 */
export function safeHttpUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

export function toastApiError(e: unknown, defaultMessage: string) {
  if (e instanceof Error) {
    if (e.message.includes("Demo Account")) {
      toast.info(e.message);
      return;
    }
    toast.error(e.message);
    return;
  }
  toast.error(defaultMessage);
}
