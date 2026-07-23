import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    AlertTriangle,
    Award,
    BarChart3,
    Bell,
    CalendarDays,
    CheckCircle2,
    ChevronRight,
    Clock3,
    GraduationCap,
    LoaderCircle,
    Medal,
    School,
    Search,
    Send,
    Shield,
    TrendingUp,
    UserCheck,
    Users,
    X,
    XCircle
} from 'lucide-react';
import { isAxiosError } from 'axios';
import toast from 'react-hot-toast';
import api from '../services/api';

interface Term {
    id: number;
    term: number;
    year: number;
    startDate?: string | null;
    endDate?: string | null;
    isActive: boolean;
}

interface Classroom {
    id: number;
    name: string;
    termId: number;
    advisors?: { id: string; firstName: string; lastName: string }[];
    _count?: { students: number };
}

interface Teacher {
    id: string;
    firstName: string;
    lastName: string;
    role: 'ADMIN' | 'TEACHER' | 'AFFAIRS';
    lineUserId: string | null;
}

type UserRole = 'ADMIN' | 'TEACHER' | 'AFFAIRS' | 'STUDENT' | 'PARENT';

interface LinkedLineUser {
    id: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    classroom?: { name: string } | null;
}

interface SummaryResponse {
    summary: {
        total: number;
        failedCount: number;
        normalCount: number;
        certificateCount: number;
        shieldCount: number;
    };
}

interface MissingDetail {
    classroomId: number;
    className: string;
    advisorName: string;
    studentCount: number;
    isAssemblyChecked: boolean;
    isAreaChecked: boolean;
}

interface MissingReportResponse {
    targetDate: string;
    summary: {
        totalClassrooms: number;
        missingAssembly: number;
        missingArea: number;
    };
    details: MissingDetail[];
}

interface AttendanceSummaryItem {
    classroomId: number;
    classroomName: string;
    statistics: {
        totalStudents: number;
        totalChecked: number;
        notChecked: number;
        present: number;
        absent: number;
        late: number;
        leave: number;
        activity?: number;
    };
}

interface AttendanceSummaryResponse {
    summary: AttendanceSummaryItem[];
}

interface AttendanceHistoryRecord {
    id: string;
    type: 'ASSEMBLY' | 'AREA';
    status: 'PRESENT' | 'ABSENT' | 'LATE' | 'LEAVE' | 'ACTIVITY';
    date: string;
    student: {
        citizenId: string;
    };
}

interface AttendanceTypeTotals {
    checked: number;
    notChecked: number;
    present: number;
    absent: number;
    late: number;
    leave: number;
    activity: number;
}

interface AttendanceTotals {
    students: number;
    assembly: AttendanceTypeTotals;
    area: AttendanceTypeTotals;
}

interface CalendarResponse {
    termId: number;
    workingDays: number;
    days: {
        date: string;
        isSchoolDay: boolean;
        reason: string | null;
    }[];
}

const numberFormat = new Intl.NumberFormat('th-TH');

const toIsoDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const toMonthParam = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

const dateOnly = (date?: string | null) =>
    date?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? '';

const parseDate = (date: string) => {
    const [year, month, day] = dateOnly(date).split('-').map(Number);
    return new Date(year, month - 1, day);
};

const formatThaiDate = (date?: string | null, options?: Intl.DateTimeFormatOptions) => {
    if (!date) return '-';
    return new Intl.DateTimeFormat('th-TH', options ?? {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    }).format(parseDate(date));
};

const percent = (value: number, total: number) => {
    if (!total) return 0;
    return Math.round((value / total) * 100);
};

const roleLabel: Record<Teacher['role'], string> = {
    ADMIN: 'ผู้ดูแลระบบ',
    TEACHER: 'ครู',
    AFFAIRS: 'ฝ่ายกิจการ'
};

const roleColor: Record<Teacher['role'], string> = {
    ADMIN: 'bg-[#063d1f] text-secondary',
    TEACHER: 'bg-primary/10 text-primary',
    AFFAIRS: 'bg-secondary/30 text-[#7a5f00]'
};

const lineRoleLabel: Record<UserRole, string> = {
    ADMIN: 'ผู้ดูแลระบบ',
    TEACHER: 'ครู',
    AFFAIRS: 'ฝ่ายกิจการ',
    STUDENT: 'นักเรียน',
    PARENT: 'ผู้ปกครอง'
};

const getApiErrorMessage = (error: unknown, fallback: string) => {
    if (!isAxiosError<{ message?: string }>(error)) return fallback;
    return error.response?.data?.message || fallback;
};

