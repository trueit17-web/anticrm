import { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base: IconProps = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export function IconStats(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 20h18" />
      <path d="M6 20v-8" />
      <path d="M12 20V5" />
      <path d="M18 20v-11" />
    </svg>
  );
}

export function IconAdmin(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3M12 18.5v3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M2 12h3M19 12h3M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1" />
    </svg>
  );
}

export function IconUsers(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20c0-3.6 2.5-6.5 5.5-6.5s5.5 2.9 5.5 6.5" />
      <circle cx="17" cy="8.5" r="2.3" />
      <path d="M15.2 13.7c2.5.5 4.3 2.8 4.3 5.8" />
    </svg>
  );
}

// A torii gate — the shrine-gate silhouette, standing in for "branch office".
export function IconTorii(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M2 6.6c3.1-1.5 6.6-2.2 10-2.2s6.9.7 10 2.2" />
      <path d="M4 9.6h16" />
      <path d="M6.2 6.2v13.6M17.8 6.2v13.6" />
      <path d="M4.4 9.6l-1 2M19.6 9.6l1 2" />
    </svg>
  );
}

export function IconLogout(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M13.5 4H6.8a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h6.7" />
      <path d="M9.5 12h10.5M17 8.2l3.8 3.8-3.8 3.8" />
    </svg>
  );
}

export function IconBack(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M19 12H5M11 5.5 4.5 12l6.5 6.5" />
    </svg>
  );
}

export function IconEdit(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z" />
      <path d="M13.5 8 16 10.5" />
    </svg>
  );
}

export function IconKey(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12 19.5 3.5" />
      <path d="M16 7l2.5 2.5M19 4l2 2" />
    </svg>
  );
}

export function IconTrash(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 7h16" />
      <path d="M9 7V4.8c0-.4.4-.8.9-.8h4.2c.5 0 .9.4.9.8V7" />
      <path d="M6 7l1 12.2c0 .95.8 1.8 1.8 1.8h6.4c1 0 1.8-.85 1.8-1.8L18 7" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

// A counter-clockwise arrow — "bring this back" for restoring a deleted row.
export function IconRestore(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 12a8 8 0 1 0 3-6.2" />
      <path d="M4 4v4.5h4.5" />
    </svg>
  );
}

// A handset — the "Прозвон" (cold-call queue) nav link.
export function IconPhone(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 4.5h3.2l1.3 4-2 1.4a10.5 10.5 0 0 0 5.6 5.6l1.4-2 4 1.3V18a1.5 1.5 0 0 1-1.6 1.5A15.5 15.5 0 0 1 3.5 6.1 1.5 1.5 0 0 1 5 4.5z" />
    </svg>
  );
}

// A stack of discs — the "Базы" (uploaded client bases) nav link.
export function IconDatabase(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <ellipse cx="12" cy="5.5" rx="7" ry="2.5" />
      <path d="M5 5.5V12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V5.5" />
      <path d="M5 12v6.5c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V12" />
    </svg>
  );
}
