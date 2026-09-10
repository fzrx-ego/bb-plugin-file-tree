import { useRef } from "react";
import {
  DEFAULT_RAIL_WIDTH_PX,
  getRailWidthPx,
  setRailWidthPx,
} from "@/lib/rail-width";

const KEYBOARD_STEP_PX = 16;

type Drag = { pointerId: number; startX: number; startWidthPx: number };

/**
 * The grab strip on the rail's inner border. The rail is a fixed overlay, so
 * the host's panel resizer never reaches it and the drag lives here.
 * Positioned against the rail `aside`, which is `fixed`.
 */
export function RailResizeHandle() {
  const dragRef = useRef<Drag | null>(null);

  const endDrag = (pointerId: number) => {
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== pointerId) return;
    dragRef.current = null;
    setRailWidthPx(getRailWidthPx(), { persist: true });
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize file tree"
      tabIndex={0}
      // Wider than the 1px border so it stays hittable, and centred on it.
      className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize touch-none select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        dragRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startWidthPx: getRailWidthPx(),
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        event.preventDefault();
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (drag === null || drag.pointerId !== event.pointerId) return;
        // The rail is pinned right, so dragging left widens it.
        setRailWidthPx(drag.startWidthPx + (drag.startX - event.clientX), {
          persist: false,
        });
      }}
      onPointerUp={(event) => endDrag(event.pointerId)}
      onPointerCancel={(event) => endDrag(event.pointerId)}
      onDoubleClick={() =>
        setRailWidthPx(DEFAULT_RAIL_WIDTH_PX, { persist: true })
      }
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          setRailWidthPx(getRailWidthPx() + KEYBOARD_STEP_PX, { persist: true });
          event.preventDefault();
          return;
        }
        if (event.key === "ArrowRight") {
          setRailWidthPx(getRailWidthPx() - KEYBOARD_STEP_PX, { persist: true });
          event.preventDefault();
        }
      }}
    />
  );
}