const emptyAttendanceTypeTotals = (): AttendanceTypeTotals => ({
    checked: 0,
    notChecked: 0,
    present: 0,
    absent: 0,
    late: 0,
    leave: 0,
    activity: 0
});

const emptyAttendanceTotals = (): AttendanceTotals => ({
    students: 0,
    assembly: emptyAttendanceTypeTotals(),
    area: emptyAttendanceTypeTotals()
});

const parseAttendanceRecords = (data: unknown): AttendanceHistoryRecord[] => {
    const response = data as {
        records?: AttendanceHistoryRecord[] | {
            ASSEMBLY?: AttendanceHistoryRecord[];
            AREA?: AttendanceHistoryRecord[];
        };
    };
    if (Array.isArray(data)) return data as AttendanceHistoryRecord[];
    if (Array.isArray(response?.records)) return response.records;

    return [
        ...(response?.records?.ASSEMBLY ?? []),
        ...(response?.records?.AREA ?? [])
    ];
};

const calculateUniqueAttendanceTotals = (
    summary: AttendanceSummaryItem[],
    records: AttendanceHistoryRecord[]
): AttendanceTotals => {
    const students = summary.reduce((total, item) => total + item.statistics.totalStudents, 0);
    const latestRecordByStudentAndType = new Map<string, AttendanceHistoryRecord>();
    records
        .slice()
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .forEach(record => {
            latestRecordByStudentAndType.set(`${record.student.citizenId}|${record.type}`, record);
        });

    const calculateTypeTotals = (type: AttendanceHistoryRecord['type']): AttendanceTypeTotals => {
        const checkedStudents = new Set<string>();
        const presentStudents = new Set<string>();
        const absentStudents = new Set<string>();
        const leaveStudents = new Set<string>();
        const lateStudents = new Set<string>();
        const activityStudents = new Set<string>();

        latestRecordByStudentAndType.forEach(record => {
            if (record.type !== type) return;
            const studentId = record.student.citizenId;
            checkedStudents.add(studentId);
            if (record.status === 'PRESENT' || record.status === 'LATE') presentStudents.add(studentId);
            if (record.status === 'ABSENT') absentStudents.add(studentId);
            if (record.status === 'LEAVE') leaveStudents.add(studentId);
            if (record.status === 'LATE' && type === 'ASSEMBLY') lateStudents.add(studentId);
            if (record.status === 'ACTIVITY') activityStudents.add(studentId);
        });

        return {
            checked: checkedStudents.size,
            notChecked: Math.max(students - checkedStudents.size, 0),
            present: presentStudents.size,
            absent: absentStudents.size,
            late: lateStudents.size,
            leave: leaveStudents.size,
            activity: activityStudents.size
        };
    };

    return {
        students,
        assembly: calculateTypeTotals('ASSEMBLY'),
        area: calculateTypeTotals('AREA')
    };
};

