import { useEffect, useMemo, useState } from 'react';
import {
    Calendar,
    CheckCircle,
    ClipboardPenLine,
    DoorOpen,
    LoaderCircle,
    Save,
    Search,
    UserRoundCheck
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';

type AttendanceType = 'ASSEMBLY' | 'AREA';
type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'LEAVE' | 'ACTIVITY';

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

interface Student {
    id: string;
    citizenId: string;
    firstName: string;
    lastName: string;
}

interface AttendanceRecord {
    id: string;
    type: AttendanceType;
    status: AttendanceStatus;
    date: string;
    student: {
        id: string;
        citizenId: string;
        firstName: string;
        lastName: string;
        classroom: { name: string };
    };
    recorder?: {
        firstName: string;
        lastName: string;
    };
}

const getTodayString = () => new Date().toISOString().split('T')[0];

const statusOptions: { value: AttendanceStatus; label: string; className: string }[] = [
    { value: 'PRESENT', label: 'มาเรียน', className: 'text-green-700' },
    { value: 'LATE', label: 'สาย', className: 'text-orange-600' },
    { value: 'LEAVE', label: 'ลา', className: 'text-blue-600' },
    { value: 'ACTIVITY', label: 'กิจกรรม', className: 'text-cyan-600' },
    { value: 'ABSENT', label: 'ขาด', className: 'text-red-600' }
];

const typeOptions: { value: AttendanceType; label: string }[] = [
    { value: 'ASSEMBLY', label: 'เข้าแถวหน้าเสาธง' },
    { value: 'AREA', label: 'เวรเขตพื้นที่' }
];

const parseAttendanceRecords = (data: any): AttendanceRecord[] => {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.records)) return data.records;

    return [
        ...(data?.records?.ASSEMBLY || []),
        ...(data?.records?.AREA || [])
    ];
};

const getErrorMessage = (error: any, fallback: string) => {
    const message = error?.response?.data?.message;
    if (Array.isArray(message)) return message[0] ?? fallback;
    return message || fallback;
};

