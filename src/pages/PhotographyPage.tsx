import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type { FormEvent } from "react";
import { isAxiosError } from "axios";
import {
  Camera,
  Plus,
  RefreshCw,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import toast from "react-hot-toast";
import PhotographyDateTimePicker from "../components/PhotographyDateTimePicker";
import api from "../services/api";

type Person = {
  id: string;
  firstName: string;
  lastName: string;
  classroom?: { name: string } | null;
};
type Department = { id: string; name: string; active: boolean };
type Equipment = Department & { quantity: number };
type Roster = { userId: string; active: boolean; user: Person; busy?: boolean };
type Metadata = {
  user: Person;
  role: string;
  canManage: boolean;
  canBook: boolean;
  isPhotographer: boolean;
  departments: Department[];
  equipment: Equipment[];
};
type Booking = {
  id: string;
  kind: "PHOTOGRAPHERS" | "EQUIPMENT";
  status: string;
  activityName: string;
  location: string;
  photographerCount: number;
  hasLunch: boolean;
  requester: Person;
  department: Department;
  reviewer: Person | null;
  reviewNote: string | null;
  createdAt: string;
  slots: { startsAt: string; endsAt: string }[];
  assignments: { studentId: string; student: Person }[];
  equipment: { equipmentId: string; quantity: number; equipment: Equipment }[];
};
const statuses: Record<string, string> = {
  PENDING: "รออนุมัติ",
  APPROVED: "อนุมัติแล้ว",
  REJECTED: "ไม่อนุมัติ",
  CANCELLED: "ยกเลิกแล้ว",
};
const badge: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-800",
  APPROVED: "bg-green-50 text-green-800",
  REJECTED: "bg-rose-50 text-rose-800",
  CANCELLED: "bg-slate-100 text-slate-600",
};
const name = (p: Person) => `${p.firstName} ${p.lastName}`;
const date = (value: string) =>
  new Date(value).toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "short",
  });
const field =
  "w-full rounded-xl border border-gray-200 bg-white p-3 text-sm outline-none focus:border-green-700 focus:ring-2 focus:ring-green-100";
const button =
  "rounded-xl bg-[#126b36] px-4 py-3 text-sm font-bold text-white disabled:opacity-50";
const secondary =
  "rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold disabled:opacity-50";
const panel = "rounded-2xl border border-gray-100 bg-white p-5 shadow-sm";
function message(error: unknown) {
  const value: unknown = isAxiosError(error)
    ? error.response?.data?.message
    : null;
  return typeof value === "string"
    ? value
    : Array.isArray(value)
      ? value.join("\n")
      : "ไม่สามารถดำเนินการได้ กรุณาลองใหม่";
}
function Label({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="block space-y-2 text-sm font-semibold text-gray-700">
      <label htmlFor={id} className="block">
        {title}
      </label>
      {isValidElement<{ id?: string }>(children)
        ? cloneElement(children, { id })
        : children}
    </div>
  );
}

