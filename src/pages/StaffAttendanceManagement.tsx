import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, RefreshCw, Search, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import Swal from 'sweetalert2';
import api from '../services/api';

type AttendanceType = 'PERSONAL_LEAVE' | 'SICK_LEAVE' | 'LATE_ARRIVAL';
type AttendanceStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

interface Person {
  id: string;
  firstName: string;
  lastName: string;
  citizenId?: string;
}

interface AttendanceRecord {
  id: string;
  type: AttendanceType;
  status: AttendanceStatus;
  startDate: string;
  endDate: string;
  arrivalTime: string | null;
  reason: string;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
  teacher: Person;
  reviewer: Person | null;
}

const typeLabels: Record<AttendanceType, string> = {
  PERSONAL_LEAVE: 'ลากิจ',
  SICK_LEAVE: 'ลาป่วย',
  LATE_ARRIVAL: 'ขอเข้าสาย',
};

const statusLabels: Record<AttendanceStatus, string> = {
  PENDING: 'รออนุมัติ',
  APPROVED: 'อนุมัติแล้ว',
  REJECTED: 'ไม่อนุมัติ',
};

const statusStyles: Record<AttendanceStatus, string> = {
  PENDING: 'bg-amber-50 text-amber-700 ring-amber-200',
  APPROVED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  REJECTED: 'bg-rose-50 text-rose-700 ring-rose-200',
};

const formatThaiDate = (value: string) =>
  new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium' }).format(
    new Date(`${value}T00:00:00`),
  );

const dateRange = (record: AttendanceRecord) =>
  record.startDate === record.endDate
    ? formatThaiDate(record.startDate)
    : `${formatThaiDate(record.startDate)} – ${formatThaiDate(record.endDate)}`;

export default function StaffAttendanceManagement() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/staff-attendance', {
        params: {
          status: status || undefined,
          type: type || undefined,
          from: from || undefined,
          to: to || undefined,
        },
      });
      setRecords(data.records ?? []);
    } catch {
      toast.error('โหลดประวัติการลาไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [from, status, to, type]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadRecords(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadRecords]);

  const filteredRecords = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('th');
    if (!keyword) return records;
    return records.filter((record) => {
      const teacherName = `${record.teacher.firstName} ${record.teacher.lastName}`;
      return `${teacherName} ${record.teacher.citizenId ?? ''} ${record.reason}`
        .toLocaleLowerCase('th')
        .includes(keyword);
    });
  }, [records, search]);

  const removeRecord = async (record: AttendanceRecord) => {
    const result = await Swal.fire({
      title: 'ลบรายการลานี้?',
      text: `${record.teacher.firstName} ${record.teacher.lastName} • ${typeLabels[record.type]}`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'ลบรายการ',
      cancelButtonText: 'ยกเลิก',
      customClass: { popup: 'font-prompt' },
    });
    if (!result.isConfirmed) return;

    try {
      await api.delete(`/staff-attendance/${record.id}`);
      setRecords((current) => current.filter((item) => item.id !== record.id));
      toast.success('ลบรายการลาแล้ว');
    } catch {
      toast.error('ลบรายการลาไม่สำเร็จ');
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-3xl bg-gradient-to-br from-[#063d1f] to-[#1B813E] p-6 text-white shadow-xl shadow-green-950/10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-yellow-100/70">ประวัติและการจัดการ</p>
            <h1 className="mt-1 text-2xl font-black">รายการลาของครู</h1>
            <p className="mt-2 text-sm text-green-50/70">
              ตรวจสอบสถานะ ค้นหาประวัติ และลบรายการที่ไม่ถูกต้อง
            </p>
          </div>
          <div className="rounded-2xl bg-white/10 px-5 py-3 text-center ring-1 ring-white/15">
            <p className="text-3xl font-black">{filteredRecords.length}</p>
            <p className="text-xs text-green-50/70">รายการที่แสดง</p>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <label className="relative xl:col-span-2">
            <span className="mb-2 block text-xs font-bold text-slate-500">ค้นหาครู / เหตุผล</span>
            <Search className="absolute bottom-3 left-3 text-slate-400" size={18} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ชื่อ เลขประชาชน หรือเหตุผล"
              className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
          </label>
          <FilterSelect label="สถานะ" value={status} onChange={setStatus}>
            <option value="">ทุกสถานะ</option>
            <option value="PENDING">รออนุมัติ</option>
            <option value="APPROVED">อนุมัติแล้ว</option>
            <option value="REJECTED">ไม่อนุมัติ</option>
          </FilterSelect>
          <FilterSelect label="ประเภท" value={type} onChange={setType}>
            <option value="">ทุกประเภท</option>
            <option value="PERSONAL_LEAVE">ลากิจ</option>
            <option value="SICK_LEAVE">ลาป่วย</option>
            <option value="LATE_ARRIVAL">ขอเข้าสาย</option>
          </FilterSelect>
          <DateInput label="ตั้งแต่วันที่" value={from} onChange={setFrom} />
          <DateInput label="ถึงวันที่" value={to} onChange={setTo} />
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => void loadRecords()}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50"
          >
            <RefreshCw className={loading ? 'animate-spin' : ''} size={17} />
            รีเฟรชข้อมูล
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex h-64 items-center justify-center text-slate-400">กำลังโหลดข้อมูล...</div>
        ) : filteredRecords.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-slate-400">
            <CalendarDays size={44} strokeWidth={1.5} />
            <p className="mt-3 font-bold">ไม่พบรายการลา</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-4">ครูผู้ยื่น</th>
                  <th className="px-5 py-4">ประเภท / ช่วงวันที่</th>
                  <th className="px-5 py-4">เหตุผล</th>
                  <th className="px-5 py-4">สถานะ</th>
                  <th className="px-5 py-4">ผู้พิจารณา</th>
                  <th className="px-5 py-4 text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRecords.map((record) => (
                  <tr key={record.id} className="align-top transition hover:bg-slate-50/70">
                    <td className="px-5 py-4">
                      <p className="font-bold text-slate-900">
                        {record.teacher.firstName} {record.teacher.lastName}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">{record.teacher.citizenId}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-bold text-slate-700">{typeLabels[record.type]}</p>
                      <p className="mt-1 whitespace-nowrap text-sm text-slate-500">{dateRange(record)}</p>
                      {record.arrivalTime && (
                        <p className="mt-1 text-xs font-bold text-amber-700">เวลา {record.arrivalTime} น.</p>
                      )}
                    </td>
                    <td className="max-w-xs px-5 py-4 text-sm text-slate-600">{record.reason}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ring-1 ${statusStyles[record.status]}`}>
                        {statusLabels[record.status]}
                      </span>
                      {record.reviewNote && (
                        <p className="mt-2 max-w-[220px] text-xs text-slate-500">หมายเหตุ: {record.reviewNote}</p>
                      )}
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600">
                      {record.reviewer ? `${record.reviewer.firstName} ${record.reviewer.lastName}` : '—'}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => void removeRecord(record)}
                        className="inline-flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2 text-sm font-bold text-rose-600 transition hover:bg-rose-100"
                      >
                        <Trash2 size={16} /> ลบ
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label>
      <span className="mb-2 block text-xs font-bold text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10"
      >
        {children}
      </select>
    </label>
  );
}

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label>
      <span className="mb-2 block text-xs font-bold text-slate-500">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10"
      />
    </label>
  );
}
