import { useState, useEffect, useMemo } from 'react';
import {
    Search, Upload, Calendar, Trash2,
    ChevronLeft, ChevronRight, GraduationCap,
    Check, ChevronsUpDown, X, BookOpen,
    Download, FileSpreadsheet, Info, CheckCircle2, FileDown
} from 'lucide-react';
import { Combobox } from '@headlessui/react';
import toast from 'react-hot-toast';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';
import api from '../services/api';

// --- Types ---
interface AcademicTerm {
    id: number;
    term: number;
    year: number;
    isActive: boolean;
}

interface BehaviorRecord {
    id: string;
    points: number;
    note: string | null;
    createdAt: string;
    student: {
        id: string;
        citizenId: string;
        firstName: string;
        lastName: string;
        classroom: { name: string };
    };
    recorder: {
        firstName: string;
        lastName: string;
    };
    category: { 
        name: string,
        type: string
     } | null;
}

interface Classroom {
    id: number;
    name: string;
    termId: number;
}

interface Student {
    id: string;
    firstName: string;
    lastName: string;
    citizenId: string;
}

interface PointCategory {
    id: number;
    name: string;
    type: 'ADD' | 'DEDUCT';
    defaultPoints: number;
}

const ITEMS_PER_PAGE = 10;

const formatDateTime = (date: string) =>
    new Date(date).toLocaleString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

const safeSheetName = (name: string) => name.replace(/[\\/?*[\]:]/g, '').slice(0, 31) || 'Data';

