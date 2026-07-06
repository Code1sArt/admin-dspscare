import { useState, useEffect, useMemo } from 'react';
import {
    Search, Plus, Upload, Edit, Trash2, X,
    ChevronLeft, ChevronRight, Filter, Download, FileSpreadsheet, Info, CheckCircle2
} from 'lucide-react';
import toast from 'react-hot-toast';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';
import api from '../services/api';

interface Teacher {
    id?: string;
    userId?: string;
    _id?: string;
    citizenId: string;
    firstName: string;
    lastName: string;
    role: 'ADMIN' | 'TEACHER' | 'AFFAIRS';
    lineUserId: string | null;
}

type StaffRole = Teacher['role'];

interface CurrentUser {
    id: string;
}

const ITEMS_PER_PAGE = 10; // กำหนดจำนวนแถวต่อหน้า

const getTeacherId = (teacher: Teacher) => teacher.id ?? teacher.userId ?? teacher._id ?? '';

const getErrorMessage = (error: any, fallback: string) =>
    error?.response?.data?.message || error?.message || fallback;

const shouldFallbackToUsersEndpoint = (error: any) =>
    [404, 405].includes(error?.response?.status);

const normalizeHeader = (value: string) => value.trim();

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
    if (Array.isArray(warnings)) return warnings;
    return [];
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

