import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, ApiError, fileUrl } from "../api/client";
import { UserCard } from "../types";

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

// Deterministic-ish color from the name so the same person always gets the
// same placeholder color across the app.
function colorFor(fullName: string): string {
  const palette = ["#c39a4f", "#5b8def", "#4fae7d", "#d6667f", "#8a6fd6", "#3fa8c9"];
  let hash = 0;
  for (let i = 0; i < fullName.length; i++) hash = (hash * 31 + fullName.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}

function telegramHref(handle: string): string {
  const clean = handle.trim().replace(/^@/, "");
  return `https://t.me/${clean}`;
}

// One laurel branch as leaf placements along an arc (radius/angle in a unit
// circle) — mirrored via an SVG transform for the other side, so there's no
// hand-authored path data, just a formula repeated over a small leaf shape.
function laurelBranch(radius: number, startDeg: number, endDeg: number, count: number) {
  return Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? 0 : i / (count - 1);
    const deg = startDeg + (endDeg - startDeg) * t;
    const rad = (deg * Math.PI) / 180;
    const scale = 0.62 + 0.5 * t;
    return {
      x: radius * Math.cos(rad),
      y: radius * Math.sin(rad),
      rotate: deg + 108,
      scale,
    };
  });
}

// Two gaps left open — top (crown) and bottom (stars) — like a classic
// medal wreath, rather than a fully closed ring.
const WREATH_LEAVES = laurelBranch(15, -70, 68, 8);

