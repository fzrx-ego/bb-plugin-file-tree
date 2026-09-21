import type { SVGProps } from "react";
import { cn } from "@/lib/utils";
import { fileTypeIcon, type FileGlyph } from "@/lib/file-type";

type SvgProps = SVGProps<SVGSVGElement>;

function Svg({ className, children, ...props }: SvgProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="1em"
      height="1em"
      fill="none"
      aria-hidden
      className={cn("shrink-0", className)}
      {...props}
    >
      {children}
    </svg>
  );
}

function Glyph({ glyph }: { glyph: FileGlyph }) {
  switch (glyph) {
    case "markdown":
      return (
        <>
          <path
            d="M3 2.5h7.2L13 5.3V13.5H3z"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <path
            d="M10.1 2.6v2.8H13"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <path
            d="M8 7.2v4.2M6.2 9.6 8 11.5l1.8-1.9"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      );
    case "json":
      return (
        <path
          d="M6 3.2c-1.6 0-2.2.9-2.2 2.1v1.1c0 .7-.5 1.1-1.3 1.2 1 .1 1.3.5 1.3 1.2v1.1c0 1.2.6 2.1 2.2 2.1M10 3.2c1.6 0 2.2.9 2.2 2.1v1.1c0 .7.5 1.1 1.3 1.2-1 .1-1.3.5-1.3 1.2v1.1c0 1.2-.6 2.1-2.2 2.1"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      );
    case "git":
      return (
        <path
          d="M11.6 7.3 8.7 4.4a.9.9 0 0 0-1.3 0L4.4 7.4a.9.9 0 0 0 0 1.3l2.9 2.9a.9.9 0 0 0 1.3 0l3-3a.9.9 0 0 0 0-1.3zM8 5.7v4.6M8 8.1l2.2-1.3"
          stroke="currentColor"
          strokeWidth="1.15"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      );
    case "config":
      return (
        <>
          <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.2" />
          <path
            d="M8 2.4v1.5M8 12.1v1.5M2.4 8h1.5M12.1 8h1.5M4.1 4.1l1.1 1.1M10.8 10.8l1.1 1.1M4.1 11.9l1.1-1.1M10.8 5.2l1.1-1.1"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </>
      );
    case "info":
      return (
        <>
          <circle cx="8" cy="8" r="5.2" stroke="currentColor" strokeWidth="1.2" />
          <path
            d="M8 7.2V11M8 5.2h.01"
            stroke="currentColor"
            strokeWidth="1.35"
            strokeLinecap="round"
          />
        </>
      );
    case "react":
      return (
        <>
          <circle cx="8" cy="8" r="1.15" fill="currentColor" />
          <ellipse
            cx="8"
            cy="8"
            rx="6.2"
            ry="2.35"
            stroke="currentColor"
            strokeWidth="1.05"
          />
          <ellipse
            cx="8"
            cy="8"
            rx="6.2"
            ry="2.35"
            transform="rotate(60 8 8)"
            stroke="currentColor"
            strokeWidth="1.05"
          />
          <ellipse
            cx="8"
            cy="8"
            rx="6.2"
            ry="2.35"
            transform="rotate(-60 8 8)"
            stroke="currentColor"
            strokeWidth="1.05"
          />
        </>
      );
    case "html":
      return (
        <path
          d="M5.2 4.5 2.6 8l2.6 3.5M10.8 4.5 13.4 8l-2.6 3.5"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    case "css":
      return (
        <path
          d="M4.4 4.8h7.2L10.8 13 8 13.8 5.2 13z"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      );
    case "image":
      return (
        <>
          <rect
            x="2.4"
            y="3.4"
            width="11.2"
            height="9.2"
            rx="1.2"
            stroke="currentColor"
            strokeWidth="1.2"
          />
          <circle cx="6" cy="6.6" r="1" fill="currentColor" />
          <path
            d="M3.4 11.2 6.6 8.4l2 2 2.2-2.4 2.4 3.2"
            stroke="currentColor"
            strokeWidth="1.15"
            strokeLinejoin="round"
          />
        </>
      );
    case "shell":
      return (
        <path
          d="M3.4 5.2 6.6 8 3.4 10.8M8.2 11.2H12.6"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    case "text":
      return (
        <>
          <path
            d="M3.2 2.6h7L12.8 5.2v8.2H3.2z"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <path
            d="M5.2 8h5.6M5.2 10.3h4.2"
            stroke="currentColor"
            strokeWidth="1.15"
            strokeLinecap="round"
          />
        </>
      );
    case "npm":
      return (
        <path
          d="M3.2 3.2h9.6v9.6H8.6V6.4H7.4v6.4H3.2z"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      );
    case "lock":
      return (
        <>
          <rect
            x="4"
            y="7.2"
            width="8"
            height="6"
            rx="1"
            stroke="currentColor"
            strokeWidth="1.2"
          />
          <path
            d="M5.8 7.2V5.6a2.2 2.2 0 0 1 4.4 0v1.6"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </>
      );
    case "code":
      return (
        <path
          d="M6 4.4 3.2 8 6 11.6M10 4.4 12.8 8 10 11.6"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    default:
      return (
        <>
          <path
            d="M4 2.4h5.4L12.2 5.2V13.6H4z"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <path
            d="M9.3 2.5v2.9h2.8"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        </>
      );
  }
}

export function FileTypeIcon({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const { glyph, color } = fileTypeIcon(name);
  return (
    <Svg className={className} style={{ color }}>
      <Glyph glyph={glyph} />
    </Svg>
  );
}