export default function Dashboard() {
    const [terms, setTerms] = useState<Term[]>([]);
    const [classrooms, setClassrooms] = useState<Classroom[]>([]);
    const [teachers, setTeachers] = useState<Teacher[]>([]);
    const [schoolSummary, setSchoolSummary] = useState<SummaryResponse | null>(null);
    const [missingReport, setMissingReport] = useState<MissingReportResponse | null>(null);
    const [attendanceTotals, setAttendanceTotals] = useState<AttendanceTotals>(emptyAttendanceTotals);
    const [calendar, setCalendar] = useState<CalendarResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadWarnings, setLoadWarnings] = useState<string[]>([]);
    const [isLineTestOpen, setIsLineTestOpen] = useState(false);
    const [linkedLineUsers, setLinkedLineUsers] = useState<LinkedLineUser[]>([]);
    const [linkedUsersLoading, setLinkedUsersLoading] = useState(false);
    const [lineUserSearch, setLineUserSearch] = useState('');
    const [selectedLineUserId, setSelectedLineUserId] = useState('');
    const [lineTestMessage, setLineTestMessage] = useState('');
    const [sendingLineTest, setSendingLineTest] = useState(false);

    const today = useMemo(() => toIsoDate(new Date()), []);
    const currentMonth = useMemo(() => toMonthParam(new Date()), []);

    const activeTerm = useMemo(
        () => terms.find(term => term.isActive) ?? terms[0],
        [terms]
    );

    const activeClassrooms = useMemo(() => {
        if (!activeTerm) return classrooms;
        return classrooms.filter(room => room.termId === activeTerm.id);
    }, [activeTerm, classrooms]);

    const teacherRoleCounts = useMemo(() => {
        return teachers.reduce<Record<Teacher['role'], number>>(
            (counts, teacher) => ({
                ...counts,
                [teacher.role]: counts[teacher.role] + 1
            }),
            { ADMIN: 0, TEACHER: 0, AFFAIRS: 0 }
        );
    }, [teachers]);

    const roomsNeedAction = useMemo(() => {
        return [...(missingReport?.details ?? [])]
            .filter(room => !room.isAssemblyChecked || !room.isAreaChecked)
            .sort((a, b) => {
                const aMissing = Number(!a.isAssemblyChecked) + Number(!a.isAreaChecked);
                const bMissing = Number(!b.isAssemblyChecked) + Number(!b.isAreaChecked);
                return bMissing - aMissing || a.className.localeCompare(b.className, 'th');
            })
            .slice(0, 6);
    }, [missingReport]);

    const summary = schoolSummary?.summary;
    const completedClassrooms = Math.max(
        0,
        (missingReport?.summary.totalClassrooms ?? 0) -
        new Set(roomsNeedAction.map(room => room.classroomId)).size
    );
    const attendanceCompletion = percent(
        completedClassrooms,
        missingReport?.summary.totalClassrooms ?? 0
    );

    const filteredLinkedLineUsers = useMemo(() => {
        const query = lineUserSearch.trim().toLocaleLowerCase('th');
        if (!query) return linkedLineUsers;

        return linkedLineUsers.filter(user =>
            `${user.firstName} ${user.lastName} ${lineRoleLabel[user.role]} ${user.classroom?.name ?? ''}`
                .toLocaleLowerCase('th')
                .includes(query)
        );
    }, [lineUserSearch, linkedLineUsers]);

    const openLineTestModal = async () => {
        setIsLineTestOpen(true);
        setLinkedUsersLoading(true);
        setLinkedLineUsers([]);
        setLineUserSearch('');
        setSelectedLineUserId('');
        setLineTestMessage('');

        try {
            const response = await api.get<LinkedLineUser[]>('/line/linked-users');
            setLinkedLineUsers(response.data);
        } catch (error) {
            toast.error(getApiErrorMessage(error, 'โหลดรายชื่อผู้ใช้ที่ผูก LINE ไม่สำเร็จ'));
        } finally {
            setLinkedUsersLoading(false);
        }
    };

    const handleSendLineTest = async () => {
        if (!selectedLineUserId) {
            toast.error('กรุณาเลือกผู้รับการแจ้งเตือน');
            return;
        }

        setSendingLineTest(true);
        const toastId = toast.loading('กำลังส่งข้อความทดสอบ...');

        try {
            await api.post('/line/test-notification', {
                userId: selectedLineUserId,
                ...(lineTestMessage.trim() && { message: lineTestMessage.trim() })
            });
            toast.success('ส่งข้อความทดสอบผ่าน LINE สำเร็จ', { id: toastId });
            setIsLineTestOpen(false);
        } catch (error) {
            toast.error(getApiErrorMessage(error, 'ส่งข้อความทดสอบไม่สำเร็จ'), { id: toastId });
        } finally {
            setSendingLineTest(false);
        }
    };

    useEffect(() => {
        const loadDashboard = async () => {
            setLoading(true);
            setLoadWarnings([]);

            const warnings: string[] = [];

            try {
                const [termsResult, classroomsResult, teachersResult] = await Promise.allSettled([
                    api.get<Term[]>('/terms'),
                    api.get<Classroom[]>('/classrooms'),
                    api.get<Teacher[]>('/teachers/staff')
                ]);

                const termList = termsResult.status === 'fulfilled' ? termsResult.value.data : [];
                const classroomList = classroomsResult.status === 'fulfilled' ? classroomsResult.value.data : [];
                const teacherList = teachersResult.status === 'fulfilled' ? teachersResult.value.data : [];
                const currentTerm = termList.find(term => term.isActive) ?? termList[0];

                if (termsResult.status === 'rejected') warnings.push('ภาคเรียน');
                if (classroomsResult.status === 'rejected') warnings.push('ห้องเรียน');
                if (teachersResult.status === 'rejected') warnings.push('บุคลากร');

                setTerms(termList);
                setClassrooms(classroomList);
                setTeachers(teacherList);

                const summaryParams = new URLSearchParams();
                if (currentTerm?.id) summaryParams.append('termId', String(currentTerm.id));

                const [summaryResult, missingResult, attendanceSummaryResult, attendanceHistoryResult, calendarResult] = await Promise.allSettled([
                    api.get<SummaryResponse>(
                        `/summary/school-wide${summaryParams.toString() ? `?${summaryParams.toString()}` : ''}`
                    ),
                    api.get<MissingReportResponse>('/attendance/missing-report', { params: { date: today } }),
                    api.get<AttendanceSummaryResponse>('/attendance/summary/daily', { params: { date: today } }),
                    api.get('/attendance/history/daily', { params: { date: today } }),
                    currentTerm?.id
                        ? api.get<CalendarResponse>(`/terms/${currentTerm.id}/calendar`, {
                            params: { month: currentMonth }
                        })
                        : Promise.reject(new Error('No active term'))
                ]);

                if (summaryResult.status === 'fulfilled') {
                    setSchoolSummary(summaryResult.value.data);
                } else {
                    setSchoolSummary(null);
                    warnings.push('สรุปพฤติกรรม');
                }

                if (missingResult.status === 'fulfilled') {
                    setMissingReport(missingResult.value.data);
                } else {
                    setMissingReport(null);
                    warnings.push('สถานะเช็คชื่อครู');
                }

                if (attendanceSummaryResult.status === 'fulfilled' && attendanceHistoryResult.status === 'fulfilled') {
                    setAttendanceTotals(calculateUniqueAttendanceTotals(
                        attendanceSummaryResult.value.data.summary ?? [],
                        parseAttendanceRecords(attendanceHistoryResult.value.data)
                    ));
                } else {
                    setAttendanceTotals(emptyAttendanceTotals());
                    warnings.push('สถิติเช็คชื่อนักเรียน');
                }

                if (calendarResult.status === 'fulfilled') {
                    setCalendar(calendarResult.value.data);
                } else {
                    setCalendar(null);
                    if (currentTerm?.id) warnings.push('ปฏิทินการศึกษา');
                }

                setLoadWarnings(warnings);
                if (warnings.length >= 4) toast.error('โหลดข้อมูล Dashboard ได้ไม่ครบ');
            } catch {
                toast.error('ไม่สามารถโหลดข้อมูล Dashboard ได้');
            } finally {
                setLoading(false);
            }
        };

        void loadDashboard();
    }, [currentMonth, today]);

    if (loading) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center text-gray-500">
                <LoaderCircle className="mr-3 animate-spin text-primary" size={26} />
                กำลังโหลดข้อมูล "เทพศิรินทร์พุแค ที่แห่งนี้ดูแลเหมือนครอบครัว"
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-7xl space-y-6">
            <header className="overflow-hidden rounded-3xl bg-[#063d1f] text-white shadow-sm">
                <div className="relative p-6 sm:p-8">
                    <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/45 blur-3xl" />
                    <div className="absolute bottom-0 right-16 h-28 w-28 rounded-full bg-secondary/25 blur-2xl" />
                    <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-secondary/25 bg-secondary/15 px-3 py-1 text-xs font-bold text-yellow-50">
                                <TrendingUp size={14} />
                                ข้อมูลสดประจำวันที่ {formatThaiDate(today, { day: 'numeric', month: 'long', year: 'numeric' })}
                            </div>
                            <h1 className="text-2xl font-black sm:text-3xl">Dashboard ภาพรวมโรงเรียน</h1>
                            <p className="mt-2 max-w-2xl text-sm leading-6 text-yellow-50/75">
                                รวมข้อมูลสำคัญจากภาคเรียน ห้องเรียน บุคลากร การเช็คชื่อ และผลพฤติกรรมไว้ในหน้าเดียว
                            </p>
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
                            <button
                                type="button"
                                onClick={() => void openLineTestModal()}
                                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#06C755] px-5 py-4 text-sm font-black text-white shadow-lg shadow-black/10 transition hover:bg-[#05b64e] active:scale-[0.98]"
                            >
                                <Send size={18} />
                                ทดสอบแจ้งเตือน LINE
                            </button>
                            <div className="rounded-2xl border border-secondary/25 bg-white/10 p-4 backdrop-blur">
                                <p className="text-xs font-bold text-yellow-50/70">ภาคเรียนที่ใช้อ้างอิง</p>
                                <p className="mt-1 text-xl font-black">
                                    {activeTerm ? `ภาคเรียน ${activeTerm.term}/${activeTerm.year}` : 'ยังไม่มีภาคเรียน'}
                                </p>
                                <p className="mt-1 text-xs text-yellow-50/70">
                                    {activeTerm?.startDate && activeTerm?.endDate
                                        ? `${formatThaiDate(activeTerm.startDate)} – ${formatThaiDate(activeTerm.endDate)}`
                                        : 'ยังไม่ได้กำหนดช่วงเปิด–ปิดภาคเรียน'}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {loadWarnings.length > 0 && (
                <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    <AlertTriangle className="mt-0.5 shrink-0" size={18} />
                    <p>
                        โหลดข้อมูลบางส่วนไม่สำเร็จ: {loadWarnings.join(', ')}
                        <span className="ml-1 text-amber-700">ตัวเลขที่เห็นจะแสดงเฉพาะส่วนที่โหลดได้</span>
                    </p>
                </div>
            )}

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                    icon={Users}
                    label="นักเรียนทั้งหมด"
                    value={summary?.total ?? 0}
                    caption="จากสรุปผลพฤติกรรม"
                    color="bg-primary/10 text-primary"
                />
                <MetricCard
                    icon={School}
                    label="ห้องเรียนในภาคเรียนนี้"
                    value={activeClassrooms.length}
                    caption={`ทั้งหมดในระบบ ${numberFormat.format(classrooms.length)} ห้อง`}
                    color="bg-secondary/30 text-[#7a5f00]"
                />
                <MetricCard
                    icon={UserCheck}
                    label="ครูและบุคลากร"
                    value={teachers.length}
                    caption={`ผูก LINE แล้ว ${numberFormat.format(teachers.filter(teacher => teacher.lineUserId).length)} คน`}
                    color="bg-[#063d1f] text-secondary"
                />
                <MetricCard
                    icon={CalendarDays}
                    label="วันเปิดเรียนเดือนนี้"
                    value={calendar?.workingDays ?? 0}
                    caption={new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric' }).format(new Date())}
                    color="bg-primary/10 text-primary"
                />
            </section>

            <section className="grid gap-6">
                <div className="order-2 rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
                    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h2 className="flex items-center gap-2 text-lg font-black text-gray-900">
                                <BarChart3 className="text-primary" size={21} />
                                ผลประเมินพฤติกรรม
                            </h2>
                            <p className="mt-1 text-sm text-gray-500">แยกตามสถานะจากข้อมูลสรุปของภาคเรียน</p>
                        </div>
                        <Link
                            to="/school-summary"
                            className="inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline"
                        >
                            ดูรายชื่อนักเรียน
                            <ChevronRight size={16} />
                        </Link>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <DistributionRow
                            icon={CheckCircle2}
                            label="ผ่านเกณฑ์ปกติ"
                            value={summary?.normalCount ?? 0}
                            total={summary?.total ?? 0}
                            color="bg-primary"
                            textColor="text-primary"
                        />
                        <DistributionRow
                            icon={XCircle}
                            label="ไม่ผ่านเกณฑ์"
                            value={summary?.failedCount ?? 0}
                            total={summary?.total ?? 0}
                            color="bg-rose-500"
                            textColor="text-rose-700"
                        />
                        <DistributionRow
                            icon={Medal}
                            label="ได้รับเกียรติบัตร"
                            value={summary?.certificateCount ?? 0}
                            total={summary?.total ?? 0}
                            color="bg-primary"
                            textColor="text-primary"
                        />
                        <DistributionRow
                            icon={Award}
                            label="ได้รับโล่รางวัล"
                            value={summary?.shieldCount ?? 0}
                            total={summary?.total ?? 0}
                            color="bg-secondary"
                            textColor="text-[#7a5f00]"
                        />
                    </div>
                </div>

                <div className="order-1 rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
                    <div className="mb-5">
                        <div>
                            <h2 className="flex items-center gap-2 text-lg font-black text-gray-900">
                                <Clock3 className="text-primary" size={21} />
                                เช็คชื่อนักเรียนวันนี้
                            </h2>
                            <p className="mt-1 text-sm text-gray-500">แยกนักเรียนไม่ซ้ำคนตามประเภทการเช็คชื่อ</p>
                        </div>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                        <AttendanceTypePanel
                            title="เขตพื้นที่"
                            totals={attendanceTotals.area}
                            students={attendanceTotals.students}
                        />
                        <AttendanceTypePanel
                            title="เข้าแถว"
                            totals={attendanceTotals.assembly}
                            students={attendanceTotals.students}
                            showLate
                        />
                    </div>

                    <Link
                        to="/attendance-reports"
                        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white transition hover:bg-[#0f6b32]"
                    >
                        เปิดรายงานการเช็คชื่อ
                        <ChevronRight size={16} />
                    </Link>
                </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-[minmax(360px,0.85fr)_minmax(0,1.15fr)]">
                <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
                    <div className="mb-5 flex items-start justify-between gap-4">
                        <div>
                            <h2 className="flex items-center gap-2 text-lg font-black text-gray-900">
                                <Bell className="text-primary" size={21} />
                                สถานะครูเช็คชื่อ
                            </h2>
                            <p className="mt-1 text-sm text-gray-500">ห้องที่ยังต้องติดตามในวันนี้</p>
                        </div>
                        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                            ครบ {attendanceCompletion}%
                        </span>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                        <MiniStat label="ห้องทั้งหมด" value={missingReport?.summary.totalClassrooms ?? 0} />
                        <MiniStat label="ยังไม่เข้าแถว" value={missingReport?.summary.missingAssembly ?? 0} danger />
                        <MiniStat label="ยังไม่เขตพื้นที่" value={missingReport?.summary.missingArea ?? 0} danger />
                    </div>

                    <div className="mt-5 divide-y divide-gray-100 rounded-2xl border border-gray-100">
                        {roomsNeedAction.length === 0 ? (
                            <div className="flex items-center gap-3 p-4 text-sm text-primary">
                                <CheckCircle2 size={18} />
                                ครูเช็คชื่อครบแล้วสำหรับวันนี้
                            </div>
                        ) : (
                            roomsNeedAction.map(room => (
                                <div key={room.classroomId} className="p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="font-bold text-gray-900">{room.className}</p>
                                            <p className="mt-1 text-xs text-gray-500">
                                                ครูที่ปรึกษา: {room.advisorName || '-'} · {numberFormat.format(room.studentCount)} คน
                                            </p>
                                        </div>
                                        <div className="flex flex-wrap justify-end gap-1">
                                            {!room.isAssemblyChecked && (
                                                <span className="rounded-full bg-orange-50 px-2 py-1 text-[10px] font-bold text-orange-700">
                                                    เข้าแถว
                                                </span>
                                            )}
                                            {!room.isAreaChecked && (
                                                <span className="rounded-full bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-700">
                                                    เขตพื้นที่
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <Link
                        to="/attendance-monitoring"
                        className="mt-5 inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline"
                    >
                        ติดตามและส่งแจ้งเตือน
                        <ChevronRight size={16} />
                    </Link>
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                    <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
                        <h2 className="flex items-center gap-2 text-lg font-black text-gray-900">
                            <GraduationCap className="text-primary" size={21} />
                            บุคลากรตามบทบาท
                        </h2>
                        <div className="mt-5 space-y-3">
                            {(['TEACHER', 'AFFAIRS', 'ADMIN'] as Teacher['role'][]).map(role => (
                                <div key={role} className="flex items-center justify-between rounded-2xl border border-gray-100 p-4">
                                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${roleColor[role]}`}>
                                        {roleLabel[role]}
                                    </span>
                                    <span className="text-xl font-black text-gray-900">
                                        {numberFormat.format(teacherRoleCounts[role])}
                                    </span>
                                </div>
                            ))}
                        </div>
                        <Link
                            to="/teachers"
                            className="mt-5 inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline"
                        >
                            จัดการบุคลากร
                            <ChevronRight size={16} />
                        </Link>
                    </div>

                    <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
                        <h2 className="flex items-center gap-2 text-lg font-black text-gray-900">
                            <Shield className="text-primary" size={21} />
                            ทางลัดที่ใช้บ่อย
                        </h2>
                        <div className="mt-5 space-y-3">
                            <QuickLink to="/students" icon={Users} label="จัดการนักเรียน" />
                            <QuickLink to="/classrooms" icon={School} label="จัดการห้องเรียน" />
                            <QuickLink to="/academic-calendar" icon={CalendarDays} label="ปฏิทินการศึกษา" />
                            <QuickLink to="/behavior-points" icon={Shield} label="บันทึกคะแนนพฤติกรรม" />
                        </div>
                    </div>
                </div>
            </section>

            {isLineTestOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="line-test-title"
                    onMouseDown={() => !sendingLineTest && setIsLineTestOpen(false)}
                >
                    <div
                        className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl"
                        onMouseDown={event => event.stopPropagation()}
                    >
                        <div className="flex items-start justify-between border-b border-gray-100 px-6 py-5">
                            <div>
                                <h2 id="line-test-title" className="flex items-center gap-2 text-xl font-black text-gray-900">
                                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#06C755]/10 text-[#06C755]">
                                        <Bell size={21} />
                                    </span>
                                    ทดสอบแจ้งเตือน LINE
                                </h2>
                                <p className="mt-2 text-sm text-gray-500">
                                    เลือกผู้ใช้ที่ผูกบัญชี LINE แล้วเพื่อส่งข้อความทดสอบ
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsLineTestOpen(false)}
                                disabled={sendingLineTest}
                                className="rounded-xl p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed"
                                aria-label="ปิดหน้าต่าง"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="space-y-5 p-6">
                            <div>
                                <label htmlFor="line-user-search" className="mb-2 block text-sm font-bold text-gray-700">
                                    ผู้รับการแจ้งเตือน
                                </label>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                    <input
                                        id="line-user-search"
                                        type="search"
                                        value={lineUserSearch}
                                        onChange={event => setLineUserSearch(event.target.value)}
                                        placeholder="ค้นหาชื่อ บทบาท หรือห้องเรียน..."
                                        className="w-full rounded-xl border border-gray-200 py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
                                    />
                                </div>

                                <div className="mt-3 max-h-64 overflow-y-auto rounded-2xl border border-gray-200">
                                    {linkedUsersLoading ? (
                                        <div className="flex items-center justify-center gap-2 p-8 text-sm text-gray-500">
                                            <LoaderCircle className="animate-spin text-primary" size={20} />
                                            กำลังโหลดรายชื่อ...
                                        </div>
                                    ) : filteredLinkedLineUsers.length === 0 ? (
                                        <div className="p-8 text-center text-sm text-gray-500">
                                            {linkedLineUsers.length === 0
                                                ? 'ยังไม่มีผู้ใช้ที่ผูกบัญชี LINE'
                                                : 'ไม่พบผู้ใช้จากคำค้นหา'}
                                        </div>
                                    ) : (
                                        <div className="divide-y divide-gray-100">
                                            {filteredLinkedLineUsers.map(user => {
                                                const isSelected = selectedLineUserId === user.id;
                                                return (
                                                    <label
                                                        key={user.id}
                                                        className={`flex cursor-pointer items-center gap-3 p-4 transition ${
                                                            isSelected ? 'bg-[#06C755]/10' : 'hover:bg-gray-50'
                                                        }`}
                                                    >
                                                        <input
                                                            type="radio"
                                                            name="line-recipient"
                                                            value={user.id}
                                                            checked={isSelected}
                                                            onChange={() => setSelectedLineUserId(user.id)}
                                                            className="h-4 w-4 accent-[#06C755]"
                                                        />
                                                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-black text-primary">
                                                            {user.firstName.charAt(0)}
                                                        </span>
                                                        <span className="min-w-0 flex-1">
                                                            <span className="block truncate text-sm font-bold text-gray-900">
                                                                {user.firstName} {user.lastName}
                                                            </span>
                                                            <span className="mt-0.5 block text-xs text-gray-500">
                                                                {lineRoleLabel[user.role]}
                                                                {user.classroom?.name ? ` · ${user.classroom.name}` : ''}
                                                            </span>
                                                        </span>
                                                        <span className="rounded-full bg-[#06C755]/10 px-2.5 py-1 text-[11px] font-bold text-[#079b45]">
                                                            ผูก LINE แล้ว
                                                        </span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label htmlFor="line-test-message" className="mb-2 block text-sm font-bold text-gray-700">
                                    ข้อความทดสอบ <span className="font-normal text-gray-400">(ไม่บังคับ)</span>
                                </label>
                                <textarea
                                    id="line-test-message"
                                    value={lineTestMessage}
                                    onChange={event => setLineTestMessage(event.target.value)}
                                    maxLength={500}
                                    rows={3}
                                    placeholder="เว้นว่างเพื่อใช้ข้อความทดสอบมาตรฐานของระบบ"
                                    className="w-full resize-none rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
                                />
                                <p className="mt-1 text-right text-xs text-gray-400">{lineTestMessage.length}/500</p>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4">
                            <button
                                type="button"
                                onClick={() => setIsLineTestOpen(false)}
                                disabled={sendingLineTest}
                                className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-bold text-gray-600 transition hover:bg-gray-100 disabled:opacity-60"
                            >
                                ยกเลิก
                            </button>
                            <button
                                type="button"
                                onClick={() => void handleSendLineTest()}
                                disabled={!selectedLineUserId || linkedUsersLoading || sendingLineTest}
                                className="inline-flex items-center gap-2 rounded-xl bg-[#06C755] px-5 py-2.5 text-sm font-black text-white transition hover:bg-[#05b64e] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {sendingLineTest
                                    ? <LoaderCircle className="animate-spin" size={18} />
                                    : <Send size={18} />}
                                {sendingLineTest ? 'กำลังส่ง...' : 'ส่งข้อความทดสอบ'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

interface MetricCardProps {
    icon: React.ElementType;
    label: string;
    value: number;
    caption: string;
    color: string;
}

function MetricCard({ icon: Icon, label, value, caption, color }: MetricCardProps) {
    return (
        <div className="rounded-3xl border border-primary/10 bg-white p-5 shadow-sm transition hover:border-primary/25 hover:shadow-md">
            <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl ${color}`}>
                <Icon size={24} />
            </div>
            <p className="text-sm font-medium text-gray-500">{label}</p>
            <p className="mt-1 text-3xl font-black text-gray-900">{numberFormat.format(value)}</p>
            <p className="mt-2 text-xs text-gray-400">{caption}</p>
        </div>
    );
}

interface DistributionRowProps {
    icon: React.ElementType;
    label: string;
    value: number;
    total: number;
    color: string;
    textColor: string;
}

function DistributionRow({ icon: Icon, label, value, total, color, textColor }: DistributionRowProps) {
    const width = percent(value, total);

    return (
        <div className="rounded-2xl border border-primary/10 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <Icon className={textColor} size={18} />
                    <span className="text-sm font-bold text-gray-700">{label}</span>
                </div>
                <span className={`text-sm font-black ${textColor}`}>{width}%</span>
            </div>
            <div className="flex items-end justify-between gap-3">
                <p className="text-2xl font-black text-gray-900">{numberFormat.format(value)}</p>
                <p className="text-xs text-gray-400">จาก {numberFormat.format(total)} คน</p>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100">
                <div className={`h-full rounded-full ${color}`} style={{ width: `${width}%` }} />
            </div>
        </div>
    );
}

interface AttendanceTypePanelProps {
    title: string;
    totals: AttendanceTypeTotals;
    students: number;
    showLate?: boolean;
}

function AttendanceTypePanel({ title, totals, students, showLate = false }: AttendanceTypePanelProps) {
    const checkedPercentage = percent(totals.checked, students);
    const statistics = [
        { label: 'มา (รวมสาย)', value: totals.present, color: 'text-primary', background: 'bg-primary/10' },
        ...(showLate
            ? [{ label: 'มาสาย', value: totals.late, color: 'text-[#8a6b00]', background: 'bg-secondary/25' }]
            : []),
        { label: 'ลา', value: totals.leave, color: 'text-blue-700', background: 'bg-blue-50' },
        { label: 'กิจกรรม', value: totals.activity, color: 'text-cyan-700', background: 'bg-cyan-50' },
        { label: 'ขาด', value: totals.absent, color: 'text-rose-700', background: 'bg-rose-50' },
        { label: 'ยังไม่เช็ค', value: totals.notChecked, color: 'text-gray-600', background: 'bg-gray-100' }
    ];

    return (
        <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4">
            <div className="flex items-center justify-between gap-3">
                <h3 className="font-black text-gray-800">{title}</h3>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-primary shadow-sm">
                    เช็คแล้ว {numberFormat.format(totals.checked)}/{numberFormat.format(students)} คน · {checkedPercentage}%
                </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-200">
                <div className="h-full rounded-full bg-primary" style={{ width: `${checkedPercentage}%` }} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
                {statistics.map(statistic => (
                    <div key={statistic.label} className={`rounded-xl px-3 py-2 ${statistic.background}`}>
                        <p className={`text-lg font-black ${statistic.color}`}>
                            {numberFormat.format(statistic.value)}
                        </p>
                        <p className="text-[11px] font-medium text-gray-500">{statistic.label}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}

function MiniStat({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
    return (
        <div className={`rounded-2xl p-3 text-center ${danger ? 'bg-rose-50' : 'bg-primary/10'}`}>
            <p className={`text-xl font-black ${danger ? 'text-rose-700' : 'text-primary'}`}>
                {numberFormat.format(value)}
            </p>
            <p className="mt-1 text-[11px] font-medium text-gray-500">{label}</p>
        </div>
    );
}

function QuickLink({ to, icon: Icon, label }: { to: string; icon: React.ElementType; label: string }) {
    return (
        <Link
            to={to}
            className="flex items-center justify-between rounded-2xl border border-primary/10 p-4 text-sm font-bold text-gray-700 transition hover:border-primary/25 hover:bg-primary/5 hover:text-primary"
        >
            <span className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary/30 text-primary">
                    <Icon size={18} />
                </span>
                {label}
            </span>
            <ChevronRight size={16} />
        </Link>
    );
}
