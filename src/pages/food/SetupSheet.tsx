import { useState } from "react";
import { useStore } from "../../data/store";
import type { Food, FoodEntry } from "../../data/types";
import { fmtNum } from "../../lib/format";
import { proposeFoodSetup, setupCounts, setupWrites, type Decision, type SetupGroup, type SetupItem } from "../../lib/nutrition";
import { Sheet } from "../../ui/Sheet";
import { Switch } from "./ui";

const GROUPS: { key: SetupGroup; label: string; note?: string }[] = [
  { key: "plan", label: "From the plan", note: "Your usual day, plus dinner basics and fruit you already had." },
  { key: "dinner", label: "Your dinners", note: "Everything you logged as a dinner." },
  { key: "dinner-unlogged", label: "Other dinners in your list", note: "Not in your 2026 log. Switch on the ones you still eat." },
  { key: "duplicate", label: "Duplicates" },
  { key: "other", label: "Everything else" }
];

/**
 * One-time review: keep the plan's foods and your dinners, archive the rest. Opens only from the card on the Food page.
 * Archived foods stay in "Manage foods → Removed"; nothing is deleted. The whole step can be undone from the toast.
 */
export function SetupSheet({ foods, entries, onClose, onApplied }: {
  foods: Food[]; entries: FoodEntry[];
  onClose: () => void;
  onApplied: (text: string, undo: () => void) => void;
}) {
  const { local } = useStore();
  // Computed once when the sheet opens, so the list doesn't shift while you review it.
  const [items] = useState<SetupItem[]>(() => proposeFoodSetup(foods, entries));
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [busy, setBusy] = useState(false);
  const counts = setupCounts(items, decisions);
  const decide = (i: SetupItem) => decisions[i.key] ?? i.decision;
  const setMany = (list: SetupItem[], d: Decision) => setDecisions((x) => ({ ...x, ...Object.fromEntries(list.map((i) => [i.key, d])) }));

  async function apply() {
    setBusy(true);
    const { patches, creates } = setupWrites(items, decisions, foods, new Date().toISOString());
    const byId = new Map(foods.map((f) => [f.id, f]));
    const before = patches.map((p) => {
      const f = byId.get(p.id)!;
      return { id: f.id, archived: f.archived, favorite: f.favorite, legacy_ref: f.legacy_ref };
    });
    await local.save("foods", patches);
    const created = creates.length ? await local.save("foods", creates) : [];
    onApplied(`Kept ${counts.keep}, archived ${counts.archive}`, () => {
      void local.save("foods", before);
      if (created.length) void local.remove("foods", created.map((c) => c.id));
    });
    onClose();
  }

  return (
    <Sheet title="Set up your food list" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, margin: "0 4px" }}>
        <p className="num" style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.3 }}>
          Keep {counts.keep} <span className="muted" style={{ fontWeight: 500 }}>·</span> Archive {counts.archive}
        </p>
        <p className="row-sub">
          {counts.create > 0 && `${counts.create} new · `}
          Archived foods can be restored.
        </p>
      </div>

      {GROUPS.map((g) => {
        const list = items.filter((i) => i.group === g.key);
        if (!list.length) return null;
        const kept = list.filter((i) => decide(i) === "keep").length;
        return (
          <section className="section" key={g.key}>
            <div className="section-row" style={{ alignItems: "center" }}>
              <h3 className="section-label" style={{ margin: 0 }}>{g.label} <span className="num">{kept}/{list.length}</span></h3>
              <button className="btn btn-plain btn-sm" style={{ height: 44 }} onClick={() => setMany(list, kept === list.length ? "archive" : "keep")}>
                {kept === list.length ? "Archive all" : "Keep all"}
              </button>
            </div>
            {g.note && <p className="row-sub" style={{ margin: "-4px 4px 0" }}>{g.note}</p>}
            <div className="list">
              {list.map((i) => {
                const keep = decide(i) === "keep";
                return (
                  <div className="food-item" key={i.key} style={{ minHeight: 60 }}>
                    <div className="food-row-text" style={{ flex: 1, padding: "8px 0", opacity: keep ? 1 : 0.62 }}>
                      <span className="food-ellipsis" style={{ fontSize: 15 }}>
                        {i.name}
                        {i.draft && <span className="chip chip-accent" style={{ marginLeft: 8, height: 20, fontSize: 12 }}>New</span>}
                        {i.estimate && <span className="chip chip-warm" style={{ marginLeft: 6, height: 20, fontSize: 12 }}>Check label</span>}
                      </span>
                      <span className="row-sub food-ellipsis">
                        {i.serving} · <span className="num">{fmtNum(i.kcal, 0)}</span> kcal · <span className="num">{fmtNum(i.protein, 1)}</span> g protein
                      </span>
                      <span className="row-sub food-ellipsis">{i.reason}</span>
                    </div>
                    <Switch on={keep} label={`Keep ${i.name}`} onChange={(v) => setDecisions((x) => ({ ...x, [i.key]: v ? "keep" : "archive" }))} />
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      <div className="food-sticky">
        <button className="btn btn-primary btn-block" disabled={busy} onClick={() => void apply()}>
          Apply: keep {counts.keep}, archive {counts.archive}
        </button>
      </div>
    </Sheet>
  );
}
