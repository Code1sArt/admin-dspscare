import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import api from "../services/api";

type CalendarSlot = {
  id: string;
  startsAt: string;
  endsAt: string;
  kind: string;
  status: string;
};
const bangkokDay = (at: Date) =>
  new Date(at.getTime() + 7 * 3600000).toISOString().slice(0, 10);
const dayLabel = (day: string) =>
  new Date(`${day}T00:00:00+07:00`).toLocaleDateString("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
const timeLabel = (at: string) =>
  new Date(at).toLocaleTimeString("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function PhotographyDateTimePicker({
  label,
  value,
  onChange,
  kind,
  defaultTime,
  initiallyOpen = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  kind: string;
  defaultTime: string;
  initiallyOpen?: boolean;
}) {
  const today = bangkokDay(new Date());
  const selected = value.slice(0, 10);
  const [open, setOpen] = useState(initiallyOpen);
  const [month, setMonth] = useState((selected || today).slice(0, 7));
  const [slots, setSlots] = useState<CalendarSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    api
      .get<CalendarSlot[]>("/photography/calendar", {
        params: { month },
        signal: controller.signal,
      })
      .then(({ data }) => {
        if (!controller.signal.aborted) {
          setSlots(data);
          setError(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [month, open, retry]);
  function navigate(delta: number) {
    const [year, number] = month.split("-").map(Number);
    setMonth(
      new Date(Date.UTC(year, number - 1 + delta, 1)).toISOString().slice(0, 7),
    );
    setLoading(true);
  }
  function onDay(day: string) {
    onChange(`${day}T${value.slice(11, 16) || defaultTime}`);
  }
  const forDay = (day: string) => {
    const start = new Date(`${day}T00:00:00+07:00`).getTime();
    return slots.filter(
      (s) =>
        s.kind === kind &&
        new Date(s.startsAt).getTime() < start + 86400000 &&
        new Date(s.endsAt).getTime() > start,
    );
  };
  const [year, number] = month.split("-").map(Number);
  const offset = new Date(Date.UTC(year, number - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, number, 0)).getUTCDate();
  const visibleDay = selected && selected.startsWith(month) ? selected : "";
  return (
    <div className="space-y-2">
      <div className="text-sm font-bold">{label}</div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => {
            if (!open) {
              setMonth((selected || today).slice(0, 7));
              setLoading(true);
            }
            setOpen(!open);
          }}
          className="min-w-0 flex-1 rounded-xl border border-gray-300 px-3 py-3 text-left text-sm"
        >
          {selected ? dayLabel(selected) : "เลือกวันจากปฏิทิน"}
        </button>
        <input
          aria-label={`เวลา${label}`}
          type="time"
          required
          value={value.slice(11, 16) || ""}
          onChange={(e) => onChange(`${selected || today}T${e.target.value}`)}
          className="min-w-0 rounded-xl border border-gray-300 px-3 py-2 text-sm"
        />
      </div>
      {open && (
        <div className="space-y-3 rounded-2xl border bg-white p-3">
          <div className="flex items-center justify-between">
            <button
              type="button"
              aria-label="เดือนก่อนหน้า"
              onClick={() => navigate(-1)}
              className="p-2"
            >
              <ChevronLeft size={20} />
            </button>
            <strong className="text-sm">
              {new Date(`${month}-01T00:00:00+07:00`).toLocaleDateString(
                "th-TH",
                { timeZone: "Asia/Bangkok", month: "long", year: "numeric" },
              )}
            </strong>
            <button
              type="button"
              aria-label="เดือนถัดไป"
              onClick={() => navigate(1)}
              className="p-2"
            >
              <ChevronRight size={20} />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"].map((d) => (
              <div key={d} className="py-1 text-gray-500">
                {d}
              </div>
            ))}
            {Array.from({ length: offset }, (_, i) => (
              <div key={`blank-${i}`} />
            ))}
            {Array.from({ length: days }, (_, i) => {
              const day = `${month}-${String(i + 1).padStart(2, "0")}`;
              const count = !loading && !error ? forDay(day).length : 0;
              return (
                <button
                  type="button"
                  key={day}
                  aria-label={`${dayLabel(day)}${count ? ` มีการจอง ${count} ช่วง` : ""}`}
                  aria-pressed={selected === day}
                  disabled={day < today}
                  onClick={() => onDay(day)}
                  className={`flex min-h-11 flex-col items-center justify-center rounded-lg disabled:opacity-30 ${selected === day ? "bg-green-700 text-white" : count ? "bg-amber-50 text-amber-900" : "hover:bg-gray-100"}`}
                >
                  <span>{i + 1}</span>
                  <span className="h-3 text-[9px]">
                    {count ? `${count} ช่วง` : ""}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-gray-600">
            สีเหลือง = มีการจองแล้ว · ยังเลือกจองช่วงเวลาซ้ำได้
          </p>
          <div aria-live="polite" className="space-y-2 text-xs">
            {loading ? (
              <p>กำลังโหลดการจอง…</p>
            ) : error ? (
              <div className="text-rose-700">
                โหลดการจองไม่สำเร็จ{" "}
                <button
                  type="button"
                  className="underline"
                  onClick={() => {
                    setLoading(true);
                    setRetry(retry + 1);
                  }}
                >
                  ลองใหม่
                </button>
              </div>
            ) : visibleDay ? (
              <>
                <p className="font-bold">การจองวันที่ {dayLabel(visibleDay)}</p>
                {!forDay(visibleDay).length && <p>ยังไม่มีการจองในวันนี้</p>}
                {forDay(visibleDay).map((s) => (
                  <p
                    key={s.id}
                    className="rounded-lg bg-amber-50 p-2 text-amber-900"
                  >
                    {bangkokDay(new Date(s.startsAt)) < visibleDay
                      ? "ต่อจากวันก่อน · 00:00"
                      : timeLabel(s.startsAt)}{" "}
                    –{" "}
                    {new Date(s.endsAt).getTime() >
                    new Date(`${visibleDay}T00:00:00+07:00`).getTime() +
                      86400000
                      ? "24:00 · ต่อเนื่องถึงวันถัดไป"
                      : new Date(s.endsAt).getTime() ===
                          new Date(`${visibleDay}T00:00:00+07:00`).getTime() +
                            86400000
                        ? "24:00"
                        : timeLabel(s.endsAt)}{" "}
                    · {s.status === "APPROVED" ? "อนุมัติแล้ว" : "รออนุมัติ"}
                  </p>
                ))}
              </>
            ) : (
              <p>เลือกวันเพื่อดูช่วงเวลาที่มีการจอง</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
