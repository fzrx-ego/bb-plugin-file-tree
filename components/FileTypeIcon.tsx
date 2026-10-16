import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { fileTypeIcon } from "@/lib/file-type";
import { SETI_FONT_WOFF_BASE64 } from "@/lib/seti-icons.generated";

const SETI_CLASS = "bb-plugin-file-tree-seti";

let stylesInstalled = false;

/** One `@font-face` for the Seti font, and its glyph colors for BB's light and dark themes. */
function installSetiStyles(): void {
  if (stylesInstalled) return;
  stylesInstalled = true;
  const style = document.createElement("style");
  style.dataset.bbPluginFileTree = "seti";
  style.textContent = `@font-face{font-family:"${SETI_CLASS}";src:url(data:font/woff;base64,${SETI_FONT_WOFF_BASE64}) format("woff");font-display:block}`
    + `.${SETI_CLASS}{font-family:"${SETI_CLASS}";font-size:150%;line-height:1;color:var(--seti-light)}`
    + `:where(.dark) .${SETI_CLASS}{color:var(--seti-dark)}`;
  document.head.append(style);
}

export function FileTypeIcon({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  installSetiStyles();
  const { glyph, color, lightColor } = fileTypeIcon(name);
  return (
    <span
      aria-hidden
      className={cn(SETI_CLASS, "inline-flex shrink-0 items-center justify-center", className)}
      style={{ "--seti-dark": color, "--seti-light": lightColor } as CSSProperties}
    >
      {glyph}
    </span>
  );
}
