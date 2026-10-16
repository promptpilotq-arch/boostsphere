import type { OrderEvent, OrderStatus } from "@prisma/client";
import { ORDER_STATUS_LABEL, ORDER_TIMELINE } from "@/lib/order-status";
import { cx, fmtDateTime } from "./ui";

/** Progress bar of the happy path plus the full event log. */
export function OrderTimeline({ status, events, showInternal = false }: { status: OrderStatus; events: OrderEvent[]; showInternal?: boolean }) {
  const reachedIdx = Math.max(...events.filter((e) => e.toStatus).map((e) => ORDER_TIMELINE.indexOf(e.toStatus!)), 0);
  const offPath = !ORDER_TIMELINE.includes(status);
  return (
    <div>
      <ol className="grid grid-cols-5 gap-1" aria-label="Order progress">
        {ORDER_TIMELINE.map((s, i) => {
          const done = i <= reachedIdx;
          const current = s === status;
          return (
            <li key={s} className="text-center" aria-current={current ? "step" : undefined}>
              <div className={cx("h-1.5 rounded-full", done ? "bg-gradient-to-r from-brand to-brand-accent" : "bg-slate-200")} />
              <p className={cx("mt-2 text-[11px] leading-tight sm:text-xs", current ? "font-semibold text-slate-900" : done ? "text-slate-700" : "text-slate-400")}>{ORDER_STATUS_LABEL[s]}</p>
            </li>
          );
        })}
      </ol>
      {offPath && <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">Current status: <strong>{ORDER_STATUS_LABEL[status]}</strong></p>}
      <ul className="mt-6 space-y-4 border-l border-slate-200 pl-5">
        {events
          .filter((e) => showInternal || !e.internal)
          .slice()
          .reverse()
          .map((e) => (
            <li key={e.id} className="relative">
              <span className={cx("absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-white", e.internal ? "bg-amber-400" : e.toStatus ? "bg-brand" : "bg-slate-300")} aria-hidden />
              <p className="text-sm font-medium text-slate-900">
                {e.toStatus ? ORDER_STATUS_LABEL[e.toStatus] : e.type === "EVIDENCE" ? "Completion evidence added" : e.type === "INFO_PROVIDED" ? "You provided information" : e.internal ? "Internal note" : "Update"}
                {e.internal && <span className="ml-2 text-xs font-normal text-amber-700">(staff only)</span>}
              </p>
              {e.message && <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-slate-600">{e.message}</p>}
              <p className="mt-0.5 text-xs text-slate-400">
                {fmtDateTime(e.createdAt)} · {e.actorType.toLowerCase()}
              </p>
            </li>
          ))}
      </ul>
    </div>
  );
}
