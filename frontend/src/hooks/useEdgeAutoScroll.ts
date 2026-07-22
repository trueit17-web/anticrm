import { RefObject, useEffect, useRef } from "react";

const EDGE_ZONE = 80; // px from the screen edge that triggers scrolling
const MAX_SPEED = 18; // px per animation frame right at the edge

// Lets a wide horizontally-scrollable table (doesn't fully fit on small
// monitors) be panned by moving the mouse toward the left/right edge of the
// screen, instead of only via a horizontal scrollbar drag. Active while the
// cursor is vertically within the container and horizontally near either
// screen edge; speed ramps up the closer the cursor gets to the edge.
export function useEdgeAutoScroll(ref: RefObject<HTMLElement | null>) {
  const speedRef = useRef(0);

  useEffect(() => {
    let frame: number;

    function tick() {
      const el = ref.current;
      if (el && speedRef.current !== 0) {
        el.scrollLeft += speedRef.current;
      }
      frame = requestAnimationFrame(tick);
    }

    function handleMouseMove(e: MouseEvent) {
      const el = ref.current;
      if (!el || el.scrollWidth <= el.clientWidth) {
        speedRef.current = 0;
        return;
      }

      const rect = el.getBoundingClientRect();
      const withinRows = e.clientY >= rect.top && e.clientY <= rect.bottom;
      if (!withinRows) {
        speedRef.current = 0;
        return;
      }

      const distanceFromLeft = e.clientX;
      const distanceFromRight = window.innerWidth - e.clientX;

      if (distanceFromLeft < EDGE_ZONE) {
        speedRef.current = -MAX_SPEED * (1 - distanceFromLeft / EDGE_ZONE);
      } else if (distanceFromRight < EDGE_ZONE) {
        speedRef.current = MAX_SPEED * (1 - distanceFromRight / EDGE_ZONE);
      } else {
        speedRef.current = 0;
      }
    }

    function stop() {
      speedRef.current = 0;
    }

    window.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseleave", stop);
    frame = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseleave", stop);
      cancelAnimationFrame(frame);
    };
  }, [ref]);
}