function WreathLeaf({
  x,
  y,
  rotate,
  scale,
  base,
  highlight,
}: {
  x: number;
  y: number;
  rotate: number;
  scale: number;
  base: string;
  highlight: string;
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate})`}>
      <ellipse cx={0} cy={0} rx={2.5 * scale} ry={1.05 * scale} fill={base} />
      <ellipse cx={0.5 * scale} cy={-0.15 * scale} rx={1.3 * scale} ry={0.45 * scale} fill={highlight} />
    </g>
  );
}

// A small three-point crown sitting in the gap at the top of the wreath —
// built from a zigzag polygon plus a band, not a traced illustration.
function Crown({ base, highlight }: { base: string; highlight: string }) {
  return (
    <g transform="translate(0 -18.5)">
      <polygon points="-6,3.4 -6,-1.6 -3,1.2 0,-3.6 3,1.2 6,-1.6 6,3.4" fill={base} />
      <rect x={-6.3} y={3} width={12.6} height={2.2} rx={0.6} fill={base} />
      <circle cx={-3} cy={-0.9} r={0.85} fill={highlight} />
      <circle cx={0} cy={-2.9} r={0.95} fill={highlight} />
      <circle cx={3} cy={-0.9} r={0.85} fill={highlight} />
    </g>
  );
}

// Five-point stars from a polar formula, not hand-traced coordinates.
function starPoints(cx: number, cy: number, outerR: number, innerR: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
  }
  return pts.join(" ");
}

function Stars({ color }: { color: string }) {
  return (
    <g fill={color}>
      <polygon points={starPoints(-4.6, 16.4, 1.7, 0.72)} />
      <polygon points={starPoints(0, 17.6, 2.05, 0.88)} />
      <polygon points={starPoints(4.6, 16.4, 1.7, 0.72)} />
    </g>
  );
}

function Wreath({ base, highlight }: { base: string; highlight: string }) {
  return (
    <svg className="week-leader-wreath" viewBox="-20 -22 40 42" aria-hidden="true">
      <g>
        {WREATH_LEAVES.map((l, i) => (
          <WreathLeaf key={i} x={l.x} y={l.y} rotate={l.rotate} scale={l.scale} base={base} highlight={highlight} />
        ))}
      </g>
      <g transform="scale(-1,1)">
        {WREATH_LEAVES.map((l, i) => (
          <WreathLeaf key={i} x={l.x} y={l.y} rotate={l.rotate} scale={l.scale} base={base} highlight={highlight} />
        ))}
      </g>
      <Crown base={base} highlight={highlight} />
      <Stars color={base} />
    </svg>
  );
}

function EmployeeAvatar({
  fullName,
  avatarUrl,
  className,
}: {
  fullName: string;
  avatarUrl: string | null | undefined;
  className?: string;
}) {
  const src = fileUrl(avatarUrl);
  if (src) {
    return <img className={className} src={src} alt={fullName} />;
  }
  return (
    <div className={className} style={{ background: colorFor(fullName) }}>
      {initials(fullName)}
    </div>
  );
}

// Shared "click a trigger, fetch /users/:id/card, show a popover near it"
// behavior — used both by the plain name link and the ranked avatar button.
function useEmployeeCard(id: number) {
  const [open, setOpen] = useState(false);
  const [card, setCard] = useState<UserCard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);

  function handleClick() {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const cardWidth = 280;
      const x = Math.min(rect.left, window.innerWidth - cardWidth - 12);
      setPos({ x: Math.max(8, x), y: rect.bottom + 6 });
    }
    setOpen(true);
    setLoading(true);
    setError(null);
    api
      .get<{ card: UserCard }>(`/users/${id}/card`)
      .then((res) => setCard(res.card))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Не удалось загрузить"))
      .finally(() => setLoading(false));
  }

  return { open, setOpen, card, loading, error, pos, triggerRef, handleClick };
}

function EmployeeCardPopover({
  card,
  loading,
  error,
  x,
  y,
  onClose,
}: {
  card: UserCard | null;
  loading: boolean;
  error: string | null;
  x: number;
  y: number;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function handleScroll() {
      onClose();
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [onClose]);

  return createPortal(
    <div ref={ref} className="employee-card" style={{ left: x, top: y }}>
      {loading && <p className="muted">Загрузка...</p>}
      {error && <p className="error-text">{error}</p>}
      {card && (
        <>
          <div className="employee-card-head">
            <EmployeeAvatar className="employee-card-avatar" fullName={card.fullName} avatarUrl={card.avatarUrl} />
            <div>
              <div className="employee-card-name">{card.fullName}</div>
              {card.telegram && (
                <a
                  className="employee-card-telegram"
                  href={telegramHref(card.telegram)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {card.telegram.startsWith("@") ? card.telegram : `@${card.telegram}`}
                </a>
              )}
            </div>
          </div>

          <div className="employee-card-stats">
            <div>
              <span className="employee-card-stat-value">{card.stats.today}</span>
              <span className="muted">Сегодня</span>
            </div>
            <div>
              <span className="employee-card-stat-value">{card.stats.week}</span>
              <span className="muted">За неделю</span>
            </div>
            <div>
              <span className="employee-card-stat-value">{card.stats.total}</span>
              <span className="muted">Всего</span>
            </div>
          </div>

          {card.bio && <p className="employee-card-bio">{card.bio}</p>}
        </>
      )}
    </div>,
    document.body
  );
}

export function EmployeeNameButton({ id, fullName }: { id: number; fullName: string }) {
  const { open, setOpen, card, loading, error, pos, triggerRef, handleClick } = useEmployeeCard(id);

  return (
    <>
      <button type="button" className="employee-name-link" ref={triggerRef} onClick={handleClick}>
        {fullName}
      </button>
      {open && (
        <EmployeeCardPopover
          card={card}
          loading={loading}
          error={error}
          x={pos.x}
          y={pos.y}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// Avatar with a rank-colored ring — 1st place gold, 2nd silver, 3rd plain —
// used by the "top of the week" header widget. Clicking it opens the same
// employee card as the name links everywhere else.
const WREATH_COLORS: Record<1 | 2 | 3, { base: string; highlight: string }> = {
  1: { base: "#c8952f", highlight: "#f3d691" },
  2: { base: "#9aa1a8", highlight: "#eef1f4" },
  3: { base: "#b5776a", highlight: "#eecabb" },
};

export function EmployeeAvatarButton({
  id,
  fullName,
  avatarUrl,
  count,
  rank,
}: {
  id: number;
  fullName: string;
  avatarUrl: string | null;
  count: number;
  rank: 1 | 2 | 3;
}) {
  const { open, setOpen, card, loading, error, pos, triggerRef, handleClick } = useEmployeeCard(id);

  return (
    <>
      <button
        type="button"
        className={`week-leader rank-${rank}`}
        ref={triggerRef}
        onClick={handleClick}
        title={`${fullName} — ${count} ${count === 1 ? "трубка" : "трубок"} за неделю`}
      >
        <span className="week-leader-ring">
          <EmployeeAvatar className="week-leader-avatar" fullName={fullName} avatarUrl={avatarUrl} />
          <Wreath base={WREATH_COLORS[rank].base} highlight={WREATH_COLORS[rank].highlight} />
          <span className="week-leader-rank">{rank}</span>
        </span>
      </button>
      {open && (
        <EmployeeCardPopover
          card={card}
          loading={loading}
          error={error}
          x={pos.x}
          y={pos.y}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