export default function Teachers() {
    const [teachers, setTeachers] = useState<Teacher[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentUserId, setCurrentUserId] = useState('');

    // --- State สำหรับค้นหาและกรอง ---
    const [searchQuery, setSearchQuery] = useState('');
    const [filterRole, setFilterRole] = useState('ALL');
    const [currentPage, setCurrentPage] = useState(1);

    // --- State สำหรับ Modal ---
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState<'CREATE' | 'EDIT'>('CREATE');
    const [editId, setEditId] = useState<string | null>(null);
    const [formData, setFormData] = useState({ citizenId: '', firstName: '', lastName: '', role: 'TEACHER' });

    const fetchCurrentUser = async () => {
        try {
            const response = await api.get<CurrentUser>('/users/me');
            setCurrentUserId(response.data.id);
        } catch {
            // Backend ยังคงตรวจสอบสิทธิ์ซ้ำ แม้โหลดข้อมูลผู้ใช้ปัจจุบันไม่สำเร็จ
            setCurrentUserId('');
        }
    };

    const fetchTeachers = async () => {
        try {
            setLoading(true);
            const response = await api.get('/teachers/staff');
            setTeachers(response.data);
            return response.data as Teacher[];
        } catch {
            toast.error('ไม่สามารถโหลดข้อมูลบุคลากรได้');
            return [];
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void fetchTeachers();
        void fetchCurrentUser();
    }, []);

    // --- Logic การค้นหาและแบ่งหน้า (Client-side Pagination) ---
    const filteredData = useMemo(() => {
        return teachers.filter((t) => {
            const matchSearch = `${t.firstName} ${t.lastName} ${t.citizenId}`
                .toLowerCase()
                .includes(searchQuery.toLowerCase());
            const matchRole = filterRole === 'ALL' || t.role === filterRole;
            return matchSearch && matchRole;
        });
    }, [teachers, searchQuery, filterRole]);

    const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE);
    const paginatedData = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredData.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredData, currentPage]);

    // เปลี่ยนหน้าให้กลับไปหน้า 1 เสมอเมื่อมีการค้นหา
    useEffect(() => { setCurrentPage(1); }, [searchQuery, filterRole]);

    // --- ฟังก์ชันการจัดการข้อมูล ---
    const handleOpenCreate = () => {
        setModalMode('CREATE');
        setFormData({ citizenId: '', firstName: '', lastName: '', role: 'TEACHER' });
        setIsModalOpen(true);
    };

    const handleOpenEdit = (t: Teacher) => {
        const id = getTeacherId(t);
        if (!id) {
            toast.error('ไม่พบรหัสอ้างอิงของบุคลากร ไม่สามารถแก้ไขได้');
            return;
        }

        setModalMode('EDIT');
        setEditId(id);
        setFormData({ citizenId: t.citizenId, firstName: t.firstName, lastName: t.lastName, role: t.role });
        setIsModalOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const toastId = toast.loading('กำลังบันทึก...');
        try {
            if (modalMode === 'CREATE') {
                await api.post('/teachers/staff', formData);
                toast.success('เพิ่มบุคลากรสำเร็จ', { id: toastId });
            } else {
                if (!editId) {
                    toast.error('ไม่พบรหัสอ้างอิงของบุคลากร', { id: toastId });
                    return;
                }

                const updatePayload = editId === currentUserId
                    ? {
                        citizenId: formData.citizenId,
                        firstName: formData.firstName,
                        lastName: formData.lastName
                    }
                    : formData;

                try {
                    await api.patch(`/teachers/staff/${editId}`, updatePayload);
                } catch (error: any) {
                    if (!shouldFallbackToUsersEndpoint(error)) throw error;
                    await api.patch(`/users/${editId}`, updatePayload);
                }
                toast.success('แก้ไขข้อมูลสำเร็จ', { id: toastId });
            }
            setIsModalOpen(false);
            fetchTeachers();
        } catch (error: any) {
            toast.error(getErrorMessage(error, 'เกิดข้อผิดพลาด'), { id: toastId });
        }
    };

    const handleDelete = (teacher: Teacher) => {
        const id = getTeacherId(teacher);
        const name = `${teacher.firstName} ${teacher.lastName}`.trim();

        if (!id) {
            toast.error('ไม่พบรหัสอ้างอิงของบุคลากร ไม่สามารถลบได้');
            return;
        }

        Swal.fire({
            title: 'ยืนยันการลบ?',
            text: `คุณต้องการลบสิทธิ์ของ ${name} ใช่หรือไม่?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            confirmButtonText: 'ใช่, ลบเลย',
            cancelButtonText: 'ยกเลิก'
        }).then(async (result) => {
            if (result.isConfirmed) {
                try {
                    try {
                        await api.delete(`/teachers/staff/${id}`);
                    } catch (error: any) {
                        if (!shouldFallbackToUsersEndpoint(error)) throw error;
                        await api.delete(`/users/${id}`);
                    }
                    toast.success('ลบข้อมูลสำเร็จ');
                    fetchTeachers();
                } catch (error: any) {
                    toast.error(getErrorMessage(error, 'ลบไม่สำเร็จ'));
                }
            }
        });
    };

    const handleExcelUpload = async () => {
        const { value: file } = await Swal.fire({
            title: 'นำเข้าบุคลากรผ่าน Excel',
            html: `
                <div style="text-align:left; font-size:14px; line-height:1.7">
                    <p style="margin-bottom:8px">กรุณาใช้ไฟล์ .xlsx หรือ .xls และกำหนดหัวตารางแถวแรกตามนี้</p>
                    <code style="display:block; padding:10px; border-radius:10px; background:#f3f4f6; color:#1f2937">
                        citizenId, firstName, lastName, role
                    </code>
                    <p style="margin-top:8px; color:#6b7280">
                        role ใช้ได้เฉพาะ <b>TEACHER</b>, <b>AFFAIRS</b>, <b>ADMIN</b>
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
            try {
                const validation = await validateExcelFile(file as File, ['citizenId', 'firstName', 'lastName', 'role']);
                if (!validation.valid) {
                    toast.error(validation.message, { id: toastId });
                    return;
                }

                const beforeCount = teachers.length;
                const uploadData = new FormData();
                uploadData.append('file', file);
                const response = await api.post('/teachers/staff/upload-excel', uploadData);
                const latestTeachers = await fetchTeachers();
                const importedCount = extractImportCount(response.data);
                const addedCount = Math.max(latestTeachers.length - beforeCount, 0);
                const warnings = getImportWarnings(response.data);

                if ((importedCount === 0 || importedCount === null) && addedCount === 0) {
                    toast.error('อัปโหลดไฟล์แล้ว แต่ไม่พบข้อมูลที่ถูกเพิ่ม กรุณาตรวจสอบคอลัมน์และข้อมูลในไฟล์', { id: toastId });
                    return;
                }

                toast.success(
                    `นำเข้าสำเร็จ ${importedCount ?? addedCount} รายการ${warnings.length ? ` (${warnings.length} รายการถูกข้าม)` : ''}`,
                    { id: toastId }
                );
            } catch (error: any) {
                toast.error(getErrorMessage(error, 'ไฟล์ไม่ถูกต้องหรือระบบขัดข้อง'), { id: toastId });
            }
        }
    };

    const handleDownloadTemplate = () => {
        const exampleRows = [
            {
                citizenId: '1101700000001',
                firstName: 'สมชาย',
                lastName: 'ใจดี',
                role: 'TEACHER'
            },
            {
                citizenId: '1101700000002',
                firstName: 'สมหญิง',
                lastName: 'รักเรียน',
                role: 'AFFAIRS'
            },
            {
                citizenId: '1101700000003',
                firstName: 'ผู้ดูแล',
                lastName: 'ระบบ',
                role: 'ADMIN'
            }
        ];

        const instructionRows = [
            ['คำแนะนำการกรอกไฟล์นำเข้าบุคลากร'],
            ['1. ใช้ชีตชื่อ staff_template หรือชีตแรกของไฟล์สำหรับข้อมูลนำเข้า'],
            ['2. ห้ามเปลี่ยนชื่อหัวคอลัมน์: citizenId, firstName, lastName, role'],
            ['3. citizenId คือรหัสบัตรประชาชน/Username ควรเก็บเป็นข้อความเพื่อไม่ให้เลข 0 ด้านหน้าหาย'],
            ['4. role ใช้ได้เฉพาะ TEACHER, AFFAIRS, ADMIN'],
            ['5. ลบแถวตัวอย่างออกก่อนนำเข้าข้อมูลจริง หากไม่ต้องการนำเข้าข้อมูลตัวอย่าง']
        ];

        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet(exampleRows);
        const instructionSheet = XLSX.utils.aoa_to_sheet(instructionRows);

        worksheet['!cols'] = [
            { wch: 18 },
            { wch: 18 },
            { wch: 18 },
            { wch: 14 }
        ];
        instructionSheet['!cols'] = [{ wch: 90 }];

        XLSX.utils.book_append_sheet(workbook, worksheet, 'staff_template');
        XLSX.utils.book_append_sheet(workbook, instructionSheet, 'คำแนะนำ');
        XLSX.writeFile(workbook, 'ตัวอย่างนำเข้าบุคลากร_DSPS_CARE.xlsx');
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">จัดการบุคลากร</h1>
                    <p className="text-gray-500">จัดการสิทธิ์การใช้งานสำหรับ ครู ฝ่ายกิจการ และผู้ดูแลระบบ</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                    <button onClick={handleDownloadTemplate} className="flex items-center justify-center gap-2 border border-primary/20 bg-white hover:bg-primary/5 text-primary px-4 py-2 rounded-lg font-bold transition-colors">
                        <Download size={18} /> ไฟล์ตัวอย่าง
                    </button>
                    <button onClick={handleExcelUpload} className="flex items-center justify-center gap-2 bg-primary hover:bg-[#0f6b32] text-white px-4 py-2 rounded-lg font-bold transition-colors">
                        <Upload size={18} /> นำเข้า Excel
                    </button>
                    <button onClick={handleOpenCreate} className="flex items-center justify-center gap-2 bg-secondary hover:bg-yellow-300 text-[#063d1f] px-4 py-2 rounded-lg font-bold transition-colors">
                        <Plus size={18} /> เพิ่มบุคลากร
                    </button>
                </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="rounded-2xl border border-primary/10 bg-white p-5 shadow-sm">
                    <div className="flex items-start gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                            <FileSpreadsheet size={24} />
                        </div>
                        <div>
                            <h2 className="font-black text-gray-900">นำเข้าบุคลากรด้วย Excel</h2>
                            <p className="mt-1 text-sm leading-6 text-gray-500">
                                ดาวน์โหลดไฟล์ตัวอย่างก่อนกรอกข้อมูล เพื่อให้ชื่อคอลัมน์ตรงกับระบบและลดปัญหาไฟล์นำเข้าไม่สำเร็จ
                            </p>
                            <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold">
                                <span className="rounded-full bg-primary/10 px-3 py-1 text-primary">citizenId</span>
                                <span className="rounded-full bg-primary/10 px-3 py-1 text-primary">firstName</span>
                                <span className="rounded-full bg-primary/10 px-3 py-1 text-primary">lastName</span>
                                <span className="rounded-full bg-secondary/40 px-3 py-1 text-[#6b5400]">role</span>
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
                            role ต้องเป็น TEACHER, AFFAIRS หรือ ADMIN
                        </li>
                        <li className="flex gap-2">
                            <CheckCircle2 className="mt-0.5 shrink-0 text-primary" size={16} />
                            ควรตั้ง citizenId เป็นข้อความ เพื่อกันเลข 0 ด้านหน้าหาย
                        </li>
                    </ul>
                </div>
            </div>

            {/* Filters & Search */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                    <input
                        type="text"
                        placeholder="ค้นหาชื่อ, นามสกุล หรือรหัสบัตร..."
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-primary outline-none"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-lg border border-gray-300">
                    <Filter size={18} className="text-gray-500" />
                    <select
                        value={filterRole}
                        onChange={(e) => setFilterRole(e.target.value)}
                        className="bg-transparent outline-none text-gray-700 text-sm font-medium"
                    >
                        <option value="ALL">ทุกระดับสิทธิ์</option>
                        <option value="TEACHER">ครู/ที่ปรึกษา</option>
                        <option value="AFFAIRS">ฝ่ายกิจการ</option>
                        <option value="ADMIN">ผู้ดูแลระบบ</option>
                    </select>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-gray-50 border-b border-gray-100 text-sm text-gray-600">
                        <tr>
                            <th className="p-4 font-medium">ชื่อ-นามสกุล</th>
                            <th className="p-4 font-medium">Username (ID)</th>
                            <th className="p-4 font-medium">ระดับสิทธิ์</th>
                            <th className="p-4 font-medium text-center">จัดการ</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {loading ? (
                            <tr><td colSpan={4} className="p-8 text-center text-gray-500">กำลังโหลดข้อมูล...</td></tr>
                        ) : paginatedData.length === 0 ? (
                            <tr><td colSpan={4} className="p-8 text-center text-gray-500">ไม่พบข้อมูลบุคลากร</td></tr>
                        ) : (
                            paginatedData.map((t) => (
                                <tr key={getTeacherId(t) || t.citizenId} className="hover:bg-gray-50 transition-colors">
                                    <td className="p-4 font-medium text-gray-800">
                                        {t.firstName} {t.lastName}
                                        {getTeacherId(t) === currentUserId && (
                                            <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                                                บัญชีของคุณ
                                            </span>
                                        )}
                                    </td>
                                    <td className="p-4 text-gray-600 font-mono text-sm">{t.citizenId}</td>
                                    <td className="p-4">
                                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${t.role === 'ADMIN' ? 'bg-red-100 text-red-700' :
                                                t.role === 'AFFAIRS' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                                            }`}>
                                            {t.role === 'ADMIN' ? 'ผู้ดูแลระบบ' : t.role === 'AFFAIRS' ? 'ฝ่ายกิจการ' : 'ครู/ที่ปรึกษา'}
                                        </span>
                                    </td>
                                    <td className="p-4">
                                        <div className="flex justify-center gap-2">
                                            <button onClick={() => handleOpenEdit(t)} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"><Edit size={18} /></button>
                                            <button onClick={() => handleDelete(t)} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 size={18} /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>

                {/* Pagination Controls */}
                <div className="p-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
                    <p className="text-sm text-gray-500">
                        แสดง {paginatedData.length} จาก {filteredData.length} รายการ
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            disabled={currentPage === 1}
                            onClick={() => setCurrentPage(prev => prev - 1)}
                            className="p-2 border border-gray-300 rounded-lg hover:bg-white disabled:opacity-50 transition-colors"
                        >
                            <ChevronLeft size={18} />
                        </button>
                        <span className="text-sm font-bold text-gray-700">หน้า {currentPage} / {totalPages || 1}</span>
                        <button
                            disabled={currentPage === totalPages || totalPages === 0}
                            onClick={() => setCurrentPage(prev => prev + 1)}
                            className="p-2 border border-gray-300 rounded-lg hover:bg-white disabled:opacity-50 transition-colors"
                        >
                            <ChevronRight size={18} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Individual Add/Edit Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-6 border-b flex justify-between items-center bg-gray-50/50">
                            <h3 className="text-xl font-bold text-gray-800">{modalMode === 'CREATE' ? 'เพิ่มบุคลากร' : 'แก้ไขข้อมูล'}</h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">รหัสบัตรประชาชน (Username)</label>
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
                                <label className="block text-sm font-bold text-gray-700 mb-1 text-red-600">ระดับสิทธิ์การใช้งาน</label>
                                <select
                                    value={formData.role}
                                    onChange={(e) => setFormData({ ...formData, role: e.target.value as StaffRole })}
                                    disabled={modalMode === 'EDIT' && editId === currentUserId}
                                    aria-describedby={modalMode === 'EDIT' && editId === currentUserId ? 'own-role-help' : undefined}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-primary bg-white disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
                                >
                                    <option value="TEACHER">TEACHER (ครูที่ปรึกษา)</option>
                                    <option value="AFFAIRS">AFFAIRS (ฝ่ายกิจการนักเรียน)</option>
                                    <option value="ADMIN">ADMIN (ผู้ดูแลระบบสูงสุด)</option>
                                </select>
                                {modalMode === 'EDIT' && editId === currentUserId && (
                                    <p id="own-role-help" className="mt-2 text-xs font-medium text-amber-700">
                                        ไม่สามารถเปลี่ยนระดับสิทธิ์ของบัญชีที่กำลังใช้งานได้
                                    </p>
                                )}
                            </div>
                            <div className="pt-4 flex gap-3">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg font-bold text-gray-700 transition-colors">ยกเลิก</button>
                                <button type="submit" className="flex-1 py-2 bg-primary hover:bg-blue-900 text-white rounded-lg font-bold transition-colors shadow-md">บันทึกข้อมูล</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
