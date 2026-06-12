/* global React */
// Inline SVG icons — minimal stroke set, 14px native
const I = {};
const Icon = ({ d, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);
I.Dashboard = () => <Icon d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 9h8V3h-8z" />;
I.Log = () => <Icon d="M4 4h16v16H4zM4 9h16M9 4v16" />;
I.Routine = () => <Icon d="M4 6h16M4 12h16M4 18h10" />;
I.Exercises = () => <Icon d="M6.5 6.5L17.5 17.5M4 8l4-4 4 4M12 16l4 4 4-4M2 12h4M18 12h4" />;
I.Body = () => <Icon d="M12 8a3 3 0 100-6 3 3 0 000 6zM6 22v-6l-2-2 2-6h12l2 6-2 2v6M9 12v10M15 12v10" />;
I.Export = () => <Icon d="M12 3v12M7 8l5-5 5 5M5 21h14" />;
I.Plan = () => <Icon d="M5 4h14v16H5zM9 4v16M5 9h14M5 14h14" />;
I.Recipe = () => <Icon d="M6 3v8M10 3v8M8 3v18M15 4a4 4 0 014 4v13M15 4v8h4" />;
I.Search = () => <Icon d="M10 17a7 7 0 100-14 7 7 0 000 14zM21 21l-6-6" />;
I.Plus = () => <Icon d="M12 5v14M5 12h14" />;
I.Chevron = () => <Icon d="M9 6l6 6-6 6" />;
I.ChevronDown = () => <Icon d="M6 9l6 6 6-6" />;
I.ChevronLeft = () => <Icon d="M15 6l-6 6 6 6" />;
I.ChevronUp = () => <Icon d="M6 15l6-6 6 6" />;
I.Calendar = () => <Icon d="M4 6h16v14H4zM4 10h16M8 4v4M16 4v4" />;
I.Clock = () => <Icon d="M12 22a10 10 0 100-20 10 10 0 000 20zM12 7v5l3 2" />;
I.Trend = () => <Icon d="M3 17l6-6 4 4 8-8M14 7h7v7" />;
I.X = () => <Icon d="M6 6l12 12M18 6L6 18" />;
I.Check = () => <Icon d="M4 12l5 5L20 6" />;
I.Star = () => <Icon d="M12 2l3 7 7 .5-5.5 4.5L18 22l-6-4-6 4 1.5-8L2 9.5l7-.5z" />;
I.Trophy = () => <Icon d="M8 21h8M12 17v4M7 3h10v5a5 5 0 01-10 0zM7 4H4v2a3 3 0 003 3M17 4h3v2a3 3 0 01-3 3" />;
I.Dots = () => <Icon d="M6 12h.01M12 12h.01M18 12h.01" />;
I.Menu = () => <Icon d="M4 7h16M4 12h16M4 17h16" />;
I.Settings = () => <Icon d="M12 15a3 3 0 100-6 3 3 0 000 6zM19 12a7 7 0 00-.1-1.2l2-1.5-2-3.5-2.4.9a7 7 0 00-2-1.2L14 3h-4l-.5 2.5a7 7 0 00-2 1.2L5 5.8 3 9.3l2 1.5a7 7 0 000 2.4l-2 1.5 2 3.5 2.4-.9a7 7 0 002 1.2L10 21h4l.5-2.5a7 7 0 002-1.2l2.4.9 2-3.5-2-1.5c.07-.4.1-.8.1-1.2z" />;
I.Download = () => <Icon d="M12 3v12M7 10l5 5 5-5M5 21h14" />;
I.Edit = () => <Icon d="M14 4l6 6L9 21H3v-6L14 4zM13 5l6 6" />;

window.RepsIcons = I;
