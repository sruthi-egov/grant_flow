import { cn } from "@/lib/utils";
import {
  format, parseISO, isSameMonth, isSameDay, isToday,
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
} from "date-fns";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const TYPE_BADGE = {
  milestone: "bg-blue-100 text-blue-700",
  reporting: "bg-purple-100 text-purple-700",
  payment: "bg-green-100 text-green-700",
  mou: "bg-amber-100 text-amber-700",
};

const TYPE_DOT = {
  milestone: "bg-blue-500",
  reporting: "bg-purple-500",
  payment: "bg-green-500",
  mou: "bg-amber-500",
};

export default function MonthCalendar({ month, events, selectedDate, onSelectDate }) {
  const gridStart = startOfWeek(startOfMonth(month));
  const gridEnd = endOfWeek(endOfMonth(month));
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const eventsByDate = {};
  events.forEach(e => {
    if (!e.date) return;
    let parsed;
    try { parsed = parseISO(e.date); } catch { return; }
    if (isNaN(parsed)) return;
    const key = format(parsed, "yyyy-MM-dd");
    if (!eventsByDate[key]) eventsByDate[key] = [];
    eventsByDate[key].push(e);
  });

  return (
    <div className="border rounded-lg overflow-hidden bg-card">
      <div className="grid grid-cols-7 border-b bg-muted/50">
        {WEEKDAYS.map(d => (
          <div key={d} className="text-center py-2 text-xs font-semibold text-muted-foreground">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map(day => {
          const key = format(day, "yyyy-MM-dd");
          const dayEvents = eventsByDate[key] || [];
          const inMonth = isSameMonth(day, month);
          const isSelected = isSameDay(day, selectedDate);
          const isTodayDate = isToday(day);

          return (
            <button
              key={key}
              onClick={() => onSelectDate(day)}
              className={cn(
                "min-h-[80px] sm:min-h-[100px] p-1.5 border-b border-r text-left align-top transition-colors",
                !inMonth && "bg-muted/30 text-muted-foreground/40",
                isSelected ? "bg-primary/10 ring-1 ring-primary" : "hover:bg-muted/40",
              )}
            >
              <div className="flex items-center justify-between">
                <span className={cn(
                  "inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium",
                  isTodayDate && "bg-primary text-primary-foreground",
                )}>
                  {format(day, "d")}
                </span>
                {dayEvents.length > 0 && (
                  <span className="flex gap-0.5">
                    {dayEvents.slice(0, 4).map((e, i) => (
                      <span key={i} className={cn("w-1.5 h-1.5 rounded-full", TYPE_DOT[e.type])} />
                    ))}
                  </span>
                )}
              </div>
              <div className="mt-1 space-y-0.5">
                {dayEvents.slice(0, 3).map((e, i) => (
                  <div key={i} className={cn("text-[10px] leading-tight px-1 py-0.5 rounded truncate font-medium", TYPE_BADGE[e.type])}>
                    {e.title}
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-[10px] text-muted-foreground px-1">
                    +{dayEvents.length - 3} more
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}