export default function PhotographyPage() {
  const [meta, setMeta] = useState<Metadata | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("bookings");
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<Booking[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Booking | null>(null);
  const [available, setAvailable] = useState<Roster[]>([]);
  const [selection, setSelection] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [reviewReady, setReviewReady] = useState(false);
  const detailVersion = useRef(0);
  const loadVersion = useRef(0);
  const [roster, setRoster] = useState<Roster[]>([]);
  const [managers, setManagers] = useState<{ userId: string; user: Person }[]>(
    [],
  );
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Person[]>([]);
  const [searched, setSearched] = useState(false);
  const [departmentName, setDepartmentName] = useState("");
  const [equipmentName, setEquipmentName] = useState("");
  const [quantity, setQuantity] = useState(1);

  const load = useCallback(
    (signal?: AbortSignal) => {
      const version = ++loadVersion.current;
      return Promise.all([
        api.get<Metadata>("/photography/metadata", { signal }),
        api.get<{ items: Booking[]; total: number }>("/photography/bookings", {
          signal,
          params: { page, ...(filter ? { status: filter } : {}) },
        }),
      ])
        .then(async ([m, b]) => {
          if (version !== loadVersion.current || signal?.aborted) return;
          setError("");
          setMeta(m.data);
          setItems(b.data.items);
          setTotal(b.data.total);
          const [r, managersResult] = await Promise.all([
            m.data.canManage
              ? api.get<Roster[]>("/photography/photographers", { signal })
              : Promise.resolve({ data: [] }),
            m.data.role === "ADMIN"
              ? api.get<{ userId: string; user: Person }[]>(
                  "/photography/managers",
                  { signal },
                )
              : Promise.resolve({ data: [] }),
          ]);
          if (version !== loadVersion.current || signal?.aborted) return;
          setRoster(r.data);
          setManagers(managersResult.data);
        })
        .catch((e: unknown) => {
          if (version === loadVersion.current && !signal?.aborted)
            setError(message(e));
        })
        .finally(() => {
          if (version === loadVersion.current && !signal?.aborted)
            setLoading(false);
        });
    },
    [page, filter],
  );
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  const open = useCallback(
    (id: string) => {
      const version = ++detailVersion.current;
      return api
        .get<Booking>(`/photography/bookings/${id}`)
        .then(async (response) => {
          if (version !== detailVersion.current) return;
          setReviewReady(false);
          setSelection([]);
          setAvailable([]);
          setNote("");
          setSelected(response.data);
          if (meta?.canManage && response.data.status === "PENDING") {
            const a = await api.get<Roster[]>(
              `/photography/bookings/${id}/availability`,
            );
            if (version !== detailVersion.current) return;
            setAvailable(a.data);
          }
          setReviewReady(true);
        })
        .catch((e: unknown) => {
          toast.error(message(e));
        });
    },
    [meta],
  );
  const linked = useRef(false);
  useEffect(() => {
    if (!meta || linked.current) return;
    linked.current = true;
    const id = new URLSearchParams(window.location.search).get("bookingId");
    if (id) void open(id);
  }, [meta, open]);
  function selectTab(value: string) {
    setTab(value);
    setResults([]);
    setSearch("");
    setSearched(false);
  }
  function reload() {
    setLoading(true);
    void load();
  }

  async function perform(action: () => Promise<unknown>) {
    if (busy) return false;
    setBusy(true);
    try {
      await action();
      toast.success("บันทึกเรียบร้อยแล้ว");
      await load();
      return true;
    } catch (e) {
      toast.error(message(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function lookup(e: FormEvent) {
    e.preventDefault();
    setResults([]);
    setSearched(false);
    if (search.trim().length < 2) return;
    setBusy(true);
    try {
      const res = await api.get<Person[]>("/photography/directory", {
        params: { role: tab === "managers" ? "TEACHER" : "STUDENT", q: search },
      });
      setResults(res.data);
      setSearched(true);
    } catch (e) {
      toast.error(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function review(action: "approve" | "reject" | "cancel") {
    if (!selected) return;
    if (action !== "approve" && !note.trim()) {
      toast.error("กรุณาระบุเหตุผล");
      return;
    }
    const id = selected.id;
    const data =
      action === "approve" ? { studentIds: selection, note } : { note };
    if (
      await perform(() =>
        api.post(`/photography/bookings/${id}/${action}`, data),
      )
    )
      await open(id);
  }
  const close = () => {
    if (busy) return;
    detailVersion.current++;
    setSelected(null);
  };
  async function deleteBooking() {
    if (busy || !selected || meta?.role !== "ADMIN") return;
    if (
      !window.confirm(
        `ลบการจอง “${selected.activityName}” ถาวร?\nรายการจอง ช่วงเวลา และการมอบหมายช่างภาพ/อุปกรณ์จะถูกลบ และไม่สามารถกู้คืนได้`,
      )
    )
      return;
    const id = selected.id;
    if (await perform(() => api.delete(`/photography/bookings/${id}`))) {
      detailVersion.current++;
      setSelected(null);
      if (items.length === 1 && page > 1) setPage(page - 1);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 pb-28 text-gray-800 lg:p-6">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-[#064725] p-6 text-white">
        <div className="flex items-center gap-3">
          <Camera size={30} />
          <div>
            <h1 className="text-xl font-black">งานช่างภาพ</h1>
            <p className="mt-1 text-sm text-green-100">
              {meta?.role === "STUDENT"
                ? "งานที่ได้รับมอบหมายและรายละเอียดกิจกรรม"
                : "จองช่างภาพ ยืมอุปกรณ์ และจัดทีมถ่ายภาพ"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={reload}
          disabled={busy || loading}
          className="rounded-xl border border-white/30 p-3"
          aria-label="โหลดใหม่"
        >
          <RefreshCw size={18} />
        </button>
      </header>
      {error && (
        <div
          role="alert"
          className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-800"
        >
          {error}
          <button onClick={reload} className="ml-3 underline">
            ลองใหม่
          </button>
        </div>
      )}
      {!meta && loading && <p role="status">กำลังโหลดข้อมูล…</p>}
      {meta && (
        <>
          <nav
            className="flex gap-2 overflow-x-auto pb-1"
            aria-label="เมนูงานช่างภาพ"
          >
            {[
              ["bookings", meta.role === "STUDENT" ? "งานของฉัน" : "รายการจอง"],
              ...(meta.canManage
                ? [
                    ["team", "ทีมช่างภาพ"],
                    ["resources", "อุปกรณ์ / กลุ่มงาน"],
                  ]
                : []),
              ...(meta.role === "ADMIN"
                ? [["managers", "ครูผู้รับผิดชอบ"]]
                : []),
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => selectTab(key)}
                className={`shrink-0 rounded-xl px-4 py-3 text-sm font-bold ${tab === key ? "bg-green-800 text-white" : "bg-white text-gray-600"}`}
              >
                {label}
              </button>
            ))}
          </nav>
          {tab === "bookings" && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <select
                  aria-label="กรองสถานะ"
                  value={filter}
                  onChange={(e) => {
                    setLoading(true);
                    setFilter(e.target.value);
                    setPage(1);
                  }}
                  className={`${field} max-w-52`}
                  disabled={busy}
                >
                  <option value="">ทุกสถานะ</option>
                  {Object.entries(statuses).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                {meta.canBook && (
                  <button
                    className={button}
                    disabled={busy || loading}
                    onClick={() => setCreating(true)}
                  >
                    <Plus size={16} className="mr-1 inline" />
                    สร้างคำขอ
                  </button>
                )}
              </div>
              {loading ? (
                <p role="status">กำลังโหลดรายการ…</p>
              ) : items.length === 0 ? (
                <div className={`${panel} py-12 text-center text-gray-500`}>
                  <Camera className="mx-auto mb-3" />
                  {meta.role === "STUDENT"
                    ? "ยังไม่มีงานที่ได้รับมอบหมาย"
                    : "ยังไม่มีรายการจอง"}
                </div>
              ) : (
                <div className="space-y-3">
                  {items.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => void open(b.id)}
                      className={`${panel} block w-full text-left transition hover:border-green-400`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <h2 className="font-bold">{b.activityName}</h2>
                        <span
                          className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${badge[b.status]}`}
                        >
                          {statuses[b.status]}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-gray-600">
                        {b.kind === "EQUIPMENT"
                          ? "ยืมอุปกรณ์"
                          : `ช่างภาพ ${b.photographerCount} คน`}{" "}
                        · {b.location}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        {date(b.slots[0].startsAt)}
                        {b.slots.length > 1
                          ? ` · ${b.slots.length} ช่วงเวลา`
                          : ""}
                      </p>
                      <p className="mt-2 text-xs text-gray-500">
                        ผู้จอง: {name(b.requester)} · {b.department.name}
                      </p>
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between text-sm">
                <span>
                  {total} รายการ · หน้า {page}
                </span>
                <div className="flex gap-2">
                  <button
                    aria-label="หน้าก่อน"
                    className={secondary}
                    disabled={loading || page <= 1}
                    onClick={() => {
                      setLoading(true);
                      setPage(page - 1);
                    }}
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    aria-label="หน้าถัดไป"
                    className={secondary}
                    disabled={loading || page * 30 >= total}
                    onClick={() => {
                      setLoading(true);
                      setPage(page + 1);
                    }}
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            </>
          )}
          {(tab === "team" || tab === "managers") && (
            <section className={`${panel} space-y-4`}>
              <h2 className="font-bold">
                {tab === "managers"
                  ? "กำหนดครูผู้รับผิดชอบด้านการถ่ายภาพ"
                  : "เลือกนักเรียนเข้าทีมช่างภาพ"}
              </h2>
              <form onSubmit={(e) => void lookup(e)} className="flex gap-2">
                <input
                  aria-label="ค้นหาชื่อ"
                  placeholder="ค้นหาชื่อ นามสกุล หรือห้อง อย่างน้อย 2 ตัวอักษร"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setSearched(false);
                  }}
                  minLength={2}
                  required
                  className={field}
                />
                <button className={button} disabled={busy}>
                  ค้นหา
                </button>
              </form>
              {searched && results.length === 0 && (
                <p className="text-sm text-gray-500">ไม่พบรายชื่อ</p>
              )}
              {results.map((p) => {
                const active =
                  tab === "managers"
                    ? managers.some((m) => m.userId === p.id)
                    : roster.some((r) => r.userId === p.id && r.active);
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-3 border-b py-3 text-sm"
                  >
                    <span>
                      {name(p)} {p.classroom?.name}
                    </span>
                    <button
                      disabled={busy || active}
                      className={secondary}
                      onClick={() =>
                        void perform(() =>
                          api.patch(
                            `/photography/${tab === "managers" ? "managers" : "photographers"}/${p.id}`,
                            { active: true },
                          ),
                        )
                      }
                    >
                      {active ? "เพิ่มแล้ว" : "เพิ่ม"}
                    </button>
                  </div>
                );
              })}
              <h3 className="pt-4 text-sm font-bold">
                {tab === "managers"
                  ? "ครูผู้รับผิดชอบปัจจุบัน"
                  : "รายชื่อทีมช่างภาพ"}
              </h3>
              {tab === "managers" ? (
                managers.length ? (
                  managers.map((m) => (
                    <div
                      key={m.userId}
                      className="flex items-center justify-between gap-3 border-b py-3 text-sm"
                    >
                      <span>{name(m.user)}</span>
                      <button
                        disabled={busy}
                        className={secondary}
                        onClick={() => {
                          if (window.confirm(`ถอนสิทธิ์ ${name(m.user)}?`))
                            void perform(() =>
                              api.patch(`/photography/managers/${m.userId}`, {
                                active: false,
                              }),
                            );
                        }}
                      >
                        ถอนสิทธิ์
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-500">
                    ยังไม่ได้กำหนดครูผู้รับผิดชอบ
                  </p>
                )
              ) : roster.length ? (
                roster.map((r) => (
                  <div
                    key={r.userId}
                    className="flex items-center justify-between gap-3 border-b py-3 text-sm"
                  >
                    <span>
                      {name(r.user)} {r.user.classroom?.name}
                      <small className="block text-gray-500">
                        {r.active ? "พร้อมรับงาน" : "พักการรับงาน"}
                      </small>
                    </span>
                    <button
                      disabled={busy}
                      className={secondary}
                      onClick={() =>
                        void perform(() =>
                          api.patch(`/photography/photographers/${r.userId}`, {
                            active: !r.active,
                          }),
                        )
                      }
                    >
                      {r.active ? "พักการรับงาน" : "เปิดรับงาน"}
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500">ยังไม่มีนักเรียนในทีม</p>
              )}
            </section>
          )}
          {tab === "resources" && (
            <div className="grid gap-5 md:grid-cols-2">
              <section className={`${panel} space-y-4`}>
                <h2 className="font-bold">อุปกรณ์ให้ยืม</h2>
                <p className="text-xs text-gray-500">
                  ใช้ชื่อเดิมเพื่อปรับจำนวนทั้งหมด
                  โดยจำนวนต้องไม่ต่ำกว่าที่อนุมัติไว้
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void perform(() =>
                      api.post("/photography/equipment", {
                        name: equipmentName,
                        quantity,
                      }),
                    ).then((ok) => {
                      if (ok) {
                        setEquipmentName("");
                        setQuantity(1);
                      }
                    });
                  }}
                  className="space-y-3"
                >
                  <Label title="ชื่ออุปกรณ์">
                    <input
                      required
                      maxLength={191}
                      value={equipmentName}
                      onChange={(e) => setEquipmentName(e.target.value)}
                      className={field}
                    />
                  </Label>
                  <Label title="จำนวนทั้งหมด">
                    <input
                      required
                      type="number"
                      min={1}
                      max={1000}
                      value={quantity}
                      onChange={(e) => setQuantity(Number(e.target.value))}
                      className={field}
                    />
                  </Label>
                  <button className={button} disabled={busy}>
                    บันทึกอุปกรณ์
                  </button>
                </form>
                {meta.equipment.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-2 border-t pt-3 text-sm"
                  >
                    <button
                      className="text-left"
                      onClick={() => {
                        setEquipmentName(item.name);
                        setQuantity(item.quantity);
                      }}
                    >
                      {item.name} · {item.quantity} ชิ้น
                      <small className="block text-gray-500">
                        {item.active
                          ? "เปิดให้ยืม · แตะเพื่อแก้จำนวน"
                          : "ปิดให้ยืม"}
                      </small>
                    </button>
                    <button
                      disabled={busy}
                      className={secondary}
                      onClick={() =>
                        void perform(() =>
                          api.patch(`/photography/equipment/${item.id}`, {
                            active: !item.active,
                          }),
                        )
                      }
                    >
                      {item.active ? "ปิด" : "เปิด"}
                    </button>
                  </div>
                ))}
              </section>
              <section className={`${panel} space-y-4`}>
                <h2 className="font-bold">กลุ่มสาระ / กลุ่มงาน</h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void perform(() =>
                      api.post("/photography/departments", {
                        name: departmentName,
                      }),
                    ).then((ok) => {
                      if (ok) setDepartmentName("");
                    });
                  }}
                  className="space-y-3"
                >
                  <Label title="ชื่อกลุ่มสาระ / กลุ่มงาน">
                    <input
                      required
                      maxLength={191}
                      value={departmentName}
                      onChange={(e) => setDepartmentName(e.target.value)}
                      className={field}
                    />
                  </Label>
                  <button className={button} disabled={busy}>
                    เพิ่มกลุ่มงาน
                  </button>
                </form>
                {meta.departments.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-2 border-t pt-3 text-sm"
                  >
                    <span>
                      {item.name}
                      <small className="block text-gray-500">
                        {item.active ? "เปิดใช้งาน" : "ปิดใช้งาน"}
                      </small>
                    </span>
                    <button
                      disabled={busy}
                      className={secondary}
                      onClick={() =>
                        void perform(() =>
                          api.patch(`/photography/departments/${item.id}`, {
                            active: !item.active,
                          }),
                        )
                      }
                    >
                      {item.active ? "ปิด" : "เปิด"}
                    </button>
                  </div>
                ))}
              </section>
            </div>
          )}
        </>
      )}
      {creating && meta && (
        <Modal
          title="สร้างคำขอ"
          onClose={() => {
            if (!busy) setCreating(false);
          }}
        >
          <BookingForm
            meta={meta}
            busy={busy}
            onSubmit={async (data) => {
              if (
                await perform(() => api.post("/photography/bookings", data))
              ) {
                setCreating(false);
                setTab("bookings");
                setPage(1);
                setFilter("");
              }
            }}
          />
        </Modal>
      )}
      {selected && meta && (
        <Modal title="รายละเอียดงาน" onClose={close}>
          <div className="space-y-4 text-sm">
            <div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold ${badge[selected.status]}`}
              >
                {statuses[selected.status]}
              </span>
              <h2 className="mt-4 text-xl font-bold">
                {selected.activityName}
              </h2>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3">
              <dt className="text-gray-500">ผู้จอง</dt>
              <dd>{name(selected.requester)}</dd>
              <dt className="text-gray-500">กลุ่มงาน</dt>
              <dd>{selected.department.name}</dd>
              <dt className="text-gray-500">สถานที่</dt>
              <dd>{selected.location}</dd>
              <dt className="text-gray-500">คำขอ</dt>
              <dd>
                {selected.kind === "EQUIPMENT"
                  ? "ยืมอุปกรณ์แทนช่างภาพ"
                  : `ช่างภาพ ${selected.photographerCount} คน`}
              </dd>
              <dt className="text-gray-500">อาหารกลางวัน</dt>
              <dd>{selected.hasLunch ? "มี" : "ไม่มี"}</dd>
            </dl>
            <section className="space-y-2 rounded-xl bg-green-50 p-4">
              <h3 className="font-bold">วันและเวลา (ประเทศไทย)</h3>
              {selected.slots.map((s, i) => (
                <p key={i}>
                  {date(s.startsAt)} – {date(s.endsAt)}
                </p>
              ))}
            </section>
            {selected.equipment.length > 0 && (
              <section>
                <h3 className="font-bold">อุปกรณ์ที่ขอยืม</h3>
                {selected.equipment.map((e) => (
                  <p key={e.equipmentId} className="mt-2">
                    {e.equipment.name} · {e.quantity} ชิ้น
                  </p>
                ))}
              </section>
            )}
            {selected.assignments.length > 0 && (
              <section>
                <h3 className="font-bold">ช่างภาพที่ได้รับมอบหมาย</h3>
                {selected.assignments.map((a) => (
                  <p key={a.studentId} className="mt-2">
                    {name(a.student)} {a.student.classroom?.name}
                  </p>
                ))}
              </section>
            )}
            {selected.reviewer && <p>ผู้พิจารณา: {name(selected.reviewer)}</p>}
            {selected.reviewNote && (
              <p className="whitespace-pre-wrap rounded-xl bg-gray-50 p-3">
                หมายเหตุ: {selected.reviewNote}
              </p>
            )}
            {meta.canManage && selected.status === "PENDING" && (
              <section className="space-y-3 border-t pt-4">
                <h3 className="font-bold">พิจารณาคำขอ</h3>
                {!reviewReady && <p>กำลังตรวจสอบช่างภาพ…</p>}
                {selected.kind === "PHOTOGRAPHERS" && (
                  <>
                    <p>
                      เลือกช่างภาพ {selected.photographerCount} คน · เลือกแล้ว{" "}
                      {selection.length} คน
                    </p>
                    {reviewReady && !available.length && (
                      <p className="text-amber-800">
                        ยังไม่มีช่างภาพในทีม กรุณาเพิ่มนักเรียนที่เมนูทีมช่างภาพ
                      </p>
                    )}
                    {available.map((r) => (
                      <label
                        key={r.userId}
                        className={`flex items-center gap-3 rounded-xl border p-3 ${r.busy ? "bg-gray-50 text-gray-400" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={selection.includes(r.userId)}
                          disabled={
                            busy ||
                            r.busy ||
                            (!selection.includes(r.userId) &&
                              selection.length >= selected.photographerCount)
                          }
                          onChange={(e) =>
                            setSelection(
                              e.target.checked
                                ? [...selection, r.userId]
                                : selection.filter((id) => id !== r.userId),
                            )
                          }
                        />
                        <span>
                          {name(r.user)} {r.user.classroom?.name}
                          {r.busy && " · มีงานช่วงนี้แล้ว"}
                        </span>
                      </label>
                    ))}
                  </>
                )}
                <Label title="หมายเหตุ / เหตุผลกรณีไม่อนุมัติ">
                  <textarea
                    className={field}
                    value={note}
                    maxLength={1000}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </Label>
                <div className="flex flex-wrap gap-3">
                  <button
                    className={button}
                    disabled={
                      busy ||
                      !reviewReady ||
                      (selected.kind === "PHOTOGRAPHERS" &&
                        selection.length !== selected.photographerCount)
                    }
                    onClick={() => {
                      if (window.confirm("ยืนยันอนุมัติคำขอนี้?"))
                        void review("approve");
                    }}
                  >
                    อนุมัติ
                    {selected.kind === "PHOTOGRAPHERS"
                      ? "และมอบหมายงาน"
                      : "ให้ยืมอุปกรณ์"}
                  </button>
                  <button
                    className={`${secondary} text-rose-700`}
                    disabled={busy || !note.trim()}
                    onClick={() => {
                      if (window.confirm("ยืนยันไม่อนุมัติคำขอนี้?"))
                        void review("reject");
                    }}
                  >
                    ไม่อนุมัติ
                  </button>
                </div>
              </section>
            )}
            {(meta.canManage || selected.requester.id === meta.user.id) &&
              ["PENDING", "APPROVED"].includes(selected.status) &&
              selected.slots.every(
                (s) => new Date(s.startsAt) > new Date(),
              ) && (
                <section className="space-y-3 border-t pt-4">
                  {!(meta.canManage && selected.status === "PENDING") && (
                    <Label title="เหตุผลที่ยกเลิก">
                      <textarea
                        className={field}
                        maxLength={1000}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                      />
                    </Label>
                  )}
                  <button
                    disabled={busy || !note.trim()}
                    className={`${secondary} text-rose-700`}
                    onClick={() => {
                      if (
                        window.confirm("ยืนยันยกเลิกงานและแจ้งผู้เกี่ยวข้อง?")
                      )
                        void review("cancel");
                    }}
                  >
                    ยกเลิกคำขอ / งาน
                  </button>
                </section>
              )}
            {meta.role === "ADMIN" && (
              <section className="space-y-3 border-t pt-4">
                <p className="text-gray-500">
                  ผู้ดูแลระบบสามารถลบรายการจองนี้ถาวรได้ทุกสถานะ
                </p>
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-xl bg-rose-700 px-4 py-3 font-bold text-white disabled:opacity-50"
                  onClick={() => void deleteBooking()}
                >
                  ลบการจองถาวร
                </button>
              </section>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl rounded-3xl bg-white p-0 text-gray-800 shadow-2xl backdrop:bg-black/50"
    >
      <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-white p-5">
        <h2 className="font-bold">{title}</h2>
        <button aria-label="ปิด" onClick={onClose} className="rounded-xl p-2">
          <X size={20} />
        </button>
      </header>
      <div className="p-5">{children}</div>
    </dialog>
  );
}

function BookingForm({
  meta,
  busy,
  onSubmit,
}: {
  meta: Metadata;
  busy: boolean;
  onSubmit: (data: unknown) => Promise<void>;
}) {
  const [activityName, setActivityName] = useState("");
  const [location, setLocation] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [borrow, setBorrow] = useState(false);
  const [hasLunch, setHasLunch] = useState(false);
  const [count, setCount] = useState(1);
  const [slots, setSlots] = useState([{ startsAt: "", endsAt: "" }]);
  const [equipment, setEquipment] = useState<Record<string, number>>({});
  // Calendar and clock values are Bangkok times regardless of the device timezone.
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (
      slots.some((s) =>
        [s.startsAt, s.endsAt].some(
          (at) =>
            !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(at) ||
            !Number.isFinite(new Date(`${at}:00+07:00`).getTime()),
        ),
      )
    ) {
      toast.error("กรุณาเลือกวันและเวลาให้ครบทุกช่วง");
      return;
    }
    const ranges = slots.map((s) => ({
      startsAt: new Date(`${s.startsAt}:00+07:00`).toISOString(),
      endsAt: new Date(`${s.endsAt}:00+07:00`).toISOString(),
    }));
    if (
      ranges.some(
        (s) => s.startsAt <= new Date().toISOString() || s.endsAt <= s.startsAt,
      )
    ) {
      toast.error("กรุณาเลือกเวลาในอนาคต และให้เวลาสิ้นสุดอยู่หลังเวลาเริ่ม");
      return;
    }
    const requested = borrow
      ? Object.entries(equipment)
          .filter(([, q]) => q > 0)
          .map(([equipmentId, quantity]) => ({ equipmentId, quantity }))
      : [];
    if (borrow && !requested.length) {
      toast.error("กรุณาเลือกอุปกรณ์อย่างน้อย 1 รายการ");
      return;
    }
    await onSubmit({
      activityName,
      location,
      departmentId,
      hasLunch,
      kind: borrow ? "EQUIPMENT" : "PHOTOGRAPHERS",
      photographerCount: borrow ? 0 : count,
      slots: ranges,
      equipment: requested,
    });
  }
  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-5">
      <fieldset disabled={busy} className="space-y-5">
        <Label title="ผู้จอง">
          <input
            readOnly
            value={name(meta.user)}
            className={`${field} bg-gray-50`}
          />
        </Label>
        <Label title="ชื่อกิจกรรม">
          <input
            required
            maxLength={191}
            value={activityName}
            onChange={(e) => setActivityName(e.target.value)}
            className={field}
          />
        </Label>
        <Label title="กลุ่มสาระ / กลุ่มงาน">
          <select
            required
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            className={field}
          >
            <option value="">เลือกกลุ่มสาระ / กลุ่มงาน</option>
            {meta.departments
              .filter((d) => d.active)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
          </select>
        </Label>
        <Label title="สถานที่">
          <input
            required
            maxLength={500}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className={field}
          />
        </Label>
        <section className="space-y-3">
          <h3 className="text-sm font-bold">วันและเวลา (ประเทศไทย)</h3>
          <p className="text-xs text-gray-500">
            เลือกช่วงเวลาข้ามวันได้ หรือเพิ่มช่วงเวลาสำหรับแต่ละวัน สูงสุด 31
            ช่วง
          </p>
          {slots.map((slot, i) => (
            <div key={i} className="space-y-3 rounded-2xl border p-4">
              <div className="flex justify-between text-sm">
                <strong>ช่วงที่ {i + 1}</strong>
                {slots.length > 1 && (
                  <button
                    type="button"
                    className="text-rose-700"
                    onClick={() =>
                      setSlots(slots.filter((_, index) => index !== i))
                    }
                  >
                    ลบช่วงนี้
                  </button>
                )}
              </div>
              <PhotographyDateTimePicker
                label="เริ่ม"
                value={slot.startsAt}
                defaultTime="09:00"
                initiallyOpen
                kind={borrow ? "EQUIPMENT" : "PHOTOGRAPHERS"}
                onChange={(value) =>
                  setSlots(
                    slots.map((s, index) =>
                      index === i
                        ? {
                            ...s,
                            startsAt: value,
                            endsAt: s.endsAt || `${value.slice(0, 10)}T10:00`,
                          }
                        : s,
                    ),
                  )
                }
              />
              <PhotographyDateTimePicker
                label="สิ้นสุด"
                value={slot.endsAt}
                defaultTime="10:00"
                kind={borrow ? "EQUIPMENT" : "PHOTOGRAPHERS"}
                onChange={(value) =>
                  setSlots(
                    slots.map((s, index) =>
                      index === i ? { ...s, endsAt: value } : s,
                    ),
                  )
                }
              />
            </div>
          ))}
          <button
            type="button"
            className={secondary}
            disabled={slots.length >= 31}
            onClick={() => setSlots([...slots, { startsAt: "", endsAt: "" }])}
          >
            + เพิ่มวัน / ช่วงเวลา
          </button>
        </section>
        <label className="flex items-start gap-3 rounded-2xl bg-green-50 p-4 text-sm">
          <input
            type="checkbox"
            checked={borrow}
            onChange={(e) => setBorrow(e.target.checked)}
            className="mt-1"
          />
          <span className="font-bold">ยืมอุปกรณ์แทนการขอช่างภาพ</span>
        </label>
        {borrow ? (
          <section className="space-y-3">
            <h3 className="text-sm font-bold">
              เลือกอุปกรณ์และจำนวนที่ต้องการยืม
            </h3>
            {!meta.equipment.some((e) => e.active) && (
              <p className="text-sm text-amber-800">
                ยังไม่มีอุปกรณ์ให้ยืม กรุณาติดต่อครูผู้รับผิดชอบ
              </p>
            )}
            {meta.equipment
              .filter((e) => e.active)
              .map((item) => (
                <Label
                  key={item.id}
                  title={`${item.name} (ทั้งหมด ${item.quantity} ชิ้น)`}
                >
                  <input
                    aria-label={`จำนวน ${item.name}`}
                    type="number"
                    min={0}
                    max={item.quantity}
                    value={equipment[item.id] ?? 0}
                    onChange={(e) =>
                      setEquipment({
                        ...equipment,
                        [item.id]: Number(e.target.value),
                      })
                    }
                    className={field}
                  />
                </Label>
              ))}
          </section>
        ) : (
          <Label title="จำนวนช่างภาพ">
            <input
              required
              type="number"
              min={1}
              max={50}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className={field}
            />
          </Label>
        )}
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={hasLunch}
            onChange={(e) => setHasLunch(e.target.checked)}
          />
          มีอาหารกลางวัน
        </label>
        <button className={`${button} w-full`} disabled={busy}>
          {busy ? "กำลังส่งคำขอ…" : "ส่งคำขอเพื่อรออนุมัติ"}
        </button>
      </fieldset>
    </form>
  );
}
