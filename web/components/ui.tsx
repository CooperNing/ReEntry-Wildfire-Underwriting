// Small shared UI pieces.
import type { ReactNode } from "react";

export type DecisionKind = "accept" | "conditional" | "decline";

export const DECISION_META: Record<DecisionKind, { label: string; icon: string; cls: string; dot: string }> = {
  accept: { label: "Accept", icon: "✓", cls: "bg-accept-soft text-accept", dot: "var(--st-good)" },
  conditional: { label: "Accept with conditions", icon: "!", cls: "bg-cond-soft text-cond", dot: "var(--st-warn)" },
  decline: { label: "Decline", icon: "✕", cls: "bg-decline-soft text-decline", dot: "var(--st-crit)" },
};

export function DecisionBadge({ d, large }: { d: DecisionKind; large?: boolean }) {
  const m = DECISION_META[d];
  return (
    <span className={`inline-flex items-center gap-2 rounded-lg font-semibold ${m.cls} ${large ? "px-3 py-1.5 text-base" : "px-2 py-0.5 text-xs"}`}>
      <span aria-hidden className={`grid place-items-center rounded-full border border-current ${large ? "w-5 h-5 text-xs" : "w-3.5 h-3.5 text-[9px]"}`}>{m.icon}</span>
      {m.label}
    </span>
  );
}

export function Section({ n, title, children, aside }: { n?: string; title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="card p-5">
      <div className="flex items-center gap-2 mb-3">
        {n && <span className="w-6 h-6 rounded-full bg-ember-soft text-ember text-xs font-semibold grid place-items-center">{n}</span>}
        <h2 className="font-semibold">{title}</h2>
        {aside && <div className="ml-auto">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

export function Metric({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "ember" | "accept" | "decline" }) {
  const c = tone === "ember" ? "text-ember" : tone === "accept" ? "text-accept" : tone === "decline" ? "text-decline" : "";
  return (
    <div>
      <div className="label">{label}</div>
      <div className={`text-xl font-semibold num mt-0.5 ${c}`}>{value}</div>
      {sub && <div className="text-xs text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

export function Pill({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "ember" | "info" | "accept" | "decline" }) {
  const cls = {
    muted: "bg-surface-2 text-muted border border-line",
    ember: "bg-ember-soft text-ember",
    info: "bg-info-soft text-info",
    accept: "bg-accept-soft text-accept",
    decline: "bg-decline-soft text-decline",
  }[tone];
  return <span className={`inline-flex items-center text-[11px] px-1.5 py-0.5 rounded ${cls}`}>{children}</span>;
}

/** Minimal markdown for the memo: ## headings, bullets, bold. */
export function MiniMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) out.push(<ul key={`u${out.length}`} className="list-disc pl-5 space-y-1">{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>);
    list = [];
  };
  const inline = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => p.startsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : p);
  lines.forEach((l) => {
    if (/^\s*[-*] /.test(l)) { list.push(l.replace(/^\s*[-*] /, "")); return; }
    flush();
    if (l.startsWith("#")) out.push(<h3 key={out.length} className="font-semibold mt-3 first:mt-0">{l.replace(/^#+\s*/, "")}</h3>);
    else if (l.trim()) out.push(<p key={out.length}>{inline(l)}</p>);
  });
  flush();
  return <div className="space-y-2 text-sm leading-relaxed">{out}</div>;
}
