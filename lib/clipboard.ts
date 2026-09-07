import { toast } from "sonner";

/**
 * `navigator.clipboard` needs a secure context and can still be refused, so
 * fall back to the legacy path rather than failing silently.
 */
function legacyCopy(text: string): boolean {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.cssText = "position:fixed;top:0;left:-9999px;opacity:0";
  document.body.appendChild(area);
  try {
    area.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

export async function copyText(text: string, successMessage: string): Promise<void> {
  if (text === "") return;
  try {
    await navigator.clipboard.writeText(text);
    toast.success(successMessage);
    return;
  } catch {
    /* fall through to the legacy path */
  }
  if (legacyCopy(text)) {
    toast.success(successMessage);
    return;
  }
  toast.error("Could not copy to the clipboard.");
}