export default function AttendanceEditor() {
    const [terms, setTerms] = useState<Term[]>([]);
    const [classrooms, setClassrooms] = useState<Classroom[]>([]);
    const [students, setStudents] = useState<Student[]>([]);
    const [records, setRecords] = useState<AttendanceRecord[]>([]);
    const [selectedTermId, setSelectedTermId] = useState('');
    const [selectedClassroomId, setSelectedClassroomId] = useState('');
    const [selectedDate, setSelectedDate] = useState(getTodayString());
    const [selectedType, setSelectedType] = useState<AttendanceType>('ASSEMBLY');
    const [draftStatuses, setDraftStatuses] = useState<Record<string, AttendanceStatus | ''>>({});
    const [searchQuery, setSearchQuery] = useState('');
    const [loadingInitial, setLoadingInitial] = useState(true);
    const [loadingData, setLoadingData] = useState(false);
    const [savingStudentId, setSavingStudentId] = useState<string | null>(null);

    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                setLoadingInitial(true);
                const [termsRes, classroomsRes] = await Promise.all([
                    api.get('/terms'),
                    api.get('/classrooms')
                ]);
                const termList = termsRes.data as Term[];
                const classroomList = classroomsRes.data as Classroom[];
                const activeTerm = termList.find(term => term.isActive) ?? termList[0];

                setTerms(termList);
                setClassrooms(classroomList);
                if (activeTerm) setSelectedTermId(String(activeTerm.id));
            } catch (error) {
                toast.error('ไม่สามารถโหลดข้อมูลภาคเรียนและห้องเรียนได้');
            } finally {
                setLoadingInitial(false);
            }
        };

        void fetchInitialData();
    }, []);

    const availableClassrooms = useMemo(() => {
        if (!selectedTermId) return [];
        return classrooms.filter(room => room.termId === Number(selectedTermId));
    }, [classrooms, selectedTermId]);

    useEffect(() => {
        setSelectedClassroomId('');
        setStudents([]);
        setRecords([]);
        setDraftStatuses({});
    }, [selectedTermId]);

    useEffect(() => {
        const fetchClassroomAttendance = async () => {
            if (!selectedClassroomId || !selectedDate) {
                setStudents([]);
                setRecords([]);
                setDraftStatuses({});
                return;
            }

            try {
                setLoadingData(true);
                const [studentsRes, historyRes] = await Promise.all([
                    api.get(`/students?classroomId=${selectedClassroomId}`),
                    api.get('/attendance/history/daily', {
                        params: {
                            date: selectedDate,
                            classroomId: selectedClassroomId,
                            type: selectedType
                        }
                    })
                ]);

                const nextStudents = studentsRes.data as Student[];
                const nextRecords = parseAttendanceRecords(historyRes.data);
                const nextDrafts: Record<string, AttendanceStatus | ''> = {};
                nextRecords.forEach(record => {
                    nextDrafts[record.student.id] = record.status;
                });

                setStudents(nextStudents);
                setRecords(nextRecords);
                setDraftStatuses(nextDrafts);
            } catch (error) {
                toast.error(getErrorMessage(error, 'ไม่สามารถโหลดข้อมูลการเช็คชื่อได้'));
            } finally {
                setLoadingData(false);
            }
        };

        void fetchClassroomAttendance();
    }, [selectedClassroomId, selectedDate, selectedType]);

    const recordsByStudentId = useMemo(() => {
        return new Map(records.map(record => [record.student.id, record]));
    }, [records]);

    const filteredStudents = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return students;

        return students.filter(student =>
            `${student.citizenId} ${student.firstName} ${student.lastName}`.toLowerCase().includes(query)
        );
    }, [students, searchQuery]);

    const selectedTerm = terms.find(term => String(term.id) === selectedTermId);
    const selectedClassroom = classrooms.find(room => String(room.id) === selectedClassroomId);
    const checkedCount = students.filter(student => Boolean(recordsByStudentId.get(student.id))).length;

    const handleStatusChange = (studentId: string, status: AttendanceStatus | '') => {
        setDraftStatuses(current => ({ ...current, [studentId]: status }));
    };

    const handleSaveStudent = async (student: Student) => {
        const status = draftStatuses[student.id];
        if (!status) {
            toast.error('กรุณาเลือกสถานะก่อนบันทึก');
            return;
        }

        const toastId = toast.loading(`กำลังบันทึก ${student.firstName}...`);
        setSavingStudentId(student.id);
        try {
            await api.post('/attendance/manual', {
                date: selectedDate,
                type: selectedType,
                studentId: student.id,
                status
            });

            const historyRes = await api.get('/attendance/history/daily', {
                params: {
                    date: selectedDate,
                    classroomId: selectedClassroomId,
                    type: selectedType
                }
            });
            const nextRecords = parseAttendanceRecords(historyRes.data);
            const nextDrafts: Record<string, AttendanceStatus | ''> = {};
            nextRecords.forEach(record => {
                nextDrafts[record.student.id] = record.status;
            });
            setRecords(nextRecords);
            setDraftStatuses(nextDrafts);
            toast.success('บันทึกสถานะสำเร็จ', { id: toastId });
        } catch (error) {
            toast.error(getErrorMessage(error, 'ไม่สามารถบันทึกสถานะได้'), { id: toastId });
        } finally {
            setSavingStudentId(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-800">
                        <ClipboardPenLine className="text-primary" /> แก้ไขการเช็คชื่อ
                    </h1>
                    <p className="text-gray-500">เลือกวันที่และห้องเรียนเพื่อแก้ไขสถานะการเช็คชื่อของนักเรียน</p>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm md:grid-cols-5">
                <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={(event) => setSelectedDate(event.target.value)}
                        className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 font-medium text-gray-700 outline-none focus:ring-1 focus:ring-primary"
                    />
                </div>

                <select
                    value={selectedTermId}
                    onChange={(event) => setSelectedTermId(event.target.value)}
                    disabled={loadingInitial}
                    className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 font-medium text-gray-700 outline-none focus:ring-1 focus:ring-primary"
                >
                    <option value="">เลือกภาคเรียน</option>
                    {terms.map(term => (
                        <option key={term.id} value={term.id}>
                            ภาคเรียน {term.term}/{term.year}{term.isActive ? ' (ปัจจุบัน)' : ''}
                        </option>
                    ))}
                </select>

                <div className="relative">
                    <DoorOpen className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <select
                        value={selectedClassroomId}
                        onChange={(event) => setSelectedClassroomId(event.target.value)}
                        disabled={!selectedTermId || loadingInitial}
                        className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-4 font-medium text-gray-700 outline-none focus:ring-1 focus:ring-primary"
                    >
                        <option value="">เลือกห้องเรียน</option>
                        {availableClassrooms.map(room => (
                            <option key={room.id} value={room.id}>{room.name}</option>
                        ))}
                    </select>
                </div>

                <select
                    value={selectedType}
                    onChange={(event) => setSelectedType(event.target.value as AttendanceType)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 font-medium text-gray-700 outline-none focus:ring-1 focus:ring-primary"
                >
                    {typeOptions.map(type => (
                        <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                </select>

                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder="ค้นหานักเรียน"
                        className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-gray-700 outline-none focus:ring-1 focus:ring-primary"
                    />
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-primary/10 bg-white p-5 shadow-sm">
                    <p className="text-sm font-bold text-gray-500">ภาคเรียน</p>
                    <p className="mt-1 text-xl font-black text-gray-900">
                        {selectedTerm ? `${selectedTerm.term}/${selectedTerm.year}` : '-'}
                    </p>
                </div>
                <div className="rounded-xl border border-primary/10 bg-white p-5 shadow-sm">
                    <p className="text-sm font-bold text-gray-500">ห้องเรียน</p>
                    <p className="mt-1 text-xl font-black text-gray-900">{selectedClassroom?.name ?? '-'}</p>
                </div>
                <div className="rounded-xl border border-primary/10 bg-white p-5 shadow-sm">
                    <p className="text-sm font-bold text-gray-500">เช็คชื่อแล้ว</p>
                    <p className="mt-1 text-xl font-black text-gray-900">{checkedCount} / {students.length}</p>
                </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full whitespace-nowrap text-left text-sm">
                        <thead className="border-b border-gray-100 bg-gray-50 text-gray-600">
                            <tr>
                                <th className="p-4 font-medium">รหัสนักเรียน</th>
                                <th className="p-4 font-medium">ชื่อ-นามสกุล</th>
                                <th className="p-4 font-medium">สถานะปัจจุบัน</th>
                                <th className="p-4 font-medium">แก้ไขสถานะ</th>
                                <th className="p-4 font-medium">ผู้บันทึกล่าสุด</th>
                                <th className="p-4 text-right font-medium">บันทึก</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loadingData ? (
                                <tr>
                                    <td colSpan={6} className="p-10 text-center text-gray-500">
                                        <LoaderCircle className="mx-auto mb-2 animate-spin text-primary" />
                                        กำลังโหลดข้อมูล...
                                    </td>
                                </tr>
                            ) : !selectedClassroomId ? (
                                <tr>
                                    <td colSpan={6} className="p-10 text-center text-gray-500">กรุณาเลือกห้องเรียน</td>
                                </tr>
                            ) : filteredStudents.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="p-10 text-center text-gray-500">ไม่พบนักเรียนในเงื่อนไขที่เลือก</td>
                                </tr>
                            ) : (
                                filteredStudents.map(student => {
                                    const record = recordsByStudentId.get(student.id);
                                    const draftStatus = draftStatuses[student.id] ?? '';
                                    const hasChanged = draftStatus && draftStatus !== record?.status;
                                    const statusLabel = statusOptions.find(status => status.value === record?.status)?.label;
                                    const statusColor = statusOptions.find(status => status.value === record?.status)?.className ?? 'text-gray-500';

                                    return (
                                        <tr key={student.id} className="transition-colors hover:bg-gray-50">
                                            <td className="p-4 font-mono text-gray-500">{student.citizenId}</td>
                                            <td className="p-4">
                                                <div className="flex items-center gap-2 font-bold text-gray-800">
                                                    <UserRoundCheck size={16} className="text-primary" />
                                                    {student.firstName} {student.lastName}
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                {record ? (
                                                    <span className={`inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-xs font-bold ${statusColor}`}>
                                                        <CheckCircle size={13} /> {statusLabel}
                                                    </span>
                                                ) : (
                                                    <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-500">ยังไม่เช็คชื่อ</span>
                                                )}
                                            </td>
                                            <td className="p-4">
                                                <select
                                                    value={draftStatus}
                                                    onChange={(event) => handleStatusChange(student.id, event.target.value as AttendanceStatus | '')}
                                                    className="w-44 rounded-lg border border-gray-300 bg-white px-3 py-2 font-bold text-gray-700 outline-none focus:ring-1 focus:ring-primary"
                                                >
                                                    <option value="">เลือกสถานะ</option>
                                                    {statusOptions.map(status => (
                                                        <option key={status.value} value={status.value}>{status.label}</option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td className="p-4 text-gray-500">
                                                {record?.recorder ? `${record.recorder.firstName} ${record.recorder.lastName}` : '-'}
                                            </td>
                                            <td className="p-4 text-right">
                                                <button
                                                    type="button"
                                                    onClick={() => void handleSaveStudent(student)}
                                                    disabled={!draftStatus || savingStudentId === student.id || (!hasChanged && Boolean(record))}
                                                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 font-bold text-white shadow-sm transition hover:bg-[#0f6b32] disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                    {savingStudentId === student.id ? (
                                                        <LoaderCircle size={16} className="animate-spin" />
                                                    ) : (
                                                        <Save size={16} />
                                                    )}
                                                    บันทึก
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
