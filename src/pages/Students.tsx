import { useState, useEffect, useMemo } from 'react';
import {
    Search, Plus, Upload, Edit, Trash2, X,
    ChevronLeft, ChevronRight, User, Eye, AlertTriangle, Shield, Award, Calendar,
    Download, FileSpreadsheet, Info, CheckCircle2
} from 'lucide-react';
import toast from 'react-hot-toast';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';
import api from '../services/api';

// --- Types ---
interface Term {
    id: number;
    term: number;
    year: number;
    isActive: boolean;
}

interface Classroom {
    id: number;
    name: string;
}

interface Student {
    id: string;
    citizenId: string;
    firstName: string;
    lastName: string;
    lineUserId: string | null;
    classroomId: number;
}

// Type สำหรับรับข้อมูลจาก /summary/student/{ID}
interface StudentSummary {
    studentId: string;
    name: string;
    scoreInfo: {
        currentScore: number;
        startingPoints: number;
        status: string;
    };
    thresholds: {
        failing: number;
        certificate: number;
        shield: number;
    };
    history: {
        id: string;
        points: number;
        note: string | null;
        createdAt: string;
        category: {
            type: string;
        }
    }[];
}

const ITEMS_PER_PAGE = 10;

const normalizeHeader = (value: string) => value.trim();

const escapeHtml = (value: unknown) =>
    String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

const normalizeMessages = (value: unknown): string[] => {
    if (Array.isArray(value)) {
        return value.flatMap(normalizeMessages);
    }

    if (typeof value === 'string' && value.trim()) {
        return [value.trim()];
    }

    return [];
};

const getErrorMessages = (error: any, fallback: string) => {
    const responseData = error?.response?.data;
    const messages = [
        ...normalizeMessages(responseData?.errors),
        ...normalizeMessages(responseData?.message),
        ...normalizeMessages(responseData?.error),
        ...normalizeMessages(error?.message)
    ];

    return messages.length > 0 ? [...new Set(messages)] : [fallback];
};

const extractImportCount = (data: any): number | null => {
    const candidates = [
        data?.success,
        data?.count,
        data?.created,
        data?.imported,
        data?.inserted,
        data?.total,
        data?.data?.success,
        data?.data?.count,
        data?.data?.created,
        data?.data?.imported,
        data?.data?.inserted,
        data?.data?.total
    ];

    const matched = candidates.find(value => typeof value === 'number');
    return typeof matched === 'number' ? matched : null;
};

const getImportWarnings = (data: any) => {
    const warnings = data?.errors ?? data?.failed ?? data?.skipped ?? data?.warnings ?? data?.data?.errors;
    return normalizeMessages(warnings);
};

const showImportResult = async (
    successCount: number,
    errors: string[],
    message = 'ดำเนินการนำเข้าข้อมูลเสร็จสิ้น'
) => {
    const hasErrors = errors.length > 0;
    const errorList = hasErrors
        ? `
            <div style="margin-top:16px; text-align:left">
                <div style="margin-bottom:8px; font-weight:800; color:#b91c1c">
                    รายการที่ไม่สามารถนำเข้าได้ (${errors.length})
                </div>
                <ol style="max-height:280px; overflow:auto; margin:0; padding:12px 12px 12px 34px; border:1px solid #fecaca; border-radius:12px; background:#fef2f2; color:#991b1b">
                    ${errors.map(error => `<li style="margin-bottom:6px; line-height:1.55">${escapeHtml(error)}</li>`).join('')}
                </ol>
            </div>
        `
        : '';

    await Swal.fire({
        icon: hasErrors ? (successCount > 0 ? 'warning' : 'error') : 'success',
        title: hasErrors
            ? (successCount > 0 ? 'นำเข้าสำเร็จบางส่วน' : 'ไม่สามารถนำเข้าข้อมูลได้')
            : 'นำเข้าข้อมูลสำเร็จ',
        html: `
            <div style="font-size:14px; color:#4b5563">${escapeHtml(message)}</div>
            <div style="margin-top:14px; padding:12px; border-radius:12px; background:#ecfdf5; color:#166534; font-size:16px; font-weight:800">
                เพิ่มนักเรียนสำเร็จ ${successCount} รายการ
            </div>
            ${errorList}
        `,
        confirmButtonText: 'รับทราบ',
        confirmButtonColor: '#1B813E',
        width: hasErrors ? 680 : 480,
        customClass: { popup: 'font-thai' }
    });
};

