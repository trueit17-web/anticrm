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

  const avatarSrc = card ? fileUrl(card.avatarUrl) : null;

  return createPortal(
    <div ref={ref} className="employee-card" style={{ left: x, top: y }}>
      {loading && <p className="muted">Загрузка...</p>}
      {error && <p className="error-text">{error}</p>}
      {card && (
        <>
          <div className="employee-card-head">
            {avatarSrc ? (
              <img className="employee-card-avatar" src={avatarSrc} alt={card.fullName} />
            ) : (
              <div className="employee-card-avatar employee-card-avatar-placeholder" style={{ background: colorFor(card.fullName) }}>
                {initials(card.fullName)}
              </div>
            )}
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
  const [open, setOpen] = useState(false);
  const [card, setCard] = useState<UserCard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);

  function handleClick() {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
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

  return (
    <>
      <button type="button" className="employee-name-link" ref={buttonRef} onClick={handleClick}>
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
