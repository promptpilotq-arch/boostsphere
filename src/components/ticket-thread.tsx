import type { SupportMessage } from "@prisma/client";
import { cx, fmtDateTime } from "./ui";

export function TicketThread({ messages }: { messages: SupportMessage[] }) {
  return (
    <ul className="space-y-4">
      {messages.map((m) => (
        <li key={m.id} className={cx("max-w-[85%] rounded-2xl p-4 text-sm", m.authorRole === "STAFF" ? (m.internal ? "border border-amber-200 bg-amber-50" : "bg-brand/5") : "ml-auto bg-white ring-1 ring-slate-200")}>
          <p className="mb-1 text-xs font-semibold text-slate-500">
            {m.authorRole === "STAFF" ? (m.internal ? "Internal note" : "Support team") : m.authorRole === "GUEST" ? "Guest" : "Customer"} · {fmtDateTime(m.createdAt)}
          </p>
          <p className="whitespace-pre-wrap break-words text-slate-800">{m.body}</p>
        </li>
      ))}
    </ul>
  );
}