const validateExcelFile = async (file: File, requiredColumns: string[]) => {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];

    if (!firstSheetName) {
        return { valid: false, message: 'ไม่พบชีตข้อมูลในไฟล์ Excel', rowCount: 0 };
    }

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheetName], {
        defval: ''
    });
    const headers = rows[0] ? Object.keys(rows[0]).map(normalizeHeader) : [];
    const missingColumns = requiredColumns.filter(column => !headers.includes(column));

    if (missingColumns.length > 0) {
        return {
            valid: false,
            message: `ไฟล์ขาดคอลัมน์: ${missingColumns.join(', ')}`,
            rowCount: rows.length
        };
    }

    const usableRows = rows.filter(row =>
        requiredColumns.some(column => String(row[column] ?? '').trim() !== '')
    );

    if (usableRows.length === 0) {
        return { valid: false, message: 'ไม่พบข้อมูลสำหรับนำเข้าในไฟล์ Excel', rowCount: 0 };
    }

    return { valid: true, message: '', rowCount: usableRows.length };
};

const addClassroomIdToExcelFile = async (file: File, classroomId: string) => {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheetName], {
        defval: ''
    });
    const rowsWithClassroom = rows.map(row => ({
        ...row,
        classroomId: String(row.classroomId ?? '').trim() || classroomId
    }));

    const uploadWorkbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rowsWithClassroom);
    XLSX.utils.book_append_sheet(uploadWorkbook, worksheet, firstSheetName || 'students');
    const output = XLSX.write(uploadWorkbook, { bookType: 'xlsx', type: 'array' });

    return new File([output], file.name.replace(/\.(xls|xlsx)$/i, '') + '_with_classroom.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
};

