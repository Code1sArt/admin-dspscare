import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    CircleAlert,
    Clock3,
    Edit3,
    GraduationCap,
    LoaderCircle,
    Plus,
    Save,
    Trash2,
    X
} from 'lucide-react';
import toast from 'react-hot-toast';
import Swal from 'sweetalert2';
import api from '../services/api';

interface Term {
    id: number | string;
    term: number;
    year: number;
    startDate?: string | null;
    endDate?: string | null;
    isActive: boolean;
}

interface CalendarDay {
    date: string;
    isSchoolDay: boolean;
    reason: string | null;
}

interface CalendarResponse {
    termId: number;
    workingDays: number;
    days: CalendarDay[];
}

interface Holiday {
    id: number;
    date: string;
    name: string;
    academicTermId: number;
}

interface HolidayForm {
    id: number | null;
    date: string;
    name: string;
}

const emptyHolidayForm: HolidayForm = { id: null, date: '', name: '' };
const weekdayLabels = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

const toIsoDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const toMonthParam = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

const dateOnly = (date: string) => date.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? date;

const parseDate = (date: string) => {
    const [year, month, day] = dateOnly(date).split('-').map(Number);
    return new Date(year, month - 1, day);
};

const formatThaiDate = (date: string, options?: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('th-TH', options ?? {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    }).format(parseDate(date));

const formatCalendarReason = (reason?: string | null) => {
    if (!reason) return null;

    const reasonMap: Record<string, string> = {
        WEEKEND: 'วันหยุดสุดสัปดาห์',
        Weekend: 'วันหยุดสุดสัปดาห์',
        OUTSIDE_TERM: 'นอกช่วงเปิดภาคเรียน',
        OutsideTerm: 'นอกช่วงเปิดภาคเรียน'
    };

    return reasonMap[reason] ?? reason;
};

const getInitialMonth = (term: Term) => {
    const today = toIsoDate(new Date());
    if (term.startDate && today < dateOnly(term.startDate)) {
        const start = parseDate(term.startDate);
        return new Date(start.getFullYear(), start.getMonth(), 1);
    }
    if (term.endDate && today > dateOnly(term.endDate)) {
        const end = parseDate(term.endDate);
        return new Date(end.getFullYear(), end.getMonth(), 1);
    }
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
};

export default function AcademicCalendar() {
    const [terms, setTerms] = useState<Term[]>([]);
    const [selectedTermId, setSelectedTermId] = useState('');
    const [displayMonth, setDisplayMonth] = useState(
        () => new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    );
    const [calendar, setCalendar] = useState<CalendarResponse | null>(null);
    const [holidays, setHolidays] = useState<Holiday[]>([]);
    const [loadingTerms, setLoadingTerms] = useState(true);
    const [loadingCalendar, setLoadingCalendar] = useState(false);
    const [showHolidayModal, setShowHolidayModal] = useState(false);
    const [holidayForm, setHolidayForm] = useState<HolidayForm>(emptyHolidayForm);
    const [savingHoliday, setSavingHoliday] = useState(false);

    const selectedTerm = useMemo(
        () => terms.find(term => String(term.id) === selectedTermId),
        [terms, selectedTermId]
    );

    const loadTerms = useCallback(async () => {
        try {
            setLoadingTerms(true);
            const response = await api.get<Term[]>('/terms');
            const termList = response.data;
            setTerms(termList);

            const activeTerm = termList.find(term => term.isActive) ?? termList[0];
            if (activeTerm) {
                setSelectedTermId(String(activeTerm.id));
                setDisplayMonth(getInitialMonth(activeTerm));
            }
        } catch {
            toast.error('ไม่สามารถโหลดข้อมูลภาคเรียนได้');
        } finally {
            setLoadingTerms(false);
        }
    }, []);

    const loadCalendar = useCallback(async () => {
        if (!selectedTermId) return;

        try {
            setLoadingCalendar(true);
            const month = toMonthParam(displayMonth);
            const [calendarResponse, holidayResponse] = await Promise.all([
                api.get<CalendarResponse>(`/terms/${selectedTermId}/calendar`, {
                    params: { month }
                }),
                api.get<Holiday[]>(`/terms/${selectedTermId}/holidays`)
            ]);
            setCalendar(calendarResponse.data);
            setHolidays(holidayResponse.data);
        } catch {
            setCalendar(null);
            toast.error('ไม่สามารถโหลดปฏิทินการศึกษาได้');
        } finally {
            setLoadingCalendar(false);
        }
    }, [displayMonth, selectedTermId]);

    useEffect(() => {
        void loadTerms();
    }, [loadTerms]);

    useEffect(() => {
        void loadCalendar();
    }, [loadCalendar]);

    const calendarDays = useMemo(() => {
        const year = displayMonth.getFullYear();
        const month = displayMonth.getMonth();
        const firstWeekday = new Date(year, month, 1).getDay();
        return Array.from({ length: 42 }, (_, index) => {
            const date = new Date(year, month, index - firstWeekday + 1);
            return {
                date,
                isoDate: toIsoDate(date),
                isCurrentMonth: date.getMonth() === month
            };
        });
    }, [displayMonth]);

    const daysByDate = useMemo(
        () => new Map((calendar?.days ?? []).map(day => [dateOnly(day.date), day])),
        [calendar]
    );

    const holidaysByDate = useMemo(
        () => new Map(holidays.map(holiday => [dateOnly(holiday.date), holiday])),
        [holidays]
    );

    const holidaysThisMonth = useMemo(() => {
        const month = toMonthParam(displayMonth);
        return holidays
            .filter(holiday => dateOnly(holiday.date).startsWith(month))
            .sort((a, b) => dateOnly(a.date).localeCompare(dateOnly(b.date)));
    }, [displayMonth, holidays]);

    const openCreateModal = (date?: string) => {
        setHolidayForm({
            id: null,
            date: date ?? `${toMonthParam(displayMonth)}-01`,
            name: ''
        });
        setShowHolidayModal(true);
    };

    const openEditModal = (holiday: Holiday) => {
        setHolidayForm({
            id: holiday.id,
            date: dateOnly(holiday.date),
            name: holiday.name
        });
        setShowHolidayModal(true);
    };

    const handleDayClick = (isoDate: string) => {
        const holiday = holidaysByDate.get(isoDate);
        if (holiday) {
            openEditModal(holiday);
        } else {
            openCreateModal(isoDate);
        }
    };

    const handleSaveHoliday = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!selectedTermId || !holidayForm.date || !holidayForm.name.trim()) return;

        try {
            setSavingHoliday(true);
            const payload = {
                date: holidayForm.date,
                name: holidayForm.name.trim()
            };

            if (holidayForm.id) {
                await api.patch(
                    `/terms/${selectedTermId}/holidays/${holidayForm.id}`,
                    payload
                );
                toast.success('แก้ไขวันหยุดเรียบร้อยแล้ว');
            } else {
                await api.post(`/terms/${selectedTermId}/holidays`, payload);
                toast.success('เพิ่มวันหยุดเรียบร้อยแล้ว');
            }

            setShowHolidayModal(false);
            setHolidayForm(emptyHolidayForm);
            await loadCalendar();
        } catch {
            toast.error(
                holidayForm.id
                    ? 'ไม่สามารถแก้ไขวันหยุดได้'
                    : 'ไม่สามารถเพิ่มวันหยุดได้'
            );
        } finally {
            setSavingHoliday(false);
        }
    };

    const handleDeleteHoliday = async (holiday: Holiday) => {
        const result = await Swal.fire({
            title: 'ลบวันหยุดนี้?',
            text: `${holiday.name} (${formatThaiDate(holiday.date)})`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#dc2626',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'ลบวันหยุด',
            cancelButtonText: 'ยกเลิก',
            customClass: { popup: 'font-prompt' }
        });

        if (!result.isConfirmed || !selectedTermId) return;

        try {
            await api.delete(`/terms/${selectedTermId}/holidays/${holiday.id}`);
            toast.success('ลบวันหยุดเรียบร้อยแล้ว');
            if (holidayForm.id === holiday.id) {
                setShowHolidayModal(false);
                setHolidayForm(emptyHolidayForm);
            }
            await loadCalendar();
        } catch {
            toast.error('ไม่สามารถลบวันหยุดได้');
        }
    };

    const changeMonth = (offset: number) => {
        setDisplayMonth(current =>
            new Date(current.getFullYear(), current.getMonth() + offset, 1)
        );
    };

    const handleTermChange = (termId: string) => {
        setSelectedTermId(termId);
        const term = terms.find(item => String(item.id) === termId);
        if (term) setDisplayMonth(getInitialMonth(term));
    };

    if (loadingTerms) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center text-gray-500">
                <LoaderCircle className="mr-3 animate-spin" size={24} />
                กำลังโหลดปฏิทินการศึกษา...
            </div>
        );
    }

    if (terms.length === 0) {
        return (
            <div className="mx-auto max-w-xl rounded-3xl border border-amber-200 bg-white p-10 text-center shadow-sm">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                    <CircleAlert size={30} />
                </div>
                <h1 className="text-xl font-bold text-gray-800">ยังไม่มีข้อมูลภาคเรียน</h1>
                <p className="mt-2 text-gray-500">
                    กรุณาเพิ่มภาคเรียนและกำหนดภาคเรียนปัจจุบันในหน้าตั้งค่าระบบก่อน
                </p>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-7xl space-y-6">
            <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <div className="mb-2 flex items-center gap-2 text-sm font-bold text-primary">
                        <GraduationCap size={18} />
                        ปีการศึกษาปัจจุบัน
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900">ปฏิทินวันเปิดภาคเรียน</h1>
                    <p className="mt-1 text-gray-500">
                        ตรวจสอบวันเปิดเรียนและจัดการวันหยุดของโรงเรียน
                    </p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                    <select
                        value={selectedTermId}
                        onChange={event => handleTermChange(event.target.value)}
                        className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 font-medium text-gray-700 shadow-sm outline-none focus:border-primary focus:ring-4 focus:ring-green-100"
                        aria-label="เลือกภาคเรียน"
                    >
                        {terms.map(term => (
                            <option key={term.id} value={term.id}>
                                ภาคเรียน {term.term}/{term.year}
                                {term.isActive ? ' (ปัจจุบัน)' : ''}
                            </option>
                        ))}
                    </select>
                    <button
                        type="button"
                        onClick={() => openCreateModal()}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 font-bold text-white shadow-lg shadow-green-100 transition hover:bg-green-700"
                    >
                        <Plus size={18} />
                        เพิ่มวันหยุด
                    </button>
                </div>
            </header>

            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-primary">
                        <CalendarDays size={21} />
                    </div>
                    <p className="text-sm text-gray-500">วันเปิดเรียนเดือนนี้</p>
                    <p className="mt-1 text-2xl font-bold text-gray-900">
                        {calendar?.workingDays ?? 0} <span className="text-sm font-medium text-gray-400">วัน</span>
                    </p>
                </div>
                <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                        <Clock3 size={21} />
                    </div>
                    <p className="text-sm text-gray-500">วันหยุดที่กำหนด</p>
                    <p className="mt-1 text-2xl font-bold text-gray-900">
                        {holidaysThisMonth.length} <span className="text-sm font-medium text-gray-400">วัน</span>
                    </p>
                </div>
                <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:col-span-2">
                    <p className="text-sm font-medium text-gray-500">ภาคเรียนที่กำลังแสดง</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                        <p className="text-xl font-bold text-gray-900">
                            ภาคเรียน {selectedTerm?.term}/{selectedTerm?.year}
                        </p>
                        {selectedTerm?.isActive && (
                            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">
                                ภาคเรียนปัจจุบัน
                            </span>
                        )}
                    </div>
                    <p className="mt-2 text-sm text-gray-500">
                        {selectedTerm?.startDate && selectedTerm?.endDate
                            ? `${formatThaiDate(selectedTerm.startDate)} – ${formatThaiDate(selectedTerm.endDate)}`
                            : 'ยังไม่ได้กำหนดช่วงเปิด–ปิดภาคเรียน'}
                    </p>
                </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
                <section className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
                    <div className="flex items-center justify-between border-b border-gray-100 px-4 py-5 sm:px-6">
                        <button
                            type="button"
                            onClick={() => changeMonth(-1)}
                            className="rounded-xl border border-gray-200 p-2.5 text-gray-600 transition hover:border-green-200 hover:bg-green-50 hover:text-primary"
                            aria-label="เดือนก่อนหน้า"
                        >
                            <ChevronLeft size={20} />
                        </button>
                        <div className="text-center">
                            <h2 className="text-lg font-bold text-gray-900 sm:text-xl">
                                {new Intl.DateTimeFormat('th-TH', {
                                    month: 'long',
                                    year: 'numeric'
                                }).format(displayMonth)}
                            </h2>
                            <p className="mt-0.5 text-xs text-gray-400">
                                คลิกวันที่เพื่อเพิ่มหรือแก้ไขวันหยุด
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => changeMonth(1)}
                            className="rounded-xl border border-gray-200 p-2.5 text-gray-600 transition hover:border-green-200 hover:bg-green-50 hover:text-primary"
                            aria-label="เดือนถัดไป"
                        >
                            <ChevronRight size={20} />
                        </button>
                    </div>

                    <div className="relative overflow-x-auto p-3 sm:p-5">
                        {loadingCalendar && (
                            <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/75 backdrop-blur-[1px]">
                                <LoaderCircle className="animate-spin text-primary" size={30} />
                            </div>
                        )}
                        <div className="min-w-[680px]">
                            <div className="grid grid-cols-7">
                                {weekdayLabels.map((label, index) => (
                                    <div
                                        key={label}
                                        className={`py-3 text-center text-xs font-bold uppercase ${
                                            index === 0 || index === 6 ? 'text-rose-400' : 'text-gray-400'
                                        }`}
                                    >
                                        {label}
                                    </div>
                                ))}
                            </div>
                            <div className="grid grid-cols-7 overflow-hidden rounded-2xl border border-gray-100 bg-gray-100">
                                {calendarDays.map(({ date, isoDate, isCurrentMonth }) => {
                                    const day = daysByDate.get(isoDate);
                                    const holiday = holidaysByDate.get(isoDate);
                                    const isToday = isoDate === toIsoDate(new Date());
                                    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                                    const reason = holiday?.name ?? formatCalendarReason(day?.reason);

                                    return (
                                        <button
                                            key={isoDate}
                                            type="button"
                                            disabled={!isCurrentMonth}
                                            onClick={() => handleDayClick(isoDate)}
                                            className={`relative min-h-28 border-b border-r border-white p-2 text-left transition sm:min-h-32 sm:p-3 ${
                                                !isCurrentMonth
                                                    ? 'cursor-default bg-gray-50 text-gray-300'
                                                    : holiday || day?.isSchoolDay === false
                                                        ? 'bg-rose-50 hover:bg-rose-100'
                                                        : day?.isSchoolDay
                                                            ? 'bg-white hover:bg-green-50'
                                                            : 'bg-white hover:bg-gray-50'
                                            }`}
                                        >
                                            <span
                                                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                                                    isToday
                                                        ? 'bg-primary text-white shadow-md shadow-green-200'
                                                        : isWeekend && isCurrentMonth
                                                            ? 'text-rose-500'
                                                            : 'text-gray-700'
                                                }`}
                                            >
                                                {date.getDate()}
                                            </span>

                                            {isCurrentMonth && (
                                                <div className="mt-2">
                                                    {reason ? (
                                                        <span className="line-clamp-2 block rounded-lg bg-rose-100 px-2 py-1 text-[11px] font-bold leading-4 text-rose-700">
                                                            {reason}
                                                        </span>
                                                    ) : day?.isSchoolDay ? (
                                                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-700">
                                                            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                                                            เปิดเรียน
                                                        </span>
                                                    ) : (
                                                        <span className="text-[11px] text-gray-400">
                                                            {isWeekend ? 'วันหยุดสุดสัปดาห์' : 'ไม่มีข้อมูล'}
                                                        </span>
                                                    )}
                                                </div>
                                            )}

                                            {holiday && (
                                                <Edit3 className="absolute right-2 top-2 text-rose-400" size={14} />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-5 border-t border-gray-100 px-6 py-4 text-xs text-gray-500">
                        <span className="flex items-center gap-2">
                            <span className="h-3 w-3 rounded-full bg-green-500" /> วันเปิดเรียน
                        </span>
                        <span className="flex items-center gap-2">
                            <span className="h-3 w-3 rounded-full bg-rose-400" /> วันหยุด
                        </span>
                        <span className="flex items-center gap-2">
                            <span className="h-3 w-3 rounded-full bg-primary ring-4 ring-green-100" /> วันนี้
                        </span>
                    </div>
                </section>

                <aside className="h-fit overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
                    <div className="border-b border-gray-100 px-5 py-5">
                        <h2 className="font-bold text-gray-900">วันหยุดเดือนนี้</h2>
                        <p className="mt-1 text-sm text-gray-500">จัดการวันหยุดที่เพิ่มไว้ในระบบ</p>
                    </div>
                    <div className="max-h-[620px] divide-y divide-gray-100 overflow-y-auto">
                        {holidaysThisMonth.length === 0 ? (
                            <div className="px-6 py-12 text-center">
                                <CalendarDays className="mx-auto text-gray-300" size={34} />
                                <p className="mt-3 text-sm font-medium text-gray-500">ยังไม่มีวันหยุดในเดือนนี้</p>
                                <button
                                    type="button"
                                    onClick={() => openCreateModal()}
                                    className="mt-4 text-sm font-bold text-primary hover:underline"
                                >
                                    + เพิ่มวันหยุด
                                </button>
                            </div>
                        ) : (
                            holidaysThisMonth.map(holiday => (
                                <div key={holiday.id} className="group p-4 transition hover:bg-gray-50">
                                    <div className="flex items-start gap-3">
                                        <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                                            <span className="text-lg font-bold leading-none">
                                                {parseDate(holiday.date).getDate()}
                                            </span>
                                            <span className="mt-1 text-[9px] font-bold">
                                                {new Intl.DateTimeFormat('th-TH', { month: 'short' }).format(
                                                    parseDate(holiday.date)
                                                )}
                                            </span>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="font-bold text-gray-800">{holiday.name}</p>
                                            <p className="mt-1 text-xs text-gray-400">
                                                {formatThaiDate(holiday.date, { weekday: 'long' })}
                                            </p>
                                        </div>
                                        <div className="flex gap-1">
                                            <button
                                                type="button"
                                                onClick={() => openEditModal(holiday)}
                                                className="rounded-lg p-2 text-gray-400 transition hover:bg-blue-50 hover:text-blue-600"
                                                aria-label={`แก้ไข ${holiday.name}`}
                                            >
                                                <Edit3 size={16} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => void handleDeleteHoliday(holiday)}
                                                className="rounded-lg p-2 text-gray-400 transition hover:bg-rose-50 hover:text-rose-600"
                                                aria-label={`ลบ ${holiday.name}`}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </aside>
            </div>

            {showHolidayModal && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
                    onMouseDown={() => setShowHolidayModal(false)}
                >
                    <div
                        className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl"
                        onMouseDown={event => event.stopPropagation()}
                    >
                        <div className="flex items-start justify-between border-b border-gray-100 px-6 py-5">
                            <div>
                                <h2 className="text-xl font-bold text-gray-900">
                                    {holidayForm.id ? 'แก้ไขวันหยุด' : 'เพิ่มวันหยุด'}
                                </h2>
                                <p className="mt-1 text-sm text-gray-500">
                                    ภาคเรียน {selectedTerm?.term}/{selectedTerm?.year}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowHolidayModal(false)}
                                className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                                aria-label="ปิด"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSaveHoliday} className="space-y-5 p-6">
                            <div>
                                <label className="mb-2 block text-sm font-bold text-gray-700">วันที่</label>
                                <input
                                    type="date"
                                    required
                                    min={selectedTerm?.startDate ? dateOnly(selectedTerm.startDate) : undefined}
                                    max={selectedTerm?.endDate ? dateOnly(selectedTerm.endDate) : undefined}
                                    value={holidayForm.date}
                                    onChange={event =>
                                        setHolidayForm(current => ({ ...current, date: event.target.value }))
                                    }
                                    className="w-full rounded-xl border border-gray-200 px-4 py-3 outline-none transition focus:border-primary focus:ring-4 focus:ring-green-100"
                                />
                            </div>
                            <div>
                                <label className="mb-2 block text-sm font-bold text-gray-700">ชื่อวันหยุด</label>
                                <input
                                    type="text"
                                    required
                                    maxLength={120}
                                    autoFocus
                                    placeholder="เช่น วันขึ้นปีใหม่"
                                    value={holidayForm.name}
                                    onChange={event =>
                                        setHolidayForm(current => ({ ...current, name: event.target.value }))
                                    }
                                    className="w-full rounded-xl border border-gray-200 px-4 py-3 outline-none transition focus:border-primary focus:ring-4 focus:ring-green-100"
                                />
                            </div>

                            <div className="flex flex-col-reverse gap-3 border-t border-gray-100 pt-5 sm:flex-row">
                                {holidayForm.id && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const holiday = holidays.find(item => item.id === holidayForm.id);
                                            if (holiday) void handleDeleteHoliday(holiday);
                                        }}
                                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 px-4 py-2.5 font-bold text-rose-600 hover:bg-rose-50"
                                    >
                                        <Trash2 size={17} />
                                        ลบ
                                    </button>
                                )}
                                <div className="flex flex-1 gap-3 sm:justify-end">
                                    <button
                                        type="button"
                                        onClick={() => setShowHolidayModal(false)}
                                        className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 font-bold text-gray-600 hover:bg-gray-50 sm:flex-none"
                                    >
                                        ยกเลิก
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={savingHoliday}
                                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 font-bold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
                                    >
                                        {savingHoliday ? (
                                            <LoaderCircle className="animate-spin" size={17} />
                                        ) : (
                                            <Save size={17} />
                                        )}
                                        {holidayForm.id ? 'บันทึกการแก้ไข' : 'เพิ่มวันหยุด'}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
