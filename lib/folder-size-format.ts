import type { FolderSize } from "../contract";

export function folderSizeLabel(size: FolderSize): { text: string; title: string } | null {
  if (size.state === "pending") return { text: "…", title: "Размер папки считается в фоне" };
  if (size.state === "unavailable") return { text: "?", title: "Размер папки недоступен" };
  if (size.state !== "ready") return null;
  const bytes = size.kib * 1024;
  const magnitude = Math.min(4, Math.max(1, Math.floor(Math.log10(bytes || 1) / 3)));
  const value = bytes / (1000 ** magnitude);
  const amount = value.toLocaleString("ru-RU", { maximumFractionDigits: magnitude === 1 ? 0 : 1 });
  const text = `${amount} ${["", "КБ", "МБ", "ГБ", "ТБ"][magnitude]}`;
  return { text, title: `Размер на диске: ${text}${size.stale ? " (обновляется)" : ""}` };
}