export default function Students() {
    // --- Data States ---
    const [terms, setTerms] = useState<Term[]>([]);
    const [classrooms, setClassrooms] = useState<Classroom[]>([]);
    const [students, setStudents] = useState<Student[]>([]);
    const [loading, setLoading] = useState(false);

    // --- Filter States ---
    const [selectedTermId, setSelectedTermId] = useState<string>('');
    const [selectedClassroomId, setSelectedClassroomId] = useState<string>('');
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);

    // --- Modals State ---
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState<'CREATE' | 'EDIT'>('CREATE');
    const [editId, setEditId] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        citizenId: '', firstName: '', lastName: '', password: '', lineUserId: '', classroomId: ''
    });

    // --- Detail Modal State ---
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
    const [studentSummary, setStudentSummary] = useState<StudentSummary | null>(null);
    const [studentDetailLoading, setStudentDetailLoading] = useState(false);

    // 1. โหลดข้อมูลเริ่มต้น (ภาคเรียน และ ห้องเรียนทั้งหมด)
    useEffect(() => {
        fetchInitialData();
    }, []);

    const fetchInitialData = async () => {
        try {
            const [termsRes, classroomsRes] = await Promise.all([
                api.get('/terms'),
                api.get('/classrooms')
            ]);
            setTerms(termsRes.data);
            setClassrooms(classroomsRes.data);

            const activeTerm = termsRes.data.find((t: Term) => t.isActive);
            if (activeTerm) {
                setSelectedTermId(activeTerm.id.toString());
            }
        } catch (error) {
            toast.error('ไม่สามารถโหลดข้อมูลระบบได้');
        }
    };

    // 2. หากเปลี่ยนภาคเรียน ให้ล้างการเลือกห้องเรียนและข้อมูลนักเรียน
    useEffect(() => {
        setSelectedClassroomId('');
        setStudents([]);
    }, [selectedTermId]);

    // 3. โหลดรายชื่อนักเรียนเมื่อมีการเลือกห้อง
    useEffect(() => {
        if (selectedClassroomId) {
            fetchStudents(selectedClassroomId);
        } else {
            setStudents([]);
        }
    }, [selectedClassroomId]);

    const fetchStudents = async (classId: string) => {
        try {
            setLoading(true);
            const res = await api.get(`/students?classroomId=${classId}`);
            setStudents(res.data);
            setCurrentPage(1);
            return res.data as Student[];
        } catch (error) {
            toast.error('ไม่สามารถโหลดข้อมูลนักเรียนได้');
            return [];
        } finally {
            setLoading(false);
        }
    };

    // กรองห้องเรียนให้แสดงเฉพาะของภาคเรียนที่เลือก
    const availableClassrooms = useMemo(() => {
        if (!selectedTermId) return [];
        return classrooms.filter(c => (c as any).termId === Number(selectedTermId)); // Casting to any is safe here based on your Prisma schema
    }, [classrooms, selectedTermId]);

    // กรองนักเรียนและแบ่งหน้า
    const filteredData = useMemo(() => {
        return students.filter((s) =>
            `${s.firstName} ${s.lastName} ${s.citizenId}`.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [students, searchQuery]);

    const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE);
    const paginatedData = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredData.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredData, currentPage]);

    useEffect(() => { setCurrentPage(1); }, [searchQuery]);

    // --- จัดการฟอร์ม เพิ่ม/แก้ไข ---
    const handleOpenCreate = () => {
        if (!selectedClassroomId) return toast.error('กรุณาเลือกห้องเรียนจากเมนูด้านบนก่อน');
        setModalMode('CREATE');
        setFormData({
            citizenId: '', firstName: '', lastName: '', password: '', lineUserId: '',
            classroomId: selectedClassroomId
        });
        setIsFormModalOpen(true);
    };

    const handleOpenEdit = (s: Student) => {
        setModalMode('EDIT');
        setEditId(s.id);
        setFormData({
            citizenId: s.citizenId,
            firstName: s.firstName,
            lastName: s.lastName,
            password: '',
            lineUserId: s.lineUserId || '',
            classroomId: s.classroomId.toString()
        });
        setIsFormModalOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const toastId = toast.loading('กำลังบันทึก...');
        try {
            const payload: any = {
                citizenId: formData.citizenId,
                firstName: formData.firstName,
                lastName: formData.lastName,
                classroomId: Number(formData.classroomId),
            };

            if (formData.password) payload.password = formData.password;
            if (formData.lineUserId) payload.lineUserId = formData.lineUserId;

            if (modalMode === 'CREATE') {
                await api.post('/students', payload);
                toast.success('เพิ่มนักเรียนสำเร็จ', { id: toastId });
            } else {
                await api.patch(`/students/${editId}`, payload);
                toast.success('แก้ไขข้อมูลสำเร็จ', { id: toastId });
            }
            setIsFormModalOpen(false);
            fetchStudents(selectedClassroomId);
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'เกิดข้อผิดพลาด', { id: toastId });
        }
    };

    const handleDelete = (id: string, name: string) => {
        Swal.fire({
            title: 'ยืนยันการลบ?',
            text: `ต้องการลบข้อมูลของ ${name} หรือไม่? ประวัติพฤติกรรมจะถูกลบไปด้วย`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            confirmButtonText: 'ใช่, ลบเลย',
            cancelButtonText: 'ยกเลิก'
        }).then(async (result) => {
            if (result.isConfirmed) {
                try {
                    await api.delete(`/students/${id}`);
                    toast.success('ลบข้อมูลสำเร็จ');
                    fetchStudents(selectedClassroomId);
                } catch (error) {
                    toast.error('ลบข้อมูลไม่สำเร็จ');
                }
            }
        });
    };

    // --- นำเข้าผ่าน Excel ---
    const handleExcelUpload = async () => {
        if (!selectedClassroomId) return toast.error('กรุณาเลือกห้องเรียนที่จะนำเข้าข้อมูลก่อน');
        const targetClass = availableClassrooms.find(c => c.id.toString() === selectedClassroomId);

        const { value: file } = await Swal.fire({
            title: `นำเข้านักเรียนห้อง ${targetClass?.name}`,
            html: `
                <div style="text-align:left; font-size:14px; line-height:1.7">
                    <p style="margin-bottom:8px">ระบบจะเติม classroomId จากห้องเรียนที่เลือกอยู่ให้อัตโนมัติก่อนอัปโหลด</p>
                    <p style="margin-bottom:8px">กรุณาใช้ไฟล์ .xlsx หรือ .xls และกำหนดหัวตารางแถวแรกตามนี้</p>
                    <code style="display:block; padding:10px; border-radius:10px; background:#f3f4f6; color:#1f2937">
                        citizenId, firstName, lastName, password, classroomId, lineUserId
                    </code>
                    <p style="margin-top:8px; color:#6b7280">
                        classroomId และ lineUserId เป็นข้อมูลเสริม ถ้า classroomId ว่าง ระบบจะใช้ห้องเรียนที่เลือกอยู่
                    </p>
                </div>
            `,
            input: 'file',
            inputAttributes: { accept: '.xlsx, .xls', 'aria-label': 'Upload Excel file' },
            showCancelButton: true,
            confirmButtonText: 'อัปโหลด',
            cancelButtonText: 'ยกเลิก',
            confirmButtonColor: '#1B813E',
            customClass: { popup: 'font-thai' }
        });

        if (file) {
            const toastId = toast.loading('กำลังประมวลผลไฟล์...');
            const uploadData = new FormData();
            try {
                const validation = await validateExcelFile(file as File, ['citizenId', 'firstName', 'lastName', 'password']);
                if (!validation.valid) {
                    toast.error(validation.message, { id: toastId });
                    return;
                }

                const beforeCount = students.length;
                const fileWithClassroomId = await addClassroomIdToExcelFile(file as File, selectedClassroomId);
                uploadData.append('file', fileWithClassroomId);
                uploadData.append('classroomId', selectedClassroomId);

                const response = await api.post('/students/upload', uploadData);
                const latestStudents = await fetchStudents(selectedClassroomId);
                const importedCount = extractImportCount(response.data);
                const addedCount = Math.max(latestStudents.length - beforeCount, 0);
                const warnings = getImportWarnings(response.data);
                const successCount = importedCount ?? addedCount;
                const responseMessage = normalizeMessages(response.data?.message)[0]
                    ?? 'ดำเนินการนำเข้าข้อมูลเสร็จสิ้น';

                toast.dismiss(toastId);

                if (warnings.length > 0) {
                    await showImportResult(successCount, warnings, responseMessage);
                    return;
                }

                if (successCount === 0) {
                    await showImportResult(0, [
                        'อัปโหลดไฟล์แล้ว แต่ไม่พบข้อมูลที่ถูกเพิ่ม กรุณาตรวจสอบห้องเรียนและข้อมูลในไฟล์'
                    ], responseMessage);
                    return;
                }

                toast.success(`นำเข้าสำเร็จ ${successCount} รายการ`);
            } catch (error: any) {
                toast.dismiss(toastId);
                await showImportResult(
                    0,
                    getErrorMessages(error, 'รูปแบบไฟล์ไม่ถูกต้อง'),
                    'ระบบไม่สามารถประมวลผลไฟล์ Excel ได้'
                );
            }
        }
    };

    const handleDownloadTemplate = () => {
        const targetClass = availableClassrooms.find(c => c.id.toString() === selectedClassroomId);
        const exampleRows = [
            {
                citizenId: '10001',
                firstName: 'เด็กชายธนกฤต',
                lastName: 'ใจดี',
                password: '123456',
                classroomId: selectedClassroomId || '',
                lineUserId: ''
            },
            {
                citizenId: '10002',
                firstName: 'เด็กหญิงพิมพ์ชนก',
                lastName: 'รักเรียน',
                password: '123456',
                classroomId: selectedClassroomId || '',
                lineUserId: ''
            }
        ];

        const instructionRows = [
            ['คำแนะนำการกรอกไฟล์นำเข้านักเรียน'],
            ['1. ใช้ชีตชื่อ students_template หรือชีตแรกของไฟล์สำหรับข้อมูลนำเข้า'],
            ['2. ห้ามเปลี่ยนชื่อหัวคอลัมน์: citizenId, firstName, lastName, password, classroomId, lineUserId'],
            ['3. classroomId คือรหัสห้องเรียน หากเว้นว่างไว้ ระบบจะเติมจากห้องเรียนที่เลือกบนหน้าเว็บก่อนอัปโหลด'],
            [`4. ห้องเรียนเป้าหมายปัจจุบัน: ${targetClass?.name ?? 'กรุณาเลือกห้องเรียนก่อนอัปโหลด'}`],
            ['5. citizenId คือรหัสนักเรียน/Username ควรเก็บเป็นข้อความเพื่อไม่ให้เลข 0 ด้านหน้าหาย'],
            ['6. password จำเป็นสำหรับนักเรียนใหม่ หาก backend กำหนดรหัสเริ่มต้นเอง สามารถปรับตามกติกาของระบบได้'],
            ['7. lineUserId เป็นข้อมูลเสริม สามารถปล่อยว่างได้'],
            ['8. ลบแถวตัวอย่างออกก่อนนำเข้าข้อมูลจริง หากไม่ต้องการนำเข้าข้อมูลตัวอย่าง']
        ];

        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet(exampleRows);
        const instructionSheet = XLSX.utils.aoa_to_sheet(instructionRows);

        worksheet['!cols'] = [
            { wch: 18 },
            { wch: 22 },
            { wch: 22 },
            { wch: 16 },
            { wch: 14 },
            { wch: 28 }
        ];
        instructionSheet['!cols'] = [{ wch: 100 }];

        XLSX.utils.book_append_sheet(workbook, worksheet, 'students_template');
        XLSX.utils.book_append_sheet(workbook, instructionSheet, 'คำแนะนำ');
        XLSX.writeFile(workbook, `ตัวอย่างนำเข้านักเรียน_${targetClass?.name ?? 'DSPS_CARE'}.xlsx`);
    };

    // --- ดูสรุปพฤติกรรม (ใช้ API เส้นใหม่ /summary/student/{ID}) ---
    const handleViewDetail = async (s: Student) => {
        setSelectedStudent(s);
        setStudentSummary(null); // ล้างข้อมูลเก่าป้องกันการแสดงผลผิดพลาดระหว่างโหลด
        setIsDetailModalOpen(true);
        setStudentDetailLoading(true);
        try {
            const res = await api.get(`/summary/student/${s.id}`);
            setStudentSummary(res.data);
        } catch (error) {
            toast.error('ไม่สามารถโหลดสรุปข้อมูลนักเรียนได้');
            setIsDetailModalOpen(false); // ปิด modal ถ้าโหลดพัง
        } finally {
            setStudentDetailLoading(false);
        }
    };

    const getRoomName = (id: number) => classrooms.find(c => c.id === id)?.name || '-';

    return (
        <div className="space-y-6">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">จัดการข้อมูลนักเรียน</h1>
                    <p className="text-gray-500">เลือกปีการศึกษาและห้องเรียนเพื่อจัดการข้อมูลนักเรียน</p>
                </div>

                {/* --- Filters Area --- */}
                <div className="flex flex-col sm:flex-row gap-2">

                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Calendar className="text-indigo-500" size={18} />
                        </div>
                        <select
                            className="w-full sm:w-auto pl-10 pr-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-1 focus:ring-primary bg-white font-medium text-gray-700"
                            value={selectedTermId}
                            onChange={(e) => setSelectedTermId(e.target.value)}
                        >
                            <option value="">-- ปีการศึกษา --</option>
                            {terms.map(t => (
                                <option key={t.id} value={t.id}>
                                    ภาคเรียน {t.term}/{t.year} {t.isActive ? '(ปัจจุบัน)' : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    <select
                        disabled={!selectedTermId}
                        className="w-full sm:w-auto border border-gray-300 rounded-lg px-4 py-2 outline-none focus:ring-1 focus:ring-primary bg-white font-medium text-gray-700 disabled:bg-gray-100 disabled:text-gray-400"
                        value={selectedClassroomId}
                        onChange={(e) => setSelectedClassroomId(e.target.value)}
                    >
                        <option value="">-- เลือกห้องเรียน --</option>
                        {availableClassrooms.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>

                    <button
                        onClick={handleDownloadTemplate}
                        className="flex items-center justify-center gap-2 border border-primary/20 bg-white hover:bg-primary/5 text-primary px-4 py-2 rounded-lg font-bold transition-colors"
                    >
                        <Download size={18} /> ไฟล์ตัวอย่าง
                    </button>
                    <button
                        onClick={handleExcelUpload}
                        disabled={!selectedClassroomId}
                        className="flex items-center justify-center gap-2 bg-primary hover:bg-[#0f6b32] disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-bold transition-colors"
                    >
                        <Upload size={18} /> นำเข้า Excel
                    </button>
                    <button
                        onClick={handleOpenCreate}
                        disabled={!selectedClassroomId}
                        className="flex items-center justify-center gap-2 bg-secondary hover:bg-yellow-300 disabled:bg-gray-300 disabled:cursor-not-allowed text-[#063d1f] px-4 py-2 rounded-lg font-bold transition-colors"
                    >
                        <Plus size={18} /> เพิ่มนักเรียน
                    </button>
                </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
                <div className="rounded-2xl border border-primary/10 bg-white p-5 shadow-sm">
                    <div className="flex items-start gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                            <FileSpreadsheet size={24} />
                        </div>
                        <div>
                            <h2 className="font-black text-gray-900">นำเข้านักเรียนด้วย Excel</h2>
                            <p className="mt-1 text-sm leading-6 text-gray-500">
                                ดาวน์โหลดไฟล์ตัวอย่างก่อนกรอกข้อมูล แล้วเลือกภาคเรียนและห้องเรียนเป้าหมายก่อนกดนำเข้า
                                ระบบจะเติม classroomId จากห้องเรียนที่เลือกอยู่ให้ก่อนอัปโหลด
                            </p>
                            <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold">
                                <span className="rounded-full bg-primary/10 px-3 py-1 text-primary">citizenId</span>
                                <span className="rounded-full bg-primary/10 px-3 py-1 text-primary">firstName</span>
                                <span className="rounded-full bg-primary/10 px-3 py-1 text-primary">lastName</span>
                                <span className="rounded-full bg-secondary/40 px-3 py-1 text-[#6b5400]">password</span>
                                <span className="rounded-full bg-primary/10 px-3 py-1 text-primary">classroomId</span>
                                <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-500">lineUserId</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="rounded-2xl border border-secondary/40 bg-secondary/15 p-5">
                    <div className="mb-3 flex items-center gap-2 font-black text-[#6b5400]">
                        <Info size={18} />
                        คำแนะนำสั้น ๆ
                    </div>
                    <ul className="space-y-2 text-sm leading-6 text-[#6b5400]">
                        <li className="flex gap-2">
                            <CheckCircle2 className="mt-0.5 shrink-0 text-primary" size={16} />
                            ต้องเลือกห้องเรียนก่อนอัปโหลด Excel
                        </li>
                        <li className="flex gap-2">
                            <CheckCircle2 className="mt-0.5 shrink-0 text-primary" size={16} />
                            ใช้ไฟล์ .xlsx หรือ .xls เท่านั้น
                        </li>
                        <li className="flex gap-2">
                            <CheckCircle2 className="mt-0.5 shrink-0 text-primary" size={16} />
                            citizenId ควรตั้งเป็นข้อความ เพื่อกันเลข 0 ด้านหน้าหาย
                        </li>
                    </ul>
                </div>
            </div>

            {!selectedClassroomId ? (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center flex flex-col items-center justify-center">
                    <div className="bg-indigo-50 p-4 rounded-full text-indigo-500 mb-4">
                        <User size={48} />
                    </div>
                    <h2 className="text-xl font-bold text-gray-800 mb-2">เลือกปีการศึกษาและห้องเรียน</h2>
                    <p className="text-gray-500">กรุณาเลือกภาคเรียนและห้องเรียนจากเมนูด้านบนขวาเพื่อเริ่มต้น</p>
                </div>
            ) : (
                <>
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                        <div className="relative w-full max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                            <input
                                type="text"
                                placeholder="ค้นหาชื่อ, นามสกุล หรือรหัสประจำตัว..."
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-primary outline-none"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left whitespace-nowrap">
                                <thead className="bg-gray-50 border-b border-gray-100 text-sm text-gray-600">
                                    <tr>
                                        <th className="p-4 font-medium">รหัสประจำตัว</th>
                                        <th className="p-4 font-medium">ชื่อ-นามสกุล</th>
                                        <th className="p-4 font-medium">ห้องเรียน</th>
                                        <th className="p-4 font-medium">สถานะ LINE</th>
                                        <th className="p-4 font-medium text-center">การจัดการ</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {loading ? (
                                        <tr><td colSpan={5} className="p-8 text-center text-gray-500">กำลังโหลดข้อมูล...</td></tr>
                                    ) : paginatedData.length === 0 ? (
                                        <tr><td colSpan={5} className="p-8 text-center text-gray-500">ไม่มีข้อมูลนักเรียน</td></tr>
                                    ) : (
                                        paginatedData.map((s) => (
                                            <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                                                <td className="p-4 font-mono text-gray-600">{s.citizenId}</td>
                                                <td className="p-4 font-bold text-gray-800">{s.firstName} {s.lastName}</td>
                                                <td className="p-4 text-gray-700 font-medium">{getRoomName(s.classroomId)}</td>
                                                <td className="p-4">
                                                    {s.lineUserId ? (
                                                        <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-bold">เชื่อมต่อแล้ว</span>
                                                    ) : (
                                                        <span className="text-xs text-gray-400">-</span>
                                                    )}
                                                </td>
                                                <td className="p-4">
                                                    <div className="flex justify-center gap-1">
                                                        <button onClick={() => handleViewDetail(s)} title="ดูข้อมูล/ประวัติพฤติกรรม" className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded">
                                                            <Eye size={18} />
                                                        </button>
                                                        <button onClick={() => handleOpenEdit(s)} title="แก้ไข" className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded">
                                                            <Edit size={18} />
                                                        </button>
                                                        <button onClick={() => handleDelete(s.id, s.firstName)} title="ลบ" className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded">
                                                            <Trash2 size={18} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {filteredData.length > 0 && (
                            <div className="p-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
                                <p className="text-sm text-gray-500">แสดง {paginatedData.length} จาก {filteredData.length} คน</p>
                                <div className="flex items-center gap-2">
                                    <button
                                        disabled={currentPage === 1}
                                        onClick={() => setCurrentPage(prev => prev - 1)}
                                        className="p-1.5 border border-gray-300 rounded hover:bg-white disabled:opacity-50 transition-colors"
                                    >
                                        <ChevronLeft size={18} />
                                    </button>
                                    <span className="text-sm font-bold text-gray-700">หน้า {currentPage} / {totalPages}</span>
                                    <button
                                        disabled={currentPage === totalPages}
                                        onClick={() => setCurrentPage(prev => prev + 1)}
                                        className="p-1.5 border border-gray-300 rounded hover:bg-white disabled:opacity-50 transition-colors"
                                    >
                                        <ChevronRight size={18} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* Modal 1: ฟอร์มเพิ่ม/แก้ไข นักเรียน */}
            {isFormModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-6 border-b flex justify-between items-center bg-gray-50/50">
                            <h3 className="text-xl font-bold text-gray-800">{modalMode === 'CREATE' ? 'เพิ่มนักเรียนใหม่' : 'แก้ไขข้อมูลนักเรียน'}</h3>
                            <button onClick={() => setIsFormModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1 text-primary">สังกัดห้องเรียน</label>
                                <select
                                    required
                                    value={formData.classroomId}
                                    onChange={(e) => setFormData({ ...formData, classroomId: e.target.value })}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-primary bg-white font-bold text-gray-800"
                                >
                                    <option value="">-- เลือกห้องเรียน --</option>
                                    {availableClassrooms.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">รหัสนักเรียน (Username)</label>
                                <input
                                    type="text" required
                                    value={formData.citizenId}
                                    onChange={(e) => setFormData({ ...formData, citizenId: e.target.value })}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">ชื่อจริง</label>
                                    <input
                                        type="text" required
                                        value={formData.firstName}
                                        onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">นามสกุล</label>
                                    <input
                                        type="text" required
                                        value={formData.lastName}
                                        onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">
                                    รหัสผ่าน {modalMode === 'EDIT' && <span className="text-xs text-gray-400 font-normal">(เว้นว่างไว้หากไม่ต้องการเปลี่ยน)</span>}
                                </label>
                                <input
                                    type="text"
                                    required={modalMode === 'CREATE'}
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    placeholder={modalMode === 'CREATE' ? 'ตั้งค่ารหัสผ่านเริ่มต้น' : 'กรอกรหัสผ่านใหม่'}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">LINE User ID <span className="text-xs text-gray-400 font-normal">(ตัวเลือกเสริม)</span></label>
                                <input
                                    type="text"
                                    value={formData.lineUserId}
                                    onChange={(e) => setFormData({ ...formData, lineUserId: e.target.value })}
                                    placeholder="ปล่อยว่างได้ถ้านักเรียนยังไม่ได้ผูกบัญชี"
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-primary font-mono text-sm"
                                />
                            </div>
                            <div className="pt-4 flex gap-3">
                                <button type="button" onClick={() => setIsFormModalOpen(false)} className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg font-bold text-gray-700 transition-colors">ยกเลิก</button>
                                <button type="submit" className="flex-1 py-2 bg-primary hover:bg-blue-900 text-white rounded-lg font-bold transition-colors shadow-md">บันทึกข้อมูล</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal 2: ดูรายละเอียดและประวัติการหักคะแนน */}
            {isDetailModalOpen && selectedStudent && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-in fade-in zoom-in duration-200">
                        <div className="p-6 border-b flex justify-between items-center bg-indigo-50/50">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 bg-primary text-white rounded-full flex items-center justify-center font-bold text-xl">
                                    {selectedStudent.firstName[0]}
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-gray-800">{studentSummary ? studentSummary.name : `${selectedStudent.firstName} ${selectedStudent.lastName}`}</h3>
                                    <p className="text-sm text-gray-500">รหัสประจำตัว: {selectedStudent.citizenId} | ห้อง: {getRoomName(selectedStudent.classroomId)}</p>
                                </div>
                            </div>
                            <button onClick={() => setIsDetailModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1">
                            {studentDetailLoading || !studentSummary ? (
                                <div className="text-center py-8 text-gray-500">กำลังโหลดสรุปพฤติกรรม...</div>
                            ) : (
                                <div className="space-y-6">
                                    {/* กล่องสรุปคะแนน */}
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        <div className="bg-blue-50 p-4 rounded-xl text-center border border-blue-100">
                                            <p className="text-xs text-blue-600 font-bold mb-1">คะแนนเริ่มต้น</p>
                                            <p className="text-2xl font-bold text-gray-800">{studentSummary.scoreInfo.startingPoints}</p>
                                        </div>
                                        <div className="bg-green-50 p-4 rounded-xl text-center border border-green-100">
                                            <p className="text-xs text-green-600 font-bold mb-1">คะแนนปัจจุบัน</p>
                                            <p className={`text-2xl font-bold ${studentSummary.scoreInfo.currentScore < studentSummary.thresholds.failing ? 'text-red-600' : 'text-green-700'
                                                }`}>
                                                {studentSummary.scoreInfo.currentScore}
                                            </p>
                                        </div>
                                        <div className="bg-yellow-50 p-4 rounded-xl text-center border border-yellow-100 flex flex-col justify-center items-center">
                                            <Award size={20} className="text-yellow-600 mb-1" />
                                            <p className="text-xs text-yellow-700 font-bold">เกณฑ์เกียรติบัตร ({studentSummary.thresholds.certificate})</p>
                                        </div>
                                        <div className="bg-red-50 p-4 rounded-xl text-center border border-red-100 flex flex-col justify-center items-center">
                                            <AlertTriangle size={20} className="text-red-600 mb-1" />
                                            <p className="text-xs text-red-700 font-bold">เกณฑ์ไม่ผ่าน ({studentSummary.thresholds.failing})</p>
                                        </div>
                                    </div>

                                    {/* ประวัติพฤติกรรม */}
                                    <div>
                                        <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                                            <Shield size={18} className="text-primary" /> ประวัติการบันทึกพฤติกรรม
                                        </h4>

                                        {studentSummary.history.length === 0 ? (
                                            <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
                                                <p className="text-gray-500 font-medium">ยังไม่มีประวัติการหักหรือเพิ่มคะแนน</p>
                                                <p className="text-sm text-gray-400 mt-1">นักเรียนคนนี้มีพฤติกรรมดีเยี่ยม!</p>
                                            </div>
                                        ) : (
                                            <div className="border border-gray-200 rounded-xl overflow-hidden">
                                                <table className="w-full text-left text-sm">
                                                    <thead className="bg-gray-50 border-b border-gray-200 text-gray-600">
                                                        <tr>
                                                            <th className="p-3 font-medium">วันที่ / เวลา</th>
                                                            <th className="p-3 font-medium text-center">คะแนน</th>
                                                            <th className="p-3 font-medium">หมายเหตุ / เหตุผล</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-100">
                                                        {studentSummary.history.map((log) => (
                                                            <tr key={log.id} className="hover:bg-gray-50">
                                                                <td className="p-3 text-gray-600">
                                                                    {new Date(log.createdAt).toLocaleString('th-TH', {
                                                                        year: 'numeric', month: 'short', day: 'numeric',
                                                                        hour: '2-digit', minute: '2-digit'
                                                                    })}
                                                                </td>
                                                                <td className="p-3 text-center">
                                                                    <span className={`px-2 py-1 rounded font-bold ${log.category.type === "ADD" ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                                      {log.category.type === "ADD" ? '+' : '-'}{log.points > 0 ? `${log.points}` : log.points}
                                                                    </span>
                                                                </td>
                                                                <td className="p-3 text-gray-700">{log.note || '-'}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
