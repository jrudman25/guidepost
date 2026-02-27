import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export async function handleApiError(response: Response, defaultMessage: string = "Request failed") {
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || defaultMessage);
  }
}

export function toastApiError(e: unknown, defaultMessage: string) {
  import("sonner").then(({ toast }) => {
    if (e instanceof Error) {
      if (e.message.includes("Demo Account")) {
        toast.info(e.message);
        return;
      }
      toast.error(e.message);
      return;
    }
    toast.error(defaultMessage);
  });
}
