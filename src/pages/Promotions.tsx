import { useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    ArrowRight,
    CheckCircle2,
    GraduationCap,
    Loader2,
    RefreshCw,
    Search,
    ShieldCheck,
    Users,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Swal from 'sweetalert2';
import api from '../services/api';

type PromotionMode = 'TERM_ROLLOVER' | 'ANNUAL_PROMOTION';
type PromotionAction = 'MOVE' | 'REPEAT' | 'GRADUATE' | 'TRANSFER_OUT' | 'SKIP';

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

interface ClassroomMapping {
    sourceClassroomId: number;
    targetName: string;
    defaultAction: PromotionAction;
}

interface StudentOverride {
    studentId: string;
    action: PromotionAction;
    targetSourceClassroomId?: number;
}

interface PreviewStudent {
    studentId: string;
    citizenId: string;
    firstName: string;
    lastName: string;
    sourceClassroomId: number;
    targetSourceClassroomId: number | null;
    action: PromotionAction;
}

interface PreviewIssue {
    code: string;
    message: string;
    entityId?: string | number;
}

interface PreviewResult {
    summary: Record<string, number>;
    classrooms: Array<{
        sourceClassroomId: number;
        sourceName: string;
        targetName: string | null;
        targetClassroomId: number | null;
        willCreate: boolean;
        studentCount: number;
    }>;
    students: PreviewStudent[];
    issues: PreviewIssue[];
}

const ACTION_LABELS: Record<PromotionAction, string> = {
    MOVE: 'ย้ายไปห้องปลายทาง',
    REPEAT: 'เรียนซ้ำชั้น',
    GRADUATE: 'จบการศึกษา',
    TRANSFER_OUT: 'ย้ายออก',
    SKIP: 'ข้ามไว้ก่อน',
};

const modeConfig = {
    TERM_ROLLOVER: {
        title: 'เปลี่ยนภาคเรียน',
        description: 'เช่น 1/2569 → 2/2569 นักเรียนอยู่ระดับชั้นเดิม และเก็บคะแนนเดิมทั้งหมด',
        previewPath: '/promotions/term-rollover/preview',
        applyPath: '/promotions/term-rollover/apply',
    },
    ANNUAL_PROMOTION: {
        title: 'เลื่อนชั้นประจำปี',
        description: 'เช่น 2/2569 → 1/2570 กำหนดห้องใหม่ พร้อมรองรับซ้ำชั้น ย้ายออก และจบการศึกษา',
        previewPath: '/promotions/annual/preview',
        applyPath: '/promotions/annual/apply',
    },
} satisfies Record<PromotionMode, {
    title: string;
    description: string;
    previewPath: string;
    applyPath: string;
}>;

const getErrorMessage = (error: unknown) => {
    if (
        typeof error === 'object'
        && error !== null
        && 'response' in error
    ) {
        const response = (error as { response?: { data?: { message?: string | string[] } } }).response;
        const message = response?.data?.message;
        return Array.isArray(message) ? message.join(', ') : message;
    }
    return undefined;
};

const createIdempotencyKey = () =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `promotion-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const createMappings = (
    rooms: Classroom[],
    sourceId: number | '',
    mode: PromotionMode,
): ClassroomMapping[] => rooms
    .filter(room => room.termId === Number(sourceId))
    .sort((a, b) => a.name.localeCompare(b.name, 'th'))
    .map(room => ({
        sourceClassroomId: room.id,
        targetName: mode === 'TERM_ROLLOVER' ? room.name : '',
        defaultAction: 'MOVE',
    }));

export default function Promotions() {
    const [mode, setMode] = useState<PromotionMode>('TERM_ROLLOVER');
    const [terms, setTerms] = useState<Term[]>([]);
    const [classrooms, setClassrooms] = useState<Classroom[]>([]);
    const [sourceTermId, setSourceTermId] = useState<number | ''>('');
    const [targetTermId, setTargetTermId] = useState<number | ''>('');
    const [mappings, setMappings] = useState<ClassroomMapping[]>([]);
    const [overrides, setOverrides] = useState<StudentOverride[]>([]);
    const [preview, setPreview] = useState<PreviewResult | null>(null);
    const [previewStale, setPreviewStale] = useState(false);
    const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [previewing, setPreviewing] = useState(false);
    const [applying, setApplying] = useState(false);

    const sourceRooms = useMemo(
        () => classrooms
            .filter(room => room.termId === Number(sourceTermId))
            .sort((a, b) => a.name.localeCompare(b.name, 'th')),
        [classrooms, sourceTermId],
    );

    const filteredStudents = useMemo(() => {
        const keyword = search.trim().toLowerCase();
        if (!preview || !keyword) return preview?.students ?? [];
        return preview.students.filter(student =>
            `${student.citizenId} ${student.firstName} ${student.lastName}`
                .toLowerCase()
                .includes(keyword),
        );
    }, [preview, search]);

    useEffect(() => {
        const loadInitialData = async () => {
            setLoading(true);
            try {
                const [termsResponse, classroomsResponse] = await Promise.all([
                    api.get<Term[]>('/terms'),
                    api.get<Classroom[]>('/classrooms'),
                ]);
                setTerms(termsResponse.data);
                setClassrooms(classroomsResponse.data);
                const active = termsResponse.data.find(term => term.isActive);
                if (active) {
                    setSourceTermId(active.id);
                    setMappings(createMappings(
                        classroomsResponse.data,
                        active.id,
                        'TERM_ROLLOVER',
                    ));
                }
            } catch {
                toast.error('โหลดข้อมูลภาคเรียนและห้องเรียนไม่สำเร็จ');
            } finally {
                setLoading(false);
            }
        };
        void loadInitialData();
    }, []);

    const resetPlan = (
        nextMode: PromotionMode,
        nextSourceTermId: number | '',
    ) => {
        setMappings(createMappings(classrooms, nextSourceTermId, nextMode));
        setOverrides([]);
        setPreview(null);
        setPreviewStale(false);
        setIdempotencyKey(null);
    };

    const handleModeChange = (nextMode: PromotionMode) => {
        setMode(nextMode);
        resetPlan(nextMode, sourceTermId);
    };

    const markChanged = () => {
        if (preview) setPreviewStale(true);
        setIdempotencyKey(null);
    };

    const updateMapping = (
        sourceClassroomId: number,
        changes: Partial<ClassroomMapping>,
    ) => {
        setMappings(current => current.map(mapping =>
            mapping.sourceClassroomId === sourceClassroomId
                ? { ...mapping, ...changes }
                : mapping,
        ));
        markChanged();
    };

    const buildPayload = () => ({
        sourceTermId: Number(sourceTermId),
        targetTermId: Number(targetTermId),
        classroomMappings: mappings.map(mapping => (
            mode === 'TERM_ROLLOVER'
                ? {
                    sourceClassroomId: mapping.sourceClassroomId,
                    targetName: mapping.targetName.trim() || undefined,
                }
                : {
                    sourceClassroomId: mapping.sourceClassroomId,
                    targetName: mapping.targetName.trim() || undefined,
                    defaultAction: mapping.defaultAction,
                }
        )),
        studentOverrides: overrides.map(override => ({
            ...override,
            targetSourceClassroomId:
                override.action === 'MOVE' || override.action === 'REPEAT'
                    ? override.targetSourceClassroomId
                    : undefined,
        })),
    });

    const handlePreview = async () => {
        if (!sourceTermId || !targetTermId) {
            toast.error('กรุณาเลือกภาคเรียนต้นทางและปลายทาง');
            return;
        }
        if (sourceTermId === targetTermId) {
            toast.error('ภาคเรียนต้นทางและปลายทางต้องไม่ซ้ำกัน');
            return;
        }
        if (mappings.length === 0) {
            toast.error('ไม่พบห้องเรียนในภาคเรียนต้นทาง');
            return;
        }

        setPreviewing(true);
        try {
            const response = await api.post<PreviewResult>(
                modeConfig[mode].previewPath,
                buildPayload(),
            );
            setPreview(response.data);
            setPreviewStale(false);
            setIdempotencyKey(createIdempotencyKey());
            toast.success(
                response.data.issues.length > 0
                    ? 'คำนวณ Preview แล้ว กรุณาแก้รายการที่ต้องตรวจสอบ'
                    : 'Preview พร้อมตรวจสอบ',
            );
        } catch (error: unknown) {
            toast.error(getErrorMessage(error) || 'คำนวณ Preview ไม่สำเร็จ');
        } finally {
            setPreviewing(false);
        }
    };

    const getStudentOverride = (student: PreviewStudent) =>
        overrides.find(item => item.studentId === student.studentId);

    const updateStudent = (
        student: PreviewStudent,
        changes: Partial<StudentOverride>,
    ) => {
        setOverrides(current => {
            const existing = current.find(item => item.studentId === student.studentId);
            const next: StudentOverride = {
                studentId: student.studentId,
                action: existing?.action ?? student.action,
                targetSourceClassroomId:
                    existing?.targetSourceClassroomId
                    ?? student.targetSourceClassroomId
                    ?? student.sourceClassroomId,
                ...changes,
            };
            return existing
                ? current.map(item => item.studentId === student.studentId ? next : item)
                : [...current, next];
        });
        markChanged();
    };

    const handleApply = async () => {
        if (!preview || previewStale || preview.issues.length > 0 || !idempotencyKey) return;

        const sourceTerm = terms.find(term => term.id === sourceTermId);
        const targetTerm = terms.find(term => term.id === targetTermId);
        const confirmation = await Swal.fire({
            title: `ยืนยัน${modeConfig[mode].title}?`,
            html: `
                <div style="text-align:left;line-height:1.8">
                    <p><b>จาก:</b> ${sourceTerm?.term}/${sourceTerm?.year}</p>
                    <p><b>ไป:</b> ${targetTerm?.term}/${targetTerm?.year}</p>
                    <p><b>นักเรียน:</b> ${preview.summary.students ?? 0} คน</p>
                    <p style="color:#b91c1c;margin-top:8px">ระบบจะบันทึกผลและเปิดใช้ภาคเรียนปลายทาง</p>
                </div>
            `,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#166534',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'ยืนยันและดำเนินการ',
            cancelButtonText: 'กลับไปตรวจสอบ',
        });
        if (!confirmation.isConfirmed) return;

        setApplying(true);
        const toastId = toast.loading(`กำลัง${modeConfig[mode].title}...`);
        try {
            await api.post(modeConfig[mode].applyPath, {
                ...buildPayload(),
                idempotencyKey,
                activateTargetTerm: true,
            });
            toast.success(`${modeConfig[mode].title}สำเร็จ`, { id: toastId });
            const [termsResponse, classroomsResponse] = await Promise.all([
                api.get<Term[]>('/terms'),
                api.get<Classroom[]>('/classrooms'),
            ]);
            setTerms(termsResponse.data);
            setClassrooms(classroomsResponse.data);
            const nextSourceTermId = Number(targetTermId);
            setSourceTermId(nextSourceTermId);
            setTargetTermId('');
            setMappings(createMappings(classroomsResponse.data, nextSourceTermId, mode));
            setPreview(null);
            setOverrides([]);
            setIdempotencyKey(null);
        } catch (error: unknown) {
            toast.error(getErrorMessage(error) || `${modeConfig[mode].title}ไม่สำเร็จ`, {
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

    return (
        <div className="mx-auto max-w-7xl space-y-6">
            <div className="rounded-3xl bg-gradient-to-r from-[#063d1f] to-[#1B813E] p-7 text-white shadow-xl">
                <div className="flex items-start gap-4">
                    <div className="rounded-2xl bg-white/15 p-3">
                        <GraduationCap size={30} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black">เลื่อนชั้นและเปลี่ยนภาคเรียน</h1>
                        <p className="mt-1 text-sm text-green-50/80">
                            เปลี่ยนห้องและภาคเรียนโดยเก็บประวัติการเช็คชื่อกับคะแนนพฤติกรรมเดิมไว้ครบ
                        </p>
                    </div>
                </div>
            </div>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <StepTitle number="1" title="เลือกรูปแบบและภาคเรียน" />
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                    {(Object.keys(modeConfig) as PromotionMode[]).map(item => (
                        <button
                            key={item}
                            type="button"
                            onClick={() => handleModeChange(item)}
                            className={`rounded-2xl border p-4 text-left transition ${
                                mode === item
                                    ? 'border-primary bg-green-50 ring-2 ring-primary/10'
                                    : 'border-slate-200 hover:border-green-300'
                            }`}
                        >
                            <p className="font-black text-slate-900">{modeConfig[item].title}</p>
                            <p className="mt-1 text-sm leading-6 text-slate-500">
                                {modeConfig[item].description}
                            </p>
                        </button>
                    ))}
                </div>

                <div className="mt-5 grid items-end gap-4 md:grid-cols-[1fr_auto_1fr]">
                    <TermSelect
                        label="ภาคเรียนต้นทาง"
                        value={sourceTermId}
                        terms={terms}
                        onChange={value => {
                            setSourceTermId(value);
                            setTargetTermId('');
                            resetPlan(mode, value);
                        }}
                    />
                    <ArrowRight className="mb-3 hidden text-slate-400 md:block" />
                    <TermSelect
                        label="ภาคเรียนปลายทาง"
                        value={targetTermId}
                        terms={terms.filter(term => term.id !== sourceTermId)}
                        onChange={value => {
                            setTargetTermId(value);
                            markChanged();
                        }}
                    />
                </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <StepTitle
                    number="2"
                    title={mode === 'TERM_ROLLOVER' ? 'ตรวจชื่อห้องปลายทาง' : 'กำหนดผลลัพธ์ของแต่ละห้อง'}
                />
                {sourceRooms.length === 0 ? (
                    <p className="mt-5 rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">
                        เลือกภาคเรียนต้นทางที่มีห้องเรียนก่อน
                    </p>
                ) : (
                    <div className="mt-5 overflow-x-auto">
                        <table className="w-full min-w-[720px] text-sm">
                            <thead>
                                <tr className="border-b text-left text-slate-500">
                                    <th className="px-3 py-3">ห้องต้นทาง</th>
                                    {mode === 'ANNUAL_PROMOTION' && <th className="px-3 py-3">ผลลัพธ์หลัก</th>}
                                    <th className="px-3 py-3">ชื่อห้องปลายทาง</th>
                                </tr>
                            </thead>
                            <tbody>
                                {mappings.map(mapping => {
                                    const room = sourceRooms.find(item => item.id === mapping.sourceClassroomId);
                                    return (
                                        <tr key={mapping.sourceClassroomId} className="border-b last:border-0">
                                            <td className="px-3 py-3 font-bold text-slate-800">{room?.name}</td>
                                            {mode === 'ANNUAL_PROMOTION' && (
                                                <td className="px-3 py-3">
                                                    <select
                                                        value={mapping.defaultAction}
                                                        onChange={event => updateMapping(
                                                            mapping.sourceClassroomId,
                                                            { defaultAction: event.target.value as PromotionAction },
                                                        )}
                                                        className="w-full rounded-xl border border-slate-200 px-3 py-2"
                                                    >
                                                        {(['MOVE', 'GRADUATE', 'TRANSFER_OUT', 'SKIP'] as PromotionAction[])
                                                            .map(action => (
                                                                <option key={action} value={action}>{ACTION_LABELS[action]}</option>
                                                            ))}
                                                    </select>
                                                </td>
                                            )}
                                            <td className="px-3 py-3">
                                                <input
                                                    value={mapping.targetName}
                                                    onChange={event => updateMapping(
                                                        mapping.sourceClassroomId,
                                                        { targetName: event.target.value },
                                                    )}
                                                    placeholder={
                                                        mapping.defaultAction === 'MOVE'
                                                            ? 'เช่น ม.2/1'
                                                            : 'เว้นว่างได้ หรือระบุเมื่อมีข้อยกเว้นย้ายเข้าห้องนี้'
                                                    }
                                                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                                                />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
                <div className="mt-5 flex justify-end">
                    <button
                        type="button"
                        onClick={handlePreview}
                        disabled={previewing || sourceRooms.length === 0}
                        className="flex items-center gap-2 rounded-xl bg-primary px-5 py-3 font-bold text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {previewing ? <Loader2 className="animate-spin" size={18} /> : <RefreshCw size={18} />}
                        {preview ? 'คำนวณ Preview ใหม่' : 'คำนวณ Preview'}
                    </button>
                </div>
            </section>

            {preview && (
                <>
                    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                        <StepTitle number="3" title="ตรวจผลลัพธ์และตั้งข้อยกเว้นรายคน" />
                        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <SummaryCard icon={Users} label="นักเรียนทั้งหมด" value={preview.summary.students ?? 0} />
                            <SummaryCard icon={ArrowRight} label="ย้ายห้อง" value={preview.summary.studentsToMove ?? 0} />
                            <SummaryCard icon={GraduationCap} label="จบการศึกษา" value={preview.summary.studentsToGraduate ?? 0} />
                            <SummaryCard
                                icon={AlertTriangle}
                                label="รายการที่ต้องแก้"
                                value={preview.issues.length}
                                danger={preview.issues.length > 0}
                            />
                        </div>

                        {preview.issues.length > 0 && (
                            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                                <p className="flex items-center gap-2 font-black text-amber-900">
                                    <AlertTriangle size={19} />
                                    ยังดำเนินการจริงไม่ได้
                                </p>
                                <ul className="mt-3 space-y-2 text-sm text-amber-800">
                                    {preview.issues.map((issue, index) => (
                                        <li key={`${issue.code}-${issue.entityId ?? index}`}>
                                            • {issue.message}
                                            {issue.entityId !== undefined && (
                                                <span className="ml-2 text-xs text-amber-600">({issue.entityId})</span>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {previewStale && (
                            <div className="mt-5 flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-bold text-blue-800">
                                <RefreshCw size={18} />
                                มีการแก้ไขข้อยกเว้น กรุณากด “คำนวณ Preview ใหม่” ก่อนดำเนินการจริง
                            </div>
                        )}

                        <div className="relative mt-5">
                            <Search className="absolute left-3 top-3 text-slate-400" size={18} />
                            <input
                                value={search}
                                onChange={event => setSearch(event.target.value)}
                                placeholder="ค้นหาชื่อหรือลขประจำตัวประชาชน"
                                className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-4"
                            />
                        </div>

                        <div className="mt-4 max-h-[520px] overflow-auto rounded-2xl border border-slate-200">
                            <table className="w-full min-w-[900px] text-sm">
                                <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
                                    <tr>
                                        <th className="px-4 py-3">นักเรียน</th>
                                        <th className="px-4 py-3">ห้องเดิม</th>
                                        <th className="px-4 py-3">ผลลัพธ์</th>
                                        <th className="px-4 py-3">ห้องปลายทาง</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredStudents.map(student => {
                                        const override = getStudentOverride(student);
                                        const action = override?.action ?? student.action;
                                        const targetRoomId =
                                            override?.targetSourceClassroomId
                                            ?? student.targetSourceClassroomId
                                            ?? student.sourceClassroomId;
                                        const needsTarget = action === 'MOVE' || action === 'REPEAT';
                                        return (
                                            <tr key={student.studentId} className="border-t">
                                                <td className="px-4 py-3">
                                                    <p className="font-bold text-slate-800">
                                                        {student.firstName} {student.lastName}
                                                    </p>
                                                    <p className="text-xs text-slate-400">{student.citizenId}</p>
                                                </td>
                                                <td className="px-4 py-3">
                                                    {sourceRooms.find(room => room.id === student.sourceClassroomId)?.name ?? '-'}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <select
                                                        value={action}
                                                        onChange={event => updateStudent(student, {
                                                            action: event.target.value as PromotionAction,
                                                        })}
                                                        className="w-full rounded-xl border border-slate-200 px-3 py-2"
                                                    >
                                                        {(mode === 'TERM_ROLLOVER'
                                                            ? ['MOVE', 'TRANSFER_OUT', 'SKIP']
                                                            : ['MOVE', 'REPEAT', 'GRADUATE', 'TRANSFER_OUT', 'SKIP']
                                                        ).map(item => (
                                                            <option key={item} value={item}>
                                                                {ACTION_LABELS[item as PromotionAction]}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <select
                                                        value={targetRoomId}
                                                        disabled={!needsTarget}
                                                        onChange={event => updateStudent(student, {
                                                            targetSourceClassroomId: Number(event.target.value),
                                                        })}
                                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 disabled:bg-slate-100"
                                                    >
                                                        {mappings
                                                            .filter(mapping => mapping.targetName.trim())
                                                            .map(mapping => (
                                                                <option
                                                                    key={mapping.sourceClassroomId}
                                                                    value={mapping.sourceClassroomId}
                                                                >
                                                                    {mapping.targetName}
                                                                </option>
                                                            ))}
                                                    </select>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                        <StepTitle number="4" title="ยืนยันดำเนินการจริง" />
                        <div className="mt-5 flex flex-col gap-4 rounded-2xl bg-slate-50 p-5 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-start gap-3">
                                <ShieldCheck className="mt-0.5 text-primary" size={24} />
                                <div>
                                    <p className="font-black text-slate-900">ข้อมูลเดิมจะไม่ถูกลบหรือรีเซ็ต</p>
                                    <p className="mt-1 text-sm text-slate-500">
                                        ระบบจะสร้างประวัติการลงทะเบียนใหม่ และคงคะแนนกับการเช็คชื่อเดิมทั้งหมด
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={handleApply}
                                disabled={
                                    applying
                                    || previewStale
                                    || preview.issues.length > 0
                                    || !idempotencyKey
                                }
                                className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 font-black text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                {applying
                                    ? <Loader2 className="animate-spin" size={18} />
                                    : <CheckCircle2 size={18} />}
                                ยืนยัน{modeConfig[mode].title}
                            </button>
                        </div>
                    </section>
                </>
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

function TermSelect({
    label,
    value,
    terms,
    onChange,
}: {
    label: string;
    value: number | '';
    terms: Term[];
    onChange: (value: number | '') => void;
}) {
    return (
        <label className="block">
            <span className="mb-2 block text-sm font-bold text-slate-700">{label}</span>
            <select
                value={value}
                onChange={event => onChange(event.target.value ? Number(event.target.value) : '')}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3"
            >
                <option value="">เลือกภาคเรียน</option>
                {terms
                    .slice()
                    .sort((a, b) => b.year - a.year || b.term - a.term)
                    .map(term => (
                        <option key={term.id} value={term.id}>
                            {term.term}/{term.year}{term.isActive ? ' (กำลังใช้งาน)' : ''}
                        </option>
                    ))}
            </select>
        </label>
    );
}

function SummaryCard({
    icon: Icon,
    label,
    value,
    danger = false,
}: {
    icon: typeof Users;
    label: string;
    value: number;
    danger?: boolean;
}) {
    return (
        <div className={`rounded-2xl border p-4 ${danger ? 'border-amber-200 bg-amber-50' : 'border-slate-200'}`}>
            <Icon className={danger ? 'text-amber-600' : 'text-primary'} size={20} />
            <p className="mt-3 text-2xl font-black text-slate-900">{value.toLocaleString()}</p>
            <p className="text-xs font-bold text-slate-500">{label}</p>
        </div>
    );
}
