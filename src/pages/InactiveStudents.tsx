import { useEffect, useMemo, useState } from 'react';
import {
    ArrowRightToLine,
    CalendarClock,
    Filter,
    Loader2,
    PauseCircle,
    RefreshCw,
    Search,
    UserMinus,
    Users,
    X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Swal from 'sweetalert2';
import api from '../services/api';

type InactiveStatus = 'TRANSFERRED' | 'STUDY_LEAVE';

interface Term {
    id: number;
    term: number;
    year: number;
    isActive: boolean;
}

interface Classroom {
    id: number;
    name: string;
    termId: number;
}

interface ApiStudent {
    studentId: string;
    citizenId: string;
    firstName: string;
    lastName: string;
    sourceClassroomId: number;
    sourceClassroomName: string;
    endedAt?: string;
    exitReason?: InactiveStatus;
    status?: InactiveStatus;
}

interface CandidatesResponse {
    studyLeaveStudents?: ApiStudent[];
    transferOutStudents?: ApiStudent[];
    inactiveStudents?: ApiStudent[];
}

interface InactiveStudent extends ApiStudent {
    status: InactiveStatus;
}

const getErrorMessage = (error: unknown, fallback: string) => {
    if (typeof error === 'object' && error !== null && 'response' in error) {
        const response = (error as { response?: { data?: { message?: string | string[] } } }).response;
        const message = response?.data?.message;
        if (Array.isArray(message)) return message.join(', ');
        if (message) return message;
    }
    return fallback;
};

const createIdempotencyKey = () =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `return-student-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const formatDate = (value?: string) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return new Intl.DateTimeFormat('th-TH', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    }).format(date);
};

export default function InactiveStudents() {
    const [terms, setTerms] = useState<Term[]>([]);
    const [classrooms, setClassrooms] = useState<Classroom[]>([]);
    const [students, setStudents] = useState<InactiveStudent[]>([]);
    const [termId, setTermId] = useState<number | ''>('');
    const [statusFilter, setStatusFilter] = useState<'ALL' | InactiveStatus>('ALL');
    const [roomFilter, setRoomFilter] = useState('ALL');
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [returningStudent, setReturningStudent] = useState<InactiveStudent | null>(null);
    const [targetClassroomId, setTargetClassroomId] = useState<number | ''>('');
    const [submitting, setSubmitting] = useState(false);

    const loadStudents = async (selectedTermId: number, quiet = false) => {
        if (!quiet) setRefreshing(true);
        try {
            const response = await api.get<CandidatesResponse>(
                `/promotions/enrollment-changes/candidates?termId=${selectedTermId}`,
            );
            const data = response.data;
            const normalized = data.inactiveStudents?.map((student) => ({
                ...student,
                status: student.exitReason ?? student.status ?? 'STUDY_LEAVE',
            })) ?? [
                    ...(data.studyLeaveStudents ?? []).map((student) => ({
                        ...student,
                        status: 'STUDY_LEAVE' as const,
                    })),
                    ...(data.transferOutStudents ?? []).map((student) => ({
                        ...student,
                        status: 'TRANSFERRED' as const,
                    })),
                ];
            setStudents(normalized);
        } catch (error) {
            toast.error(getErrorMessage(error, 'โหลดรายชื่อนักเรียนนอกระบบไม่สำเร็จ'));
        } finally {
            setRefreshing(false);
        }
    };

    useEffect(() => {
        const loadInitialData = async () => {
            try {
                const [termsResponse, classroomsResponse] = await Promise.all([
                    api.get<Term[]>('/terms'),
                    api.get<Classroom[]>('/classrooms'),
                ]);
                setTerms(termsResponse.data);
                setClassrooms(classroomsResponse.data);
                const activeTerm = termsResponse.data.find((term) => term.isActive) ?? termsResponse.data[0];
                if (activeTerm) {
                    setTermId(activeTerm.id);
                    await loadStudents(activeTerm.id, true);
                }
            } catch (error) {
                toast.error(getErrorMessage(error, 'โหลดข้อมูลระบบไม่สำเร็จ'));
            } finally {
                setLoading(false);
            }
        };
        void loadInitialData();
    }, []);

    const targetRooms = useMemo(
        () => classrooms.filter((room) => room.termId === Number(termId)).sort((a, b) => a.name.localeCompare(b.name, 'th')),
        [classrooms, termId],
    );

    const sourceRooms = useMemo(
        () => [...new Map(students.map((student) => [student.sourceClassroomId, student.sourceClassroomName])).entries()]
            .sort((a, b) => a[1].localeCompare(b[1], 'th')),
        [students],
    );

    const filteredStudents = useMemo(() => {
        const keyword = search.trim().toLocaleLowerCase('th');
        return students.filter((student) => {
            const matchesStatus = statusFilter === 'ALL' || student.status === statusFilter;
            const matchesRoom = roomFilter === 'ALL' || student.sourceClassroomId === Number(roomFilter);
            const matchesSearch = !keyword ||
                `${student.citizenId} ${student.firstName} ${student.lastName} ${student.sourceClassroomName}`
                    .toLocaleLowerCase('th')
                    .includes(keyword);
            return matchesStatus && matchesRoom && matchesSearch;
        });
    }, [roomFilter, search, statusFilter, students]);

    const transferCount = students.filter((student) => student.status === 'TRANSFERRED').length;
    const leaveCount = students.filter((student) => student.status === 'STUDY_LEAVE').length;

    const openReturnModal = (student: InactiveStudent) => {
        setReturningStudent(student);
        const previousRoom = targetRooms.find((room) => room.id === student.sourceClassroomId);
        setTargetClassroomId(previousRoom?.id ?? targetRooms[0]?.id ?? '');
    };

    const closeReturnModal = () => {
        if (submitting) return;
        setReturningStudent(null);
        setTargetClassroomId('');
    };

    const handleReturn = async () => {
        if (!returningStudent || !termId || !targetClassroomId) {
            toast.error('กรุณาเลือกห้องเรียนที่จะรับเข้า');
            return;
        }

        setSubmitting(true);
        try {
            const changes = [{
                studentId: returningStudent.studentId,
                action: 'RETURN_TO_STUDY',
                targetClassroomId: Number(targetClassroomId),
            }];
            const previewResponse = await api.post<{
                issues: { message: string }[];
            }>('/promotions/enrollment-changes/preview', {
                termId: Number(termId),
                changes,
            });

            if (previewResponse.data.issues.length > 0) {
                await Swal.fire({
                    icon: 'warning',
                    title: 'ยังไม่สามารถรับเข้าได้',
                    text: previewResponse.data.issues.map((issue) => issue.message).join('\n'),
                    confirmButtonColor: '#166534',
                    confirmButtonText: 'รับทราบ',
                });
                return;
            }

            const targetRoom = targetRooms.find((room) => room.id === Number(targetClassroomId));
            const confirmation = await Swal.fire({
                icon: 'question',
                title: 'ยืนยันรับนักเรียนเข้า?',
                text: `${returningStudent.firstName} ${returningStudent.lastName} เข้าห้อง ${targetRoom?.name ?? '-'}`,
                showCancelButton: true,
                confirmButtonColor: '#166534',
                cancelButtonColor: '#64748b',
                confirmButtonText: 'ยืนยันรับเข้า',
                cancelButtonText: 'ยกเลิก',
            });
            if (!confirmation.isConfirmed) return;

            await api.post('/promotions/enrollment-changes/apply', {
                termId: Number(termId),
                changes,
                idempotencyKey: createIdempotencyKey(),
            });
            toast.success('รับนักเรียนเข้าระบบเรียบร้อยแล้ว');
            setReturningStudent(null);
            setTargetClassroomId('');
            await loadStudents(Number(termId));
        } catch (error) {
            toast.error(getErrorMessage(error, 'รับนักเรียนเข้าระบบไม่สำเร็จ'));
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex min-h-[420px] items-center justify-center text-primary">
                <Loader2 className="animate-spin" size={34} />
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-7xl space-y-6">
            <section className="overflow-hidden rounded-3xl bg-gradient-to-r from-[#063d1f] to-[#1B813E] p-7 text-white shadow-xl">
                <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
                    <div className="flex items-start gap-4">
                        <div className="rounded-2xl bg-white/15 p-3"><UserMinus size={30} /></div>
                        <div>
                            <h1 className="text-2xl font-black">รายชื่อนักเรียนนอกระบบ</h1>
                            <p className="mt-1 text-sm text-green-50/80">ตรวจสอบนักเรียนย้ายออกหรือพักการเรียน และรับกลับเข้าศึกษา</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => termId && loadStudents(Number(termId))}
                        disabled={refreshing || !termId}
                        className="flex items-center justify-center gap-2 rounded-xl bg-white/15 px-4 py-2.5 text-sm font-bold transition hover:bg-white/25 disabled:opacity-50"
                    >
                        <RefreshCw className={refreshing ? 'animate-spin' : ''} size={18} /> รีเฟรช
                    </button>
                </div>
            </section>

            <section className="grid gap-4 sm:grid-cols-3">
                <StatCard icon={Users} label="นักเรียนนอกระบบทั้งหมด" value={students.length} color="slate" />
                <StatCard icon={UserMinus} label="ย้ายออก" value={transferCount} color="rose" />
                <StatCard icon={PauseCircle} label="พักการเรียน" value={leaveCount} color="amber" />
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2 text-sm font-black text-slate-700"><Filter size={18} className="text-primary" /> ค้นหาและตัวกรอง</div>
                <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_210px_210px_210px]">
                    <div className="relative">
                        <Search className="absolute left-3 top-3 text-slate-400" size={18} />
                        <input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="ค้นหาชื่อ เลขประจำตัว หรือห้องเดิม"
                            className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-4 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                        />
                    </div>
                    <select
                        value={termId}
                        onChange={async (event) => {
                            const value = event.target.value ? Number(event.target.value) : '';
                            setTermId(value);
                            setRoomFilter('ALL');
                            if (value) await loadStudents(value);
                            else setStudents([]);
                        }}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2.5"
                    >
                        <option value="">เลือกภาคเรียน</option>
                        {terms.slice().sort((a, b) => b.year - a.year || b.term - a.term).map((term) => (
                            <option key={term.id} value={term.id}>ภาคเรียน {term.term}/{term.year}{term.isActive ? ' (ปัจจุบัน)' : ''}</option>
                        ))}
                    </select>
                    <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                        <option value="ALL">ทุกสถานะ</option>
                        <option value="TRANSFERRED">ย้ายออก</option>
                        <option value="STUDY_LEAVE">พักการเรียน</option>
                    </select>
                    <select value={roomFilter} onChange={(event) => setRoomFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                        <option value="ALL">ทุกห้องเดิม</option>
                        {sourceRooms.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                    </select>
                </div>
            </section>

            <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
                    <div>
                        <h2 className="font-black text-slate-900">รายชื่อนักเรียน</h2>
                        <p className="mt-0.5 text-xs text-slate-500">พบ {filteredStudents.length.toLocaleString()} รายการ</p>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[850px] text-sm">
                        <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                            <tr>
                                <th className="px-6 py-3.5">นักเรียน</th>
                                <th className="px-4 py-3.5">ห้องเดิม</th>
                                <th className="px-4 py-3.5">สถานะ</th>
                                <th className="px-4 py-3.5">วันที่ออกจากระบบ</th>
                                <th className="px-6 py-3.5 text-right">จัดการ</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredStudents.map((student) => (
                                <tr key={student.studentId} className="transition hover:bg-slate-50/70">
                                    <td className="px-6 py-4">
                                        <p className="font-black text-slate-800">{student.firstName} {student.lastName}</p>
                                        <p className="mt-0.5 text-xs text-slate-400">{student.citizenId}</p>
                                    </td>
                                    <td className="px-4 py-4 font-bold text-slate-600">{student.sourceClassroomName}</td>
                                    <td className="px-4 py-4"><StatusBadge status={student.status} /></td>
                                    <td className="px-4 py-4 text-slate-500"><span className="flex items-center gap-2"><CalendarClock size={16} />{formatDate(student.endedAt)}</span></td>
                                    <td className="px-6 py-4 text-right">
                                        <button
                                            type="button"
                                            onClick={() => openReturnModal(student)}
                                            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 font-bold text-white shadow-sm transition hover:bg-[#126b34]"
                                        >
                                            <ArrowRightToLine size={17} /> รับเข้า
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {filteredStudents.length === 0 && (
                        <div className="px-6 py-16 text-center">
                            <UserMinus className="mx-auto text-slate-300" size={42} />
                            <p className="mt-3 font-bold text-slate-600">ไม่พบรายชื่อนักเรียน</p>
                            <p className="mt-1 text-sm text-slate-400">ลองเปลี่ยนคำค้นหาหรือตัวกรองอีกครั้ง</p>
                        </div>
                    )}
                </div>
            </section>

            {returningStudent && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && closeReturnModal()}>
                    <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h2 className="text-xl font-black text-slate-900">รับนักเรียนเข้าระบบ</h2>
                                <p className="mt-1 text-sm text-slate-500">เลือกห้องเรียนที่จะรับนักเรียนกลับเข้า</p>
                            </div>
                            <button type="button" onClick={closeReturnModal} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"><X size={20} /></button>
                        </div>
                        <div className="mt-5 rounded-2xl bg-slate-50 p-4">
                            <p className="font-black text-slate-800">{returningStudent.firstName} {returningStudent.lastName}</p>
                            <p className="mt-1 text-xs text-slate-500">เลขประจำตัว {returningStudent.citizenId} · ห้องเดิม {returningStudent.sourceClassroomName}</p>
                        </div>
                        <label className="mt-5 block">
                            <span className="mb-2 block text-sm font-bold text-slate-700">ห้องเรียนที่รับเข้า</span>
                            <select value={targetClassroomId} onChange={(event) => setTargetClassroomId(event.target.value ? Number(event.target.value) : '')} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-primary">
                                <option value="">เลือกห้องเรียน</option>
                                {targetRooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
                            </select>
                        </label>
                        <div className="mt-6 flex justify-end gap-3">
                            <button type="button" onClick={closeReturnModal} disabled={submitting} className="rounded-xl border border-slate-200 px-5 py-2.5 font-bold text-slate-600">ยกเลิก</button>
                            <button type="button" onClick={handleReturn} disabled={submitting || !targetClassroomId} className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 font-black text-white disabled:opacity-40">
                                {submitting ? <Loader2 className="animate-spin" size={18} /> : <ArrowRightToLine size={18} />} ยืนยันรับเข้า
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function StatusBadge({ status }: { status: InactiveStatus }) {
    const isTransferred = status === 'TRANSFERRED';
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black ${isTransferred ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200' : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'}`}>
            {isTransferred ? <UserMinus size={14} /> : <PauseCircle size={14} />}
            {isTransferred ? 'ย้ายออก' : 'พักการเรียน'}
        </span>
    );
}

function StatCard({ icon: Icon, label, value, color }: { icon: typeof Users; label: string; value: number; color: 'slate' | 'rose' | 'amber' }) {
    const colors = {
        slate: 'bg-slate-100 text-slate-700',
        rose: 'bg-rose-50 text-rose-700',
        amber: 'bg-amber-50 text-amber-700',
    };
    return (
        <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${colors[color]}`}><Icon size={23} /></span>
            <div><p className="text-2xl font-black text-slate-900">{value.toLocaleString()}</p><p className="text-xs font-bold text-slate-500">{label}</p></div>
        </div>
    );
}
