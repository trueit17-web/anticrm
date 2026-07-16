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
    const scale = 0.68 + 0.4 * t;
    return {
      x: radius * Math.cos(rad),
      y: radius * Math.sin(rad),
      rotate: deg + 112,
      scale,
    };
  });
}

// Bottom-heavy arc with a gap at the top, like a medal wreath — leaves run
// from just past the sides down to meet at the bottom.
const WREATH_LEAVES = laurelBranch(15, -58, 92, 6);

function Wreath({ color }: { color: string }) {
  return (
    <svg className="week-leader-wreath" viewBox="-19 -19 38 38" aria-hidden="true">
      <g fill={color}>
        {WREATH_LEAVES.map((l, i) => (
          <ellipse
            key={i}
            cx={0}
            cy={0}
            rx={2.6 * l.scale}
            ry={1.15 * l.scale}
            transform={`translate(${l.x} ${l.y}) rotate(${l.rotate})`}
          />
        ))}
      </g>
      <g fill={color} transform="scale(-1,1)">
        {WREATH_LEAVES.map((l, i) => (
          <ellipse
            key={i}
            cx={0}
            cy={0}
            rx={2.6 * l.scale}
            ry={1.15 * l.scale}
            transform={`translate(${l.x} ${l.y}) rotate(${l.rotate})`}
          />
        ))}
      </g>
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
          {rank <= 2 && <Wreath color={rank === 1 ? "#d9b154" : "#c0c7cf"} />}
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