export default function AdminBehaviorManagement() {
    const [records, setRecords] = useState<BehaviorRecord[]>([]);
    const [loading, setLoading] = useState(false);
    const [terms, setTerms] = useState<AcademicTerm[]>([]);
    const [classrooms, setClassrooms] = useState<Classroom[]>([]);
    const [students, setStudents] = useState<Student[]>([]);
    const [categories, setCategories] = useState<PointCategory[]>([]);

    // --- Filters State ---
    const [selectedTermId, setSelectedTermId] = useState<string>('');
    const [filterDate, setFilterDate] = useState('');
    const [filterClassroomId, setFilterClassroomId] = useState('');
    const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
    const [studentQuery, setStudentQuery] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);

    useEffect(() => {
        // 1. โหลดข้อมูลพื้นฐาน
        const fetchBaseData = async () => {
            try {
                const [termsRes, classroomsRes, studentsRes, categoriesRes] = await Promise.all([
                    api.get('/terms'),
                    api.get('/classrooms'),
                    api.get('/students'),
                    api.get('/point-categories')
                ]);

                setTerms(termsRes.data);
                setClassrooms(classroomsRes.data);
                setStudents(studentsRes.data);
                setCategories(categoriesRes.data);

                // เลือกเทอมปัจจุบันเป็น Default
                const active = termsRes.data.find((t: AcademicTerm) => t.isActive);
                if (active) setSelectedTermId(active.id.toString());

            } catch (error) {
                toast.error('โหลดข้อมูลระบบไม่สำเร็จ');
            }
        };
        fetchBaseData();
    }, []);

    // 2. ดึงประวัติเมื่อ Filters เปลี่ยน (รวมถึง TermId)
    useEffect(() => {
        fetchHistory();
    }, [selectedTermId, filterDate, filterClassroomId, selectedStudent]);

    // กรองห้องเรียนตามเทอมที่เลือก
    const availableClassrooms = useMemo(() => {
        if (!selectedTermId) return [];
        return classrooms.filter(c => c.termId === Number(selectedTermId));
    }, [classrooms, selectedTermId]);

    const fetchHistory = async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams();
            if (selectedTermId) params.append('termId', selectedTermId);
            if (filterDate) params.append('date', filterDate);
            if (filterClassroomId) params.append('classroomId', filterClassroomId);
            if (selectedStudent) params.append('studentId', selectedStudent.id);

            const res = await api.get(`/behaviors/history?${params.toString()}`);
            setRecords(res.data);
            setCurrentPage(1);
        } catch (error) {
            toast.error('ไม่สามารถโหลดประวัติพฤติกรรมได้');
        } finally {
            setLoading(false);
        }
    };

    const filteredStudents = studentQuery === ''
        ? students
        : students.filter((s) =>
            `${s.firstName} ${s.lastName} ${s.citizenId}`.toLowerCase().includes(studentQuery.toLowerCase())
        );

    // --- Actions ---
    const handleImportExcel = async () => {
        const { value: file } = await Swal.fire({
            title: 'นำเข้าคะแนนจาก Excel',
            html: `
                <div style="text-align:left; font-size:14px; line-height:1.7">
                    <p style="margin-bottom:8px">กรุณาใช้ไฟล์ .xlsx หรือ .xls และกำหนดหัวตารางแถวแรกตามนี้</p>
                    <code style="display:block; padding:10px; border-radius:10px; background:#f3f4f6; color:#1f2937">
                        citizenId, points, note, categoryId
                    </code>
                    <p style="margin-top:8px; color:#6b7280">
                        categoryId ดูได้จากชีต <b>category_reference</b> ในไฟล์ตัวอย่าง
                    </p>
                </div>
            `,
            input: 'file',
            inputAttributes: { accept: '.xlsx, .xls' },
            showCancelButton: true,
            confirmButtonText: 'เริ่มอัปโหลด',
            cancelButtonText: 'ยกเลิก',
            confirmButtonColor: '#1B813E',
            customClass: { popup: 'font-thai' }
        });

        if (file) {
            const toastId = toast.loading('กำลังประมวลผลไฟล์...');
            const formData = new FormData();
            formData.append('file', file);
            try {
                const res = await api.post('/behaviors/import-excel', formData);
                toast.success(`สำเร็จ ${res.data.success} รายการ`, { id: toastId });
                fetchHistory();
            } catch (error) {
                toast.error('การนำเข้าไฟล์ขัดข้อง', { id: toastId });
            }
        }
    };

    const handleDownloadTemplate = () => {
        const fallbackCategory = categories[0];
        const exampleRows = [
            {
                citizenId: '10001',
                points: fallbackCategory?.defaultPoints ?? 5,
                note: 'ตัวอย่างบันทึกคะแนนพฤติกรรม',
                categoryId: fallbackCategory?.id ?? ''
            },
            {
                citizenId: '10002',
                points: categories[1]?.defaultPoints ?? 3,
                note: 'ตัวอย่างเพิ่มเติม',
                categoryId: categories[1]?.id ?? fallbackCategory?.id ?? ''
            }
        ];

        const categoryRows = categories.length > 0
            ? categories.map(category => ({
                categoryId: category.id,
                name: category.name,
                type: category.type === 'ADD' ? 'เพิ่มคะแนน' : 'หักคะแนน',
                defaultPoints: category.defaultPoints
            }))
            : [{ categoryId: '', name: 'ยังไม่มีประเภทคะแนนในระบบ', type: '', defaultPoints: '' }];

        const instructionRows = [
            ['คำแนะนำการกรอกไฟล์นำเข้าคะแนนพฤติกรรม'],
            ['1. ใช้ชีตชื่อ behavior_template หรือชีตแรกของไฟล์สำหรับข้อมูลนำเข้า'],
            ['2. ห้ามเปลี่ยนชื่อหัวคอลัมน์: citizenId, points, note, categoryId'],
            ['3. citizenId คือรหัสนักเรียน/Username ต้องตรงกับข้อมูลนักเรียนในระบบ'],
            ['4. points คือจำนวนคะแนนที่ต้องการบันทึก ให้ใส่เป็นตัวเลขบวก เช่น 5, 10'],
            ['5. ระบบจะตีความว่าเพิ่มหรือหักคะแนนตามประเภทของ categoryId ที่เลือก'],
            ['6. categoryId ดูได้จากชีต category_reference'],
            ['7. note เป็นหมายเหตุประกอบ สามารถใส่รายละเอียดเพิ่มเติมได้'],
            ['8. ลบแถวตัวอย่างออกก่อนนำเข้าข้อมูลจริง หากไม่ต้องการนำเข้าข้อมูลตัวอย่าง']
        ];

        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet(exampleRows);
        const categorySheet = XLSX.utils.json_to_sheet(categoryRows);
        const instructionSheet = XLSX.utils.aoa_to_sheet(instructionRows);

        worksheet['!cols'] = [
            { wch: 18 },
            { wch: 12 },
            { wch: 36 },
            { wch: 14 }
        ];
        categorySheet['!cols'] = [
            { wch: 14 },
            { wch: 34 },
            { wch: 14 },
            { wch: 14 }
        ];
        instructionSheet['!cols'] = [{ wch: 100 }];

        XLSX.utils.book_append_sheet(workbook, worksheet, 'behavior_template');
        XLSX.utils.book_append_sheet(workbook, categorySheet, 'category_reference');
        XLSX.utils.book_append_sheet(workbook, instructionSheet, 'คำแนะนำ');
        XLSX.writeFile(workbook, 'ตัวอย่างนำเข้าคะแนนพฤติกรรม_DSPS_CARE.xlsx');
    };

    const handleDeleteRecord = (id: string) => {
        Swal.fire({
            title: 'ยืนยันการลบ?',
            text: "รายการคะแนนจะถูกยกเลิกและไม่สามารถเรียกคืนได้",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            confirmButtonText: 'ลบข้อมูล'
        }).then(async (result) => {
            if (result.isConfirmed) {
                try {
                    await api.delete(`/behaviors/${id}`);
                    toast.success('ลบรายการสำเร็จ');
                    fetchHistory();
                } catch (error) {
                    toast.error('ไม่สามารถลบข้อมูลได้');
                }
            }
        });
    };

    const filteredRecords = useMemo(() => {
        return records.filter(r =>
            `${r.student.firstName} ${r.student.lastName} ${r.student.citizenId}`.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [records, searchQuery]);

    const handleExportExcel = () => {
        if (filteredRecords.length === 0) {
            toast.error('ไม่มีข้อมูลสำหรับส่งออก');
            return;
        }

        const selectedTerm = terms.find(term => String(term.id) === selectedTermId);
        const selectedClassroom = classrooms.find(room => String(room.id) === filterClassroomId);
        const totalAdd = filteredRecords
            .filter(record => record.category?.type === 'ADD')
            .reduce((sum, record) => sum + record.points, 0);
        const totalDeduct = filteredRecords
            .filter(record => record.category?.type !== 'ADD')
            .reduce((sum, record) => sum + record.points, 0);

        const exportRows = filteredRecords.map((record, index) => ({
            ลำดับ: index + 1,
            'วันที่/เวลา': formatDateTime(record.createdAt),
            'รหัสนักเรียน': record.student.citizenId,
            'ชื่อ': record.student.firstName,
            'นามสกุล': record.student.lastName,
            'ชื่อ-นามสกุล': `${record.student.firstName} ${record.student.lastName}`,
            'ห้องเรียน': record.student.classroom.name,
            'ประเภท': record.category?.type === 'ADD' ? 'เพิ่มคะแนน' : 'หักคะแนน',
            'คะแนน': record.category?.type === 'ADD' ? record.points : -Math.abs(record.points),
            'คะแนนจริงในระบบ': record.points,
            'หมวดหมู่': record.category?.name || 'บันทึกพิเศษ',
            'หมายเหตุ': record.note || '',
            'ผู้บันทึก': `${record.recorder.firstName} ${record.recorder.lastName}`
        }));

        const summaryRows = [
            ['รายงานคะแนนพฤติกรรม'],
            ['วันที่ส่งออก', formatDateTime(new Date().toISOString())],
            ['ภาคเรียน', selectedTerm ? `ภาคเรียน ${selectedTerm.term}/${selectedTerm.year}` : 'ทุกปีการศึกษา'],
            ['ห้องเรียน', selectedClassroom?.name ?? 'ทุกห้องเรียน'],
            ['วันที่กรอง', filterDate || 'ทุกวันที่'],
            ['นักเรียนที่เลือก', selectedStudent ? `${selectedStudent.firstName} ${selectedStudent.lastName} (${selectedStudent.citizenId})` : 'ทุกคน'],
            ['คำค้นหา', searchQuery || '-'],
            ['จำนวนรายการ', filteredRecords.length],
            ['รวมคะแนนเพิ่ม', totalAdd],
            ['รวมคะแนนหัก', totalDeduct],
            ['สุทธิ', totalAdd - totalDeduct]
        ];

        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet(exportRows);
        const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);

        worksheet['!cols'] = [
            { wch: 8 },
            { wch: 22 },
            { wch: 18 },
            { wch: 18 },
            { wch: 18 },
            { wch: 28 },
            { wch: 14 },
            { wch: 14 },
            { wch: 12 },
            { wch: 16 },
            { wch: 30 },
            { wch: 40 },
            { wch: 24 }
        ];
        summarySheet['!cols'] = [{ wch: 24 }, { wch: 42 }];

        const sheetName = safeSheetName(selectedClassroom?.name ?? 'Behavior Records');
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
        XLSX.utils.book_append_sheet(workbook, summarySheet, 'สรุปเงื่อนไข');

        const fileDate = new Date().toISOString().slice(0, 10);
        XLSX.writeFile(workbook, `รายงานคะแนนพฤติกรรม_${fileDate}.xlsx`);
        toast.success('ส่งออกไฟล์ Excel สำเร็จ');
    };

    const totalPages = Math.ceil(filteredRecords.length / ITEMS_PER_PAGE);
    const paginatedData = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredRecords.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredRecords, currentPage]);

    return (
        <div className="p-6 space-y-6 max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <GraduationCap className="text-primary" /> จัดการคะแนนพฤติกรรม
                    </h1>
                    <p className="text-gray-500 text-sm">ตรวจสอบ แก้ไข และนำเข้าข้อมูลคะแนนนักเรียน</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                    <button onClick={handleDownloadTemplate} className="flex items-center justify-center gap-2 border border-primary/20 bg-white hover:bg-primary/5 text-primary px-5 py-2.5 rounded-lg font-bold transition-colors">
                        <Download size={20} /> ไฟล์ตัวอย่าง
                    </button>
                    <button onClick={handleExportExcel} className="flex items-center justify-center gap-2 border border-secondary/50 bg-secondary/25 hover:bg-secondary/40 text-[#6b5400] px-5 py-2.5 rounded-lg font-bold transition-colors">
                        <FileDown size={20} /> ส่งออก Excel
                    </button>
                    <button onClick={handleImportExcel} className="flex items-center justify-center gap-2 bg-primary hover:bg-[#0f6b32] text-white px-5 py-2.5 rounded-lg font-bold shadow-md transition-all active:scale-95">
                        <Upload size={20} /> นำเข้าจาก Excel
                    </button>
                </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_390px]">
                <div className="rounded-2xl border border-primary/10 bg-white p-5 shadow-sm">
                    <div className="flex items-start gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                            <FileSpreadsheet size={24} />
                        </div>
                        <div>
                            <h2 className="font-black text-gray-900">นำเข้าคะแนนพฤติกรรมด้วย Excel</h2>
                            <p className="mt-1 text-sm leading-6 text-gray-500">
                                ดาวน์โหลดไฟล์ตัวอย่างเพื่อดูรูปแบบคอลัมน์และรายการ categoryId ที่ใช้ได้
                                ระบบจะอ้างอิงรหัสนักเรียนและประเภทคะแนนจากข้อมูลจริงในระบบ
                            </p>
                            <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold">
                                <span className="rounded-full bg-primary/10 px-3 py-1 text-primary">citizenId</span>
                                <span className="rounded-full bg-secondary/40 px-3 py-1 text-[#6b5400]">points</span>
                                <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-500">note</span>
                                <span className="rounded-full bg-primary/10 px-3 py-1 text-primary">categoryId</span>
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
                            ใช้ไฟล์ .xlsx หรือ .xls เท่านั้น
                        </li>
                        <li className="flex gap-2">
                            <CheckCircle2 className="mt-0.5 shrink-0 text-primary" size={16} />
                            categoryId ดูจากชีต category_reference
                        </li>
                        <li className="flex gap-2">
                            <CheckCircle2 className="mt-0.5 shrink-0 text-primary" size={16} />
                            ใส่ points เป็นตัวเลขบวก ระบบจะเพิ่ม/หักตามประเภทคะแนน
                        </li>
                    </ul>
                </div>
            </div>

            {/* Filters Panel */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 items-end">

                    {/* ปีการศึกษา */}
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-400 ml-1 uppercase flex items-center gap-1">
                            <BookOpen size={14} /> ปีการศึกษา
                        </label>
                            <select
                                className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 outline-none bg-white font-medium"
                                value={selectedTermId}
                                onChange={(e) => {
                                    setSelectedTermId(e.target.value);
                                    setFilterClassroomId(''); // ✅ ล้างค่าห้องเรียนทันทีที่เปลี่ยนเทอม
                                    setSelectedStudent(null);  // ✅ ล้างค่านักเรียนที่เลือกไว้ (เพราะเด็กอาจจะอยู่คนละห้องในเทอมใหม่)
                                    setCurrentPage(1);         // ✅ กลับไปหน้าแรก
                                }}
                            >
                                <option value="">ทุกปีการศึกษา</option>
                                {terms.map(t => (
                                    <option key={t.id} value={t.id}>ภาคเรียน {t.term}/{t.year} {t.isActive ? '(ปัจจุบัน)' : ''}</option>
                                ))}
                            </select>
                    </div>

                    {/* ชั้นเรียน */}
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-400 ml-1 uppercase">ชั้นเรียน</label>
                        <select
                            disabled={!selectedTermId}
                            className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 outline-none bg-white disabled:bg-gray-50 disabled:text-gray-400"
                            value={filterClassroomId} onChange={(e) => setFilterClassroomId(e.target.value)}
                        >
                            <option value="">ทุกห้องเรียน</option>
                            {availableClassrooms.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>

                    {/* วันที่ */}
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-400 ml-1 uppercase flex items-center gap-1">
                            <Calendar size={14} /> วันที่
                        </label>
                        <input
                            type="date" className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 outline-none"
                            value={filterDate} onChange={(e) => setFilterDate(e.target.value)}
                        />
                    </div>

                    {/* ค้นหานักเรียน */}
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-400 ml-1 uppercase">ค้นหานักเรียน</label>
                        <Combobox value={selectedStudent} onChange={setSelectedStudent}>
                            <div className="relative">
                                <div className="relative w-full cursor-default overflow-hidden rounded-xl border border-gray-200 bg-white text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20">
                                    <Combobox.Input
                                        className="w-full border-none py-2 pl-3 pr-10 text-sm leading-5 text-gray-900 focus:ring-0 outline-none"
                                        displayValue={(student: Student) => student ? `${student.firstName} ${student.lastName}` : ''}
                                        onChange={(event) => setStudentQuery(event.target.value)}
                                        placeholder="พิมพ์ชื่อเพื่อค้นหา..."
                                    />
                                    <Combobox.Button className="absolute inset-y-0 right-0 flex items-center pr-2">
                                        <ChevronsUpDown className="h-5 w-5 text-gray-400" aria-hidden="true" />
                                    </Combobox.Button>
                                    {selectedStudent && (
                                        <button onClick={() => setSelectedStudent(null)} className="absolute inset-y-0 right-7 flex items-center">
                                            <X className="h-4 w-4 text-gray-400 hover:text-red-500" />
                                        </button>
                                    )}
                                </div>
                                <Combobox.Options className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                                    {filteredStudents.length === 0 && studentQuery !== '' ? (
                                        <div className="relative cursor-default select-none py-2 px-4 text-gray-700">ไม่พบข้อมูล</div>
                                    ) : (
                                        filteredStudents.map((student) => (
                                            <Combobox.Option
                                                key={student.id}
                                                className={({ active }) => `relative cursor-default select-none py-2 pl-10 pr-4 ${active ? 'bg-primary text-white' : 'text-gray-900'}`}
                                                value={student}
                                            >
                                                {({ selected, active }) => (
                                                    <>
                                                        <span className={`block truncate ${selected ? 'font-medium' : 'font-normal'}`}>
                                                            {student.firstName} {student.lastName} ({student.citizenId})
                                                        </span>
                                                        {selected && (
                                                            <span className={`absolute inset-y-0 left-0 flex items-center pl-3 ${active ? 'text-white' : 'text-primary'}`}>
                                                                <Check className="h-5 w-5" aria-hidden="true" />
                                                            </span>
                                                        )}
                                                    </>
                                                )}
                                            </Combobox.Option>
                                        ))
                                    )}
                                </Combobox.Options>
                            </div>
                        </Combobox>
                    </div>

                    {/* ค้นหาในตาราง */}
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-400 ml-1 uppercase">ค้นหาด่วน</label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                            <input
                                type="text" placeholder="พิมพ์เพื่อค้นหา..."
                                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 outline-none"
                                value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Table Section */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left whitespace-nowrap">
                        <thead className="bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-widest">
                            <tr>
                                <th className="p-4">วัน/เวลา</th>
                                <th className="p-4">นักเรียน</th>
                                <th className="p-4">ห้อง</th>
                                <th className="p-4 text-center">คะแนน</th>
                                <th className="p-4">เหตุผล/หมวดหมู่</th>
                                <th className="p-4">ผู้บันทึก</th>
                                <th className="p-4 text-center">จัดการ</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-sm">
                            {loading ? (
                                <tr><td colSpan={7} className="p-10 text-center text-gray-400 italic">กำลังโหลดประวัติ...</td></tr>
                            ) : paginatedData.length === 0 ? (
                                <tr><td colSpan={7} className="p-10 text-center text-gray-400 italic">ไม่พบข้อมูลประวัติคะแนน</td></tr>
                            ) : (
                                paginatedData.map((record) => (
                                    <tr key={record.id} className="hover:bg-gray-50/50 transition-colors">
                                        <td className="p-4 text-gray-500">
                                            {new Date(record.createdAt).toLocaleDateString('th-TH')} <br />
                                            <span className="text-xs">{new Date(record.createdAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.</span>
                                        </td>
                                        <td className="p-4">
                                            <div className="font-bold text-gray-800">{record.student.firstName} {record.student.lastName}</div>
                                            <div className="text-xs text-gray-400">{record.student.citizenId}</div>
                                        </td>
                                        <td className="p-4 text-gray-600">{record.student.classroom.name}</td>
                                        <td className="p-4 text-center font-bold">
                                            <span className={record.category?.type === 'ADD' ? 'text-green-600' : 'text-red-600'}>
                                              {record.category?.type === 'ADD' ? '+' : '-'}{record.points}
                                            </span>
                                        </td>
                                        <td className="p-4">
                                            <div className="font-medium text-gray-700">{record.category?.name || 'บันทึกพิเศษ'}</div>
                                            <div className="text-xs text-gray-400 truncate max-w-[150px]">{record.note || '-'}</div>
                                        </td>
                                        <td className="p-4 text-gray-500 italic">ครู{record.recorder.firstName}</td>
                                        <td className="p-4 text-center">
                                            <button onClick={() => handleDeleteRecord(record.id)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={18} /></button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {filteredRecords.length > 0 && (
                    <div className="p-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
                        <p className="text-sm text-gray-500">ทั้งหมด {filteredRecords.length} รายการ</p>
                        <div className="flex items-center gap-2">
                            <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="p-1.5 border border-gray-300 rounded hover:bg-white disabled:opacity-30 transition-all"><ChevronLeft size={20} /></button>
                            <span className="text-sm font-bold text-primary bg-primary/10 px-3 py-1 rounded-lg">หน้า {currentPage} / {totalPages}</span>
                            <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="p-1.5 border border-gray-300 rounded hover:bg-white disabled:opacity-30 transition-all"><ChevronRight size={20} /></button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
