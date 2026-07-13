import { useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    CheckCircle2,
    Loader2,
    PauseCircle,
    RefreshCw,
    RotateCcw,
    Search,
    UserRoundX,
    Users,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Swal from 'sweetalert2';
import api from '../services/api';

type ChangeMode = 'EXIT' | 'RETURN';
type ChangeAction = 'TRANSFER_OUT' | 'STUDY_LEAVE' | 'RETURN_TO_STUDY';

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

interface CandidateStudent {
    studentId: string;
    citizenId: string;
    firstName: string;
    lastName: string;
    sourceClassroomId: number;
    sourceClassroomName: string;
    endedAt?: string;
}

interface CandidatesResult {
    activeStudents: CandidateStudent[];
    studyLeaveStudents: CandidateStudent[];
}

interface PendingChange {
    studentId: string;
    action: ChangeAction;
    targetClassroomId?: number;
}

interface PreviewIssue {
    code: string;
    message: string;
    entityId?: string | number;
}

interface PreviewResult {
    summary: Record<string, number>;
    changes: PendingChange[];
    issues: PreviewIssue[];
}

const createIdempotencyKey = () =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `enrollment-change-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const getErrorMessage = (error: unknown) => {
    if (typeof error === 'object' && error !== null && 'response' in error) {
        const response = (error as { response?: { data?: { message?: string | string[] } } }).response;
        const message = response?.data?.message;
        return Array.isArray(message) ? message.join(', ') : message;
    }
    return undefined;
};

export default function StudentEnrollmentChanges() {
    const [mode, setMode] = useState<ChangeMode>('EXIT');
    const [terms, setTerms] = useState<Term[]>([]);
    const [classrooms, setClassrooms] = useState<Classroom[]>([]);
    const [termId, setTermId] = useState<number | ''>('');
    const [candidates, setCandidates] = useState<CandidatesResult>({
        activeStudents: [],
        studyLeaveStudents: [],
    });
    const [selectedRoomIds, setSelectedRoomIds] = useState<number[]>([]);
    const [changes, setChanges] = useState<PendingChange[]>([]);
    const [preview, setPreview] = useState<PreviewResult | null>(null);
    const [previewStale, setPreviewStale] = useState(false);
    const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [previewing, setPreviewing] = useState(false);
    const [applying, setApplying] = useState(false);

    const termRooms = useMemo(
        () =>
            classrooms
                .filter((room) => room.termId === Number(termId))
                .sort((a, b) => a.name.localeCompare(b.name, 'th')),
        [classrooms, termId],
    );

    const sourceStudents = mode === 'EXIT' ? candidates.activeStudents : candidates.studyLeaveStudents;
    const availableRoomIds = useMemo(
        () => [...new Set(sourceStudents.map((student) => student.sourceClassroomId))],
        [sourceStudents],
    );
    const visibleStudents = useMemo(() => {
        const keyword = search.trim().toLowerCase();
        return sourceStudents.filter(
            (student) =>
                selectedRoomIds.includes(student.sourceClassroomId) &&
                (!keyword ||
                    `${student.citizenId} ${student.firstName} ${student.lastName}`.toLowerCase().includes(keyword)),
        );
    }, [search, selectedRoomIds, sourceStudents]);

    const resetSelection = () => {
        setSelectedRoomIds([]);
        setChanges([]);
        setPreview(null);
        setPreviewStale(false);
        setIdempotencyKey(null);
    };

    const loadCandidates = async (selectedTermId: number) => {
        const response = await api.get<CandidatesResult>(
            `/promotions/enrollment-changes/candidates?termId=${selectedTermId}`,
        );
        setCandidates(response.data);
    };

    useEffect(() => {
        const load = async () => {
            try {
                const [termsResponse, roomsResponse] = await Promise.all([
                    api.get<Term[]>('/terms'),
                    api.get<Classroom[]>('/classrooms'),
                ]);
                setTerms(termsResponse.data);
                setClassrooms(roomsResponse.data);
                const active = termsResponse.data.find((term) => term.isActive);
                if (active) {
                    setTermId(active.id);
                    await loadCandidates(active.id);
                }
            } catch (error) {
                toast.error(getErrorMessage(error) || 'โหลดข้อมูลนักเรียนไม่สำเร็จ');
            } finally {
                setLoading(false);
            }
        };
        void load();
    }, []);

    const markChanged = () => {
        if (preview) setPreviewStale(true);
        setIdempotencyKey(null);
    };

    const updateStudent = (student: CandidateStudent, enabled: boolean) => {
        setChanges((current) => {
            const rest = current.filter((item) => item.studentId !== student.studentId);
            if (!enabled) return rest;
            return [
                ...rest,
                mode === 'EXIT'
                    ? { studentId: student.studentId, action: 'STUDY_LEAVE' }
                    : {
                          studentId: student.studentId,
                          action: 'RETURN_TO_STUDY',
                          targetClassroomId:
                              termRooms.find((room) => room.id === student.sourceClassroomId)?.id ?? termRooms[0]?.id,
                      },
            ];
        });
        markChanged();
    };

    const patchChange = (studentId: string, patch: Partial<PendingChange>) => {
        setChanges((current) => current.map((item) => (item.studentId === studentId ? { ...item, ...patch } : item)));
        markChanged();
    };

    const handlePreview = async () => {
        if (!termId || selectedRoomIds.length === 0 || changes.length === 0) {
            toast.error('กรุณาเลือกห้องและนักเรียนที่จะดำเนินการ');
            return;
        }
        setPreviewing(true);
        try {
            const response = await api.post<PreviewResult>('/promotions/enrollment-changes/preview', {
                termId: Number(termId),
                changes,
            });
            setPreview(response.data);
            setPreviewStale(false);
            setIdempotencyKey(createIdempotencyKey());
            toast.success(
                response.data.issues.length > 0 ? 'ตรวจสอบแล้ว พบรายการที่ต้องแก้ไข' : 'Preview พร้อมตรวจสอบ',
            );
        } catch (error) {
            toast.error(getErrorMessage(error) || 'คำนวณ Preview ไม่สำเร็จ');
        } finally {
            setPreviewing(false);
        }
    };

    const handleApply = async () => {
        if (!preview || previewStale || preview.issues.length > 0 || !idempotencyKey) return;
        const transferCount = changes.filter((change) => change.action === 'TRANSFER_OUT').length;
        const leaveCount = changes.filter((change) => change.action === 'STUDY_LEAVE').length;
        const returnCount = changes.filter((change) => change.action === 'RETURN_TO_STUDY').length;
        const confirmation = await Swal.fire({
            title: mode === 'EXIT' ? 'ยืนยันย้ายออก/พักการเรียน?' : 'ยืนยันรับกลับเข้าศึกษา?',
            html: `<div style="text-align:left;line-height:1.8">
                <p><b>ย้ายออก:</b> ${transferCount} คน</p>
                <p><b>พักการเรียน:</b> ${leaveCount} คน</p>
                <p><b>รับกลับ:</b> ${returnCount} คน</p>
                <p style="color:#b91c1c;margin-top:8px">ระบบจะเปลี่ยนสถานะการลงทะเบียนจริง</p>
            </div>`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#166534',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'ยืนยันและดำเนินการ',
            cancelButtonText: 'กลับไปตรวจสอบ',
        });
        if (!confirmation.isConfirmed) return;

        setApplying(true);
        const toastId = toast.loading('กำลังเปลี่ยนสถานะการลงทะเบียน...');
        try {
            await api.post('/promotions/enrollment-changes/apply', {
                termId: Number(termId),
                changes,
                idempotencyKey,
            });
            toast.success('ดำเนินการสำเร็จ', { id: toastId });
            await loadCandidates(Number(termId));
            resetSelection();
        } catch (error) {
            toast.error(getErrorMessage(error) || 'ดำเนินการไม่สำเร็จ', {
                id: toastId,
            });
        } finally {
            setApplying(false);
        }
    };

    if (loading) {
        return (
            <div className="flex min-h-[420px] items-center justify-center text-primary">
                <Loader2 className="animate-spin" size={34} />
            </div>
        );
    }

    const allRoomsSelected =
        availableRoomIds.length > 0 && availableRoomIds.every((id) => selectedRoomIds.includes(id));
    const allVisibleSelected =
        visibleStudents.length > 0 &&
        visibleStudents.every((student) => changes.some((change) => change.studentId === student.studentId));

    return (
        <div className="mx-auto max-w-7xl space-y-6">
            <div className="rounded-3xl bg-gradient-to-r from-[#063d1f] to-[#1B813E] p-7 text-white shadow-xl">
                <div className="flex items-start gap-4">
                    <div className="rounded-2xl bg-white/15 p-3">
                        <UserRoundX size={30} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black">นักเรียนย้าย/พักการเรียน</h1>
                        <p className="mt-1 text-sm text-green-50/80">
                            ย้ายออก พักการเรียน และรับกลับเข้าศึกษาโดยเก็บประวัติเดิมไว้ครบ
                        </p>
                    </div>
                </div>
            </div>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <StepTitle number="1" title="เลือกรูปแบบและภาคเรียน" />
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                    <ModeButton
                        active={mode === 'EXIT'}
                        icon={PauseCircle}
                        title="ย้ายออก / พักการเรียน"
                        description="ปิดการลงทะเบียนปัจจุบันและนำออกจากห้อง"
                        onClick={() => {
                            setMode('EXIT');
                            resetSelection();
                        }}
                    />
                    <ModeButton
                        active={mode === 'RETURN'}
                        icon={RotateCcw}
                        title="รับกลับเข้าศึกษา"
                        description="สร้างการลงทะเบียนใหม่ให้นักเรียนที่พักการเรียน"
                        onClick={() => {
                            setMode('RETURN');
                            resetSelection();
                        }}
                    />
                </div>
                <label className="mt-5 block">
                    <span className="mb-2 block text-sm font-bold text-slate-700">ภาคเรียนที่จะดำเนินการ</span>
                    <select
                        value={termId}
                        onChange={async (event) => {
                            const value = event.target.value ? Number(event.target.value) : '';
                            setTermId(value);
                            resetSelection();
                            if (value) await loadCandidates(value);
                        }}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3"
                    >
                        <option value="">เลือกภาคเรียน</option>
                        {terms
                            .slice()
                            .sort((a, b) => b.year - a.year || b.term - a.term)
                            .map((term) => (
                                <option key={term.id} value={term.id}>
                                    {term.term}/{term.year}
                                    {term.isActive ? ' (กำลังใช้งาน)' : ''}
                                </option>
                            ))}
                    </select>
                </label>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <StepTitle
                    number="2"
                    title={mode === 'EXIT' ? 'เลือกห้องและนักเรียน' : 'เลือกห้องเดิมและนักเรียนที่จะรับกลับ'}
                />
                <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200">
                    <table className="w-full min-w-[520px] text-sm">
                        <thead className="bg-slate-50 text-left text-slate-500">
                            <tr>
                                <th className="w-12 px-4 py-3">
                                    <input
                                        type="checkbox"
                                        checked={allRoomsSelected}
                                        aria-label="เลือกห้องทั้งหมด"
                                        className="h-4 w-4 accent-primary"
                                        onChange={(event) => {
                                            setSelectedRoomIds(event.target.checked ? availableRoomIds : []);
                                            if (!event.target.checked) setChanges([]);
                                            markChanged();
                                        }}
                                    />
                                </th>
                                <th className="px-4 py-3">ห้อง</th>
                                <th className="px-4 py-3">นักเรียนที่พร้อมดำเนินการ</th>
                            </tr>
                        </thead>
                        <tbody>
                            {availableRoomIds.map((roomId) => {
                                const name =
                                    sourceStudents.find((student) => student.sourceClassroomId === roomId)
                                        ?.sourceClassroomName ?? '-';
                                const count = sourceStudents.filter(
                                    (student) => student.sourceClassroomId === roomId,
                                ).length;
                                return (
                                    <tr key={roomId} className="border-t">
                                        <td className="px-4 py-3">
                                            <input
                                                type="checkbox"
                                                checked={selectedRoomIds.includes(roomId)}
                                                aria-label={`เลือกห้อง ${name}`}
                                                className="h-4 w-4 accent-primary"
                                                onChange={(event) => {
                                                    const checked = event.target.checked;
                                                    setSelectedRoomIds((current) =>
                                                        event.target.checked
                                                            ? [...current, roomId]
                                                            : current.filter((id) => id !== roomId),
                                                    );
                                                    if (!checked) {
                                                        const studentIds = new Set(
                                                            sourceStudents
                                                                .filter(
                                                                    (student) => student.sourceClassroomId === roomId,
                                                                )
                                                                .map((student) => student.studentId),
                                                        );
                                                        setChanges((current) =>
                                                            current.filter(
                                                                (change) => !studentIds.has(change.studentId),
                                                            ),
                                                        );
                                                    }
                                                    markChanged();
                                                }}
                                            />
                                        </td>
                                        <td className="px-4 py-3 font-bold">{name}</td>
                                        <td className="px-4 py-3">{count} คน</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <div className="relative mt-5">
                    <Search className="absolute left-3 top-3 text-slate-400" size={18} />
                    <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="ค้นหาชื่อหรือเลขประจำตัว"
                        className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-4"
                    />
                </div>
                <div className="mt-4 max-h-[520px] overflow-auto rounded-2xl border border-slate-200">
                    <table className="w-full min-w-[850px] text-sm">
                        <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
                            <tr>
                                <th className="w-12 px-4 py-3">
                                    <input
                                        type="checkbox"
                                        checked={allVisibleSelected}
                                        aria-label="เลือกนักเรียนทั้งหมด"
                                        className="h-4 w-4 accent-primary"
                                        onChange={(event) =>
                                            visibleStudents.forEach((student) =>
                                                updateStudent(student, event.target.checked),
                                            )
                                        }
                                    />
                                </th>
                                <th className="px-4 py-3">นักเรียน</th>
                                <th className="px-4 py-3">ห้องเดิม</th>
                                <th className="px-4 py-3">การดำเนินการ</th>
                                <th className="px-4 py-3">ห้องรับกลับ</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibleStudents.map((student) => {
                                const change = changes.find((item) => item.studentId === student.studentId);
                                return (
                                    <tr key={student.studentId} className="border-t">
                                        <td className="px-4 py-3">
                                            <input
                                                type="checkbox"
                                                checked={Boolean(change)}
                                                aria-label={`เลือก ${student.firstName} ${student.lastName}`}
                                                className="h-4 w-4 accent-primary"
                                                onChange={(event) => updateStudent(student, event.target.checked)}
                                            />
                                        </td>
                                        <td className="px-4 py-3">
                                            <p className="font-bold">
                                                {student.firstName} {student.lastName}
                                            </p>
                                            <p className="text-xs text-slate-400">{student.citizenId}</p>
                                        </td>
                                        <td className="px-4 py-3">{student.sourceClassroomName}</td>
                                        <td className="px-4 py-3">
                                            {mode === 'EXIT' ? (
                                                <select
                                                    disabled={!change}
                                                    value={change?.action ?? 'STUDY_LEAVE'}
                                                    onChange={(event) =>
                                                        patchChange(student.studentId, {
                                                            action: event.target.value as ChangeAction,
                                                        })
                                                    }
                                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 disabled:bg-slate-100"
                                                >
                                                    <option value="STUDY_LEAVE">พักการเรียน</option>
                                                    <option value="TRANSFER_OUT">ย้ายออก</option>
                                                </select>
                                            ) : (
                                                'รับกลับเข้าศึกษา'
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            {mode === 'RETURN' ? (
                                                <select
                                                    disabled={!change}
                                                    value={change?.targetClassroomId ?? ''}
                                                    onChange={(event) =>
                                                        patchChange(student.studentId, {
                                                            targetClassroomId: Number(event.target.value),
                                                        })
                                                    }
                                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 disabled:bg-slate-100"
                                                >
                                                    <option value="">เลือกห้อง</option>
                                                    {termRooms.map((room) => (
                                                        <option key={room.id} value={room.id}>
                                                            {room.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            ) : (
                                                '-'
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {visibleStudents.length === 0 && (
                        <p className="p-6 text-center text-sm text-slate-500">ไม่พบรายการในห้องที่เลือก</p>
                    )}
                </div>
                <div className="mt-5 flex justify-end">
                    <button
                        type="button"
                        onClick={handlePreview}
                        disabled={previewing || changes.length === 0}
                        className="flex items-center gap-2 rounded-xl bg-primary px-5 py-3 font-bold text-white disabled:opacity-40"
                    >
                        {previewing ? <Loader2 className="animate-spin" size={18} /> : <RefreshCw size={18} />} ตรวจสอบ
                        Preview
                    </button>
                </div>
            </section>

            {preview && (
                <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                    <StepTitle number="3" title="ตรวจสอบและยืนยัน" />
                    <div className="mt-5 grid gap-3 sm:grid-cols-3">
                        <SummaryCard icon={Users} label="ดำเนินการทั้งหมด" value={preview.summary.total ?? 0} />
                        <SummaryCard icon={PauseCircle} label="พักการเรียน" value={preview.summary.studyLeave ?? 0} />
                        <SummaryCard icon={RotateCcw} label="รับกลับ" value={preview.summary.returnToStudy ?? 0} />
                    </div>
                    {previewStale && <Notice text="ข้อมูลถูกแก้ไข กรุณาตรวจสอบ Preview ใหม่" />}
                    {preview.issues.length > 0 && (
                        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
                            <p className="flex items-center gap-2 font-black">
                                <AlertTriangle size={19} />
                                ยังดำเนินการไม่ได้
                            </p>
                            <ul className="mt-3 space-y-1 text-sm">
                                {preview.issues.map((issue, index) => (
                                    <li key={`${issue.code}-${issue.entityId ?? index}`}>• {issue.message}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                    <div className="mt-5 flex justify-end">
                        <button
                            type="button"
                            onClick={handleApply}
                            disabled={applying || previewStale || preview.issues.length > 0 || !idempotencyKey}
                            className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 font-black text-white disabled:opacity-40"
                        >
                            {applying ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}{' '}
                            ยืนยันดำเนินการ
                        </button>
                    </div>
                </section>
            )}
        </div>
    );
}

function StepTitle({ number, title }: { number: string; title: string }) {
    return (
        <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary font-black text-white">
                {number}
            </span>
            <h2 className="text-lg font-black text-slate-900">{title}</h2>
        </div>
    );
}

function ModeButton({
    active,
    icon: Icon,
    title,
    description,
    onClick,
}: {
    active: boolean;
    icon: typeof PauseCircle;
    title: string;
    description: string;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`rounded-2xl border p-4 text-left ${active ? 'border-primary bg-green-50 ring-2 ring-primary/10' : 'border-slate-200'}`}
        >
            <Icon className="text-primary" size={21} />
            <p className="mt-3 font-black">{title}</p>
            <p className="mt-1 text-sm text-slate-500">{description}</p>
        </button>
    );
}

function SummaryCard({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) {
    return (
        <div className="rounded-2xl border border-slate-200 p-4">
            <Icon className="text-primary" size={20} />
            <p className="mt-3 text-2xl font-black">{value.toLocaleString()}</p>
            <p className="text-xs font-bold text-slate-500">{label}</p>
        </div>
    );
}

function Notice({ text }: { text: string }) {
    return (
        <div className="mt-5 flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-bold text-blue-800">
            <RefreshCw size={18} />
            {text}
        </div>
    );
}
