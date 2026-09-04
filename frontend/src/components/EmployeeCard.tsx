import { useEffect, useId, useRef, useState } from "react";
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
// medal wreath, rather than a fully closed ring. A denser, slightly wider
// FRONT layer plus a muted, larger-radius BACK layer behind it is what
// turns a single thin row of leaves into a full, bushy branch with real
// depth — the same trick as layering foliage in illustration.
const WREATH_LEAVES = laurelBranch(15, -76, 74, 11);
const WREATH_LEAVES_BACK = laurelBranch(17.3, -72, 70, 7);

function WreathLeaf({
  x,
  y,
  rotate,
  scale,
  fill,
  rim,
  muted,
}: {
  x: number;
  y: number;
  rotate: number;
  scale: number;
  fill: string;
  rim: string;
  // Back-layer leaves skip the bright rim highlight and sit at reduced
  // opacity, reading as "in shadow" behind the front branch.
  muted?: boolean;
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate})`} opacity={muted ? 0.62 : 1}>
      {/* A pointed (lanceolate) leaf with a center vein reads as real laurel
          foliage far better than a plain ellipse; the rim-light sliver is
          what sells "polished metal" rather than a flat cutout. */}
      <path
        d={`M0,${-3.2 * scale} Q${1.4 * scale},${-1.5 * scale} ${1.2 * scale},0 Q${1.4 * scale},${1.5 * scale} 0,${3.2 * scale} Q${-1.4 * scale},${1.5 * scale} ${-1.2 * scale},0 Q${-1.4 * scale},${-1.5 * scale} 0,${-3.2 * scale} Z`}
        fill={fill}
        stroke={rim}
        strokeWidth={0.16}
        strokeOpacity={muted ? 0.25 : 0.5}
      />
      {!muted && (
        <>
          <line x1={0} y1={-2.7 * scale} x2={0} y2={2.7 * scale} stroke={rim} strokeWidth={0.15} strokeOpacity={0.35} />
          <ellipse cx={0.6 * scale} cy={-0.9 * scale} rx={0.55 * scale} ry={1.15 * scale} fill={rim} fillOpacity={0.55} />
        </>
      )}
    </g>
  );
}

// A pair of small berries tucked at the base of each branch, next to the
// ribbon-free stars gap — the detail real laurel-medal art almost always
// includes and the one thing most reads as "hand-finished" rather than
// procedural.
function WreathBerries({ side, fill, rim }: { side: 1 | -1; fill: string; rim: string }) {
  const x = 14.2 * side;
  return (
    <g>
      <circle cx={x} cy={9.4} r={1.05} fill={fill} stroke={rim} strokeWidth={0.2} strokeOpacity={0.5} />
      <circle cx={x + 1.3 * side} cy={11.4} r={0.85} fill={fill} stroke={rim} strokeWidth={0.18} strokeOpacity={0.5} />
    </g>
  );
}

// A small three-point crown sitting in the gap at the top of the wreath —
// built from a zigzag polygon plus a band, not a traced illustration. The
// thin outline pass underneath is what gives it a cast/engraved edge
// instead of a flat sticker look.
function Crown({ fill, highlight }: { fill: string; highlight: string }) {
  return (
    <g transform="translate(0 -18.5)">
      <polygon
        points="-6,3.4 -6,-1.6 -3,1.2 0,-3.6 3,1.2 6,-1.6 6,3.4"
        fill={fill}
        stroke={highlight}
        strokeWidth={0.22}
        strokeOpacity={0.4}
      />
      <rect x={-6.3} y={3} width={12.6} height={2.2} rx={0.6} fill={fill} stroke={highlight} strokeWidth={0.2} strokeOpacity={0.4} />
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

function Wreath({ rank, base, highlight, shadow }: { rank: 1 | 2 | 3; base: string; highlight: string; shadow: string }) {
  const gradId = useId();
  const leafFill = `url(#${gradId}-leaf)`;
  const crownFill = `url(#${gradId}-crown)`;

  return (
    <svg
      className={`week-leader-wreath${rank === 1 ? " week-leader-wreath-gold" : ""}`}
      viewBox="-20 -22 40 42"
      aria-hidden="true"
      style={{ ["--wreath-glow" as string]: shadow }}
    >
      <defs>
        {/* Top-left highlight fading to the base tone — the same trick real
            medal metal photography relies on for a convincingly "cast" look,
            rather than a single flat fill. */}
        <linearGradient id={`${gradId}-leaf`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={highlight} />
          <stop offset="55%" stopColor={base} />
          <stop offset="100%" stopColor={base} />
        </linearGradient>
        <linearGradient id={`${gradId}-crown`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={highlight} />
          <stop offset="100%" stopColor={base} />
        </linearGradient>
      </defs>
      <g>
        {WREATH_LEAVES_BACK.map((l, i) => (
          <WreathLeaf key={i} x={l.x} y={l.y} rotate={l.rotate} scale={l.scale} fill={base} rim={highlight} muted />
        ))}
        {WREATH_LEAVES.map((l, i) => (
          <WreathLeaf key={i} x={l.x} y={l.y} rotate={l.rotate} scale={l.scale} fill={leafFill} rim={highlight} />
        ))}
        <WreathBerries side={1} fill={leafFill} rim={highlight} />
      </g>
      <g transform="scale(-1,1)">
        {WREATH_LEAVES_BACK.map((l, i) => (
          <WreathLeaf key={i} x={l.x} y={l.y} rotate={l.rotate} scale={l.scale} fill={base} rim={highlight} muted />
        ))}
        {WREATH_LEAVES.map((l, i) => (
          <WreathLeaf key={i} x={l.x} y={l.y} rotate={l.rotate} scale={l.scale} fill={leafFill} rim={highlight} />
        ))}
        <WreathBerries side={1} fill={leafFill} rim={highlight} />
      </g>
      <Crown fill={crownFill} highlight={highlight} />
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
// used by the "top of the week" header widget. 4th/5th get a plain smaller
// ring with no laurel wreath (that's reserved for the podium). Clicking it
// opens the same employee card as the name links everywhere else.
const WREATH_COLORS: Record<1 | 2 | 3, { base: string; highlight: string; shadow: string }> = {
  1: { base: "#c8952f", highlight: "#f3d691", shadow: "rgba(226, 173, 62, 0.65)" },
  2: { base: "#9aa1a8", highlight: "#eef1f4", shadow: "rgba(180, 188, 196, 0.55)" },
  3: { base: "#b5776a", highlight: "#eecabb", shadow: "rgba(197, 145, 127, 0.55)" },
};

function isPodiumRank(rank: 1 | 2 | 3 | 4 | 5): rank is 1 | 2 | 3 {
  return rank <= 3;
}

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
  rank: 1 | 2 | 3 | 4 | 5;
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
          {isPodiumRank(rank) && (
            <Wreath
              rank={rank}
              base={WREATH_COLORS[rank].base}
              highlight={WREATH_COLORS[rank].highlight}
              shadow={WREATH_COLORS[rank].shadow}
            />
          )}
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
