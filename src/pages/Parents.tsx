import { useState, useEffect, useMemo, Fragment } from 'react';
import {
    Search, UserPlus, Trash2, ChevronLeft, ChevronRight,
    Users, Check, ChevronsUpDown, UserCog, PlusCircle
} from 'lucide-react';
import { Combobox, Dialog, Transition } from '@headlessui/react';
import toast from 'react-hot-toast';
import Swal from 'sweetalert2';
import api from '../services/api';

// --- Types ---
interface Child {
    id: string;
    citizenId: string;
    firstName: string;
    lastName: string;
    classroom: { name: string };
}

interface Parent {
    id: string;
    citizenId: string;
    firstName: string;
    lastName: string;
    lineUserId: string | null;
    createdAt: string;
    children: Child[];
}

interface Student {
    id: string;
    firstName: string;
    lastName: string;
    citizenId: string;
}

const ITEMS_PER_PAGE = 10;

export default function AdminParentManagement() {
    const [parents, setParents] = useState<Parent[]>([]);
    const [students, setStudents] = useState<Student[]>([]);
    const [loading, setLoading] = useState(false);

    // Search & Pagination
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);

    // Modals State
    const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
    const [isAddChildModalOpen, setIsAddChildModalOpen] = useState(false);

    // Form State
    const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
    const [studentQuery, setStudentQuery] = useState('');
    const [activeParentId, setActiveParentId] = useState<string>(''); // สำหรับตอนกดเพิ่มบุตรหลาน

    const [registerForm, setRegisterForm] = useState({
        citizenId: '',
        firstName: '',
        lastName: '',
        password: '',
        lineUserId: ''
    });

    useEffect(() => {
        fetchParents();
        fetchStudents();
    }, []);

    const fetchParents = async () => {
        try {
            setLoading(true);
            const res = await api.get('/parents/all');
            setParents(res.data);
        } catch (error) {
            toast.error('โหลดข้อมูลผู้ปกครองไม่สำเร็จ');
        } finally {
            setLoading(false);
        }
    };

    const fetchStudents = async () => {
        try {
            const res = await api.get('/students');
            setStudents(res.data);
        } catch (error) {
            toast.error('โหลดรายชื่อนักเรียนไม่สำเร็จ');
        }
    };

    // --- Logic การกรองนักเรียนใน Combobox ---
    const filteredStudents = studentQuery === ''
        ? students
        : students.filter((s) =>
            `${s.firstName} ${s.lastName} ${s.citizenId}`.toLowerCase().includes(studentQuery.toLowerCase())
        );

    // --- Logic การค้นหาผู้ปกครองและแบ่งหน้า ---
    const filteredParents = useMemo(() => {
        return parents.filter(p =>
            `${p.firstName} ${p.lastName} ${p.citizenId}`.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [parents, searchQuery]);

    const totalPages = Math.ceil(filteredParents.length / ITEMS_PER_PAGE);
    const paginatedParents = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredParents.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredParents, currentPage]);

    // --- Actions ---
    const handleRegisterParent = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedStudent) return toast.error('กรุณาเลือกนักเรียนในความดูแล');

        const toastId = toast.loading('กำลังลงทะเบียน...');
        try {
            await api.post('/parents/register', {
                ...registerForm,
                studentCitizenId: selectedStudent.citizenId // ส่ง citizenId ตามที่ API ต้องการ
            });
            toast.success('ลงทะเบียนผู้ปกครองสำเร็จ', { id: toastId });
            setIsRegisterModalOpen(false);
            resetForms();
            fetchParents();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'เกิดข้อผิดพลาด', { id: toastId });
        }
    };

    const handleAddChild = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedStudent) return toast.error('กรุณาเลือกนักเรียน');

        const toastId = toast.loading('กำลังเพิ่มนักเรียน...');
        try {
            // หมายเหตุ: ส่ง parentId ไปด้วยเพื่อให้ Admin ผูกเด็กเข้ากับผู้ปกครองที่ระบุ
            await api.patch('/parents/add-child', {
                parentId: activeParentId,
                studentCitizenId: selectedStudent.citizenId
            });
            toast.success('เพิ่มบุตรหลานสำเร็จ', { id: toastId });
            setIsAddChildModalOpen(false);
            resetForms();
            fetchParents();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'เกิดข้อผิดพลาด', { id: toastId });
        }
    };

    const handleDeleteParent = (id: string) => {
        Swal.fire({
            title: 'ยืนยันการลบผู้ปกครอง?',
            text: "บัญชีนี้จะถูกลบและนักเรียนในดูแลจะถูกยกเลิกการผูกมัด",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            confirmButtonText: 'ลบข้อมูล'
        }).then(async (result) => {
            if (result.isConfirmed) {
                try {
                    await api.delete(`/parents/${id}`);
                    toast.success('ลบรายการสำเร็จ');
                    fetchParents();
                } catch (error) {
                    toast.error('ไม่สามารถลบข้อมูลได้');
                }
            }
        });
    };

    const resetForms = () => {
        setRegisterForm({ citizenId: '', firstName: '', lastName: '', password: '', lineUserId: '' });
        setSelectedStudent(null);
        setStudentQuery('');
        setActiveParentId('');
    };

    return (
        <div className="p-6 space-y-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <Users className="text-primary" /> จัดการข้อมูลผู้ปกครอง
                    </h1>
                    <p className="text-gray-500 text-sm">ดูรายชื่อผู้ปกครอง เพิ่มนักเรียนในความดูแล และลบบัญชี</p>
                </div>
                <button
                    onClick={() => { resetForms(); setIsRegisterModalOpen(true); }}
                    className="flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white px-5 py-2.5 rounded-lg font-bold shadow-md transition-all active:scale-95"
                >
                    <UserPlus size={20} /> ลงทะเบียนผู้ปกครอง
                </button>
            </div>

            {/* Filter / Search */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
                <div className="relative w-full md:w-1/3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                        type="text"
                        placeholder="ค้นหาชื่อ, นามสกุล หรือรหัสประชาชน..."
                        className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 outline-none"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left whitespace-nowrap">
                        <thead className="bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-widest">
                            <tr>
                                <th className="p-4">รหัสประชาชน</th>
                                <th className="p-4">ชื่อ-นามสกุล</th>
                                <th className="p-4">นักเรียนในความดูแล</th>
                                <th className="p-4 text-center">จัดการ</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-sm">
                            {loading ? (
                                <tr><td colSpan={4} className="p-10 text-center text-gray-400 italic">กำลังโหลดข้อมูล...</td></tr>
                            ) : paginatedParents.length === 0 ? (
                                <tr><td colSpan={4} className="p-10 text-center text-gray-400 italic">ไม่พบข้อมูลผู้ปกครอง</td></tr>
                            ) : (
                                paginatedParents.map((parent) => (
                                    <tr key={parent.id} className="hover:bg-gray-50/50 transition-colors">
                                        <td className="p-4 font-mono text-gray-600">{parent.citizenId}</td>
                                        <td className="p-4">
                                            <div className="font-bold text-gray-800">{parent.firstName} {parent.lastName}</div>
                                            {parent.lineUserId && <div className="text-xs text-green-600 font-medium">ผูก LINE แล้ว</div>}
                                        </td>
                                        <td className="p-4">
                                            <div className="flex flex-col gap-1">
                                                {parent.children.length > 0 ? parent.children.map(child => (
                                                    <span key={child.id} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-blue-50 text-blue-700 text-xs font-medium w-fit border border-blue-100">
                                                        {child.firstName} {child.lastName} <span className="text-blue-400 opacity-70">|</span> {child.classroom?.name || 'ไม่มีห้อง'}
                                                    </span>
                                                )) : <span className="text-xs text-gray-400 italic">ไม่มีข้อมูลนักเรียน</span>}
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center justify-center gap-2">
                                                <button
                                                    onClick={() => {
                                                        resetForms();
                                                        setActiveParentId(parent.id);
                                                        setIsAddChildModalOpen(true);
                                                    }}
                                                    className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold"
                                                    title="เพิ่มบุตรหลาน"
                                                >
                                                    <PlusCircle size={16} /> เพิ่มเด็ก
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteParent(parent.id)}
                                                    className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                    title="ลบบัญชี"
                                                >
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

                {/* Pagination */}
                {filteredParents.length > 0 && (
                    <div className="p-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
                        <p className="text-sm text-gray-500">แสดง {paginatedParents.length} จาก {filteredParents.length} รายการ</p>
                        <div className="flex items-center gap-2">
                            <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="p-1.5 border border-gray-300 rounded hover:bg-white disabled:opacity-30 transition-all"><ChevronLeft size={20} /></button>
                            <span className="text-sm font-bold text-primary bg-primary/10 px-3 py-1 rounded-lg">หน้า {currentPage} / {totalPages}</span>
                            <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="p-1.5 border border-gray-300 rounded hover:bg-white disabled:opacity-30 transition-all"><ChevronRight size={20} /></button>
                        </div>
                    </div>
                )}
            </div>

            {/* --- Modal: เพิ่มผู้ปกครองใหม่ --- */}
            <Transition appear show={isRegisterModalOpen} as={Fragment}>
                <Dialog as="div" className="relative z-50" onClose={() => setIsRegisterModalOpen(false)}>
                    <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-200" leaveFrom="opacity-100" leaveTo="opacity-0">
                        <div className="fixed inset-0 bg-black bg-opacity-25 backdrop-blur-sm" />
                    </Transition.Child>
                    <div className="fixed inset-0 overflow-y-auto">
                        <div className="flex min-h-full items-center justify-center p-4 text-center">
                            <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="ease-in duration-200" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
                                <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                                    <Dialog.Title as="h3" className="text-lg font-bold leading-6 text-gray-900 flex items-center gap-2 mb-4">
                                        <UserPlus size={20} className="text-primary" /> ลงทะเบียนผู้ปกครองใหม่
                                    </Dialog.Title>
                                    <form onSubmit={handleRegisterParent} className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">รหัสประชาชน (13 หลัก)</label>
                                            <input required type="text" maxLength={13} value={registerForm.citizenId} onChange={e => setRegisterForm({ ...registerForm, citizenId: e.target.value })} className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-primary/50" />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อ</label>
                                                <input required type="text" value={registerForm.firstName} onChange={e => setRegisterForm({ ...registerForm, firstName: e.target.value })} className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-primary/50" />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">นามสกุล</label>
                                                <input required type="text" value={registerForm.lastName} onChange={e => setRegisterForm({ ...registerForm, lastName: e.target.value })} className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-primary/50" />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">รหัสผ่านสำหรับ Login</label>
                                            <input required type="password" value={registerForm.password} onChange={e => setRegisterForm({ ...registerForm, password: e.target.value })} className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-primary/50" />
                                        </div>

                                        {/* Searchable Student Dropdown */}
                                        <div className="relative z-10">
                                            <label className="block text-sm font-medium text-gray-700 mb-1">นักเรียนในความดูแล (คนแรก)</label>
                                            <Combobox value={selectedStudent} onChange={setSelectedStudent}>
                                                <div className="relative w-full cursor-default overflow-hidden rounded-lg border border-gray-300 bg-white text-left focus-within:ring-2 focus-within:ring-primary/50">
                                                    <Combobox.Input
                                                        required
                                                        className="w-full border-none py-2 pl-3 pr-10 text-sm leading-5 text-gray-900 focus:ring-0 outline-none"
                                                        displayValue={(student: Student) => student ? `${student.firstName} ${student.lastName}` : ''}
                                                        onChange={(event) => setStudentQuery(event.target.value)}
                                                        placeholder="พิมพ์ชื่อเพื่อค้นหา..."
                                                    />
                                                    <Combobox.Button className="absolute inset-y-0 right-0 flex items-center pr-2">
                                                        <ChevronsUpDown className="h-4 w-4 text-gray-400" aria-hidden="true" />
                                                    </Combobox.Button>
                                                </div>
                                                <Transition as={Fragment} leave="transition ease-in duration-100" leaveFrom="opacity-100" leaveTo="opacity-0" afterLeave={() => setStudentQuery('')}>
                                                    <Combobox.Options className="absolute mt-1 max-h-40 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                                                        {filteredStudents.length === 0 ? (
                                                            <div className="relative cursor-default select-none py-2 px-4 text-gray-700">ไม่พบข้อมูลนักเรียน</div>
                                                        ) : (
                                                            filteredStudents.map((student) => (
                                                                <Combobox.Option key={student.id} className={({ active }) => `relative cursor-default select-none py-2 pl-10 pr-4 ${active ? 'bg-primary text-white' : 'text-gray-900'}`} value={student}>
                                                                    {({ selected, active }) => (
                                                                        <>
                                                                            <span className={`block truncate ${selected ? 'font-medium' : 'font-normal'}`}>{student.firstName} {student.lastName} ({student.citizenId})</span>
                                                                            {selected ? <span className={`absolute inset-y-0 left-0 flex items-center pl-3 ${active ? 'text-white' : 'text-primary'}`}><Check className="h-4 w-4" /></span> : null}
                                                                        </>
                                                                    )}
                                                                </Combobox.Option>
                                                            ))
                                                        )}
                                                    </Combobox.Options>
                                                </Transition>
                                            </Combobox>
                                        </div>

                                        <div className="mt-6 flex justify-end gap-2">
                                            <button type="button" onClick={() => setIsRegisterModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">ยกเลิก</button>
                                            <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary-dark">บันทึกข้อมูล</button>
                                        </div>
                                    </form>
                                </Dialog.Panel>
                            </Transition.Child>
                        </div>
                    </div>
                </Dialog>
            </Transition>

            {/* --- Modal: เพิ่มนักเรียนในความดูแล --- */}
            <Transition appear show={isAddChildModalOpen} as={Fragment}>
                <Dialog as="div" className="relative z-50" onClose={() => setIsAddChildModalOpen(false)}>
                    <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-200" leaveFrom="opacity-100" leaveTo="opacity-0">
                        <div className="fixed inset-0 bg-black bg-opacity-25 backdrop-blur-sm" />
                    </Transition.Child>
                    <div className="fixed inset-0 overflow-y-auto">
                        <div className="flex min-h-full items-center justify-center p-4 text-center">
                            <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="ease-in duration-200" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
                                <Dialog.Panel className="w-full max-w-md transform overflow-visible rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                                    <Dialog.Title as="h3" className="text-lg font-bold leading-6 text-gray-900 flex items-center gap-2 mb-4">
                                        <UserCog size={20} className="text-primary" /> เพิ่มนักเรียนในความดูแล
                                    </Dialog.Title>
                                    <form onSubmit={handleAddChild} className="space-y-4">

                                        <div className="relative">
                                            <label className="block text-sm font-medium text-gray-700 mb-1">ค้นหานักเรียน</label>
                                            <Combobox value={selectedStudent} onChange={setSelectedStudent}>
                                                <div className="relative w-full cursor-default overflow-hidden rounded-lg border border-gray-300 bg-white text-left focus-within:ring-2 focus-within:ring-primary/50">
                                                    <Combobox.Input
                                                        required
                                                        className="w-full border-none py-2 pl-3 pr-10 text-sm leading-5 text-gray-900 focus:ring-0 outline-none"
                                                        displayValue={(student: Student) => student ? `${student.firstName} ${student.lastName}` : ''}
                                                        onChange={(event) => setStudentQuery(event.target.value)}
                                                        placeholder="พิมพ์ชื่อหรือรหัสเพื่อค้นหา..."
                                                    />
                                                    <Combobox.Button className="absolute inset-y-0 right-0 flex items-center pr-2">
                                                        <ChevronsUpDown className="h-4 w-4 text-gray-400" aria-hidden="true" />
                                                    </Combobox.Button>
                                                </div>
                                                <Transition as={Fragment} leave="transition ease-in duration-100" leaveFrom="opacity-100" leaveTo="opacity-0" afterLeave={() => setStudentQuery('')}>
                                                    <Combobox.Options className="absolute mt-1 max-h-40 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                                                        {filteredStudents.length === 0 ? (
                                                            <div className="relative cursor-default select-none py-2 px-4 text-gray-700">ไม่พบข้อมูลนักเรียน</div>
                                                        ) : (
                                                            filteredStudents.map((student) => (
                                                                <Combobox.Option key={student.id} className={({ active }) => `relative cursor-default select-none py-2 pl-10 pr-4 ${active ? 'bg-primary text-white' : 'text-gray-900'}`} value={student}>
                                                                    {({ selected, active }) => (
                                                                        <>
                                                                            <span className={`block truncate ${selected ? 'font-medium' : 'font-normal'}`}>{student.firstName} {student.lastName} ({student.citizenId})</span>
                                                                            {selected ? <span className={`absolute inset-y-0 left-0 flex items-center pl-3 ${active ? 'text-white' : 'text-primary'}`}><Check className="h-4 w-4" /></span> : null}
                                                                        </>
                                                                    )}
                                                                </Combobox.Option>
                                                            ))
                                                        )}
                                                    </Combobox.Options>
                                                </Transition>
                                            </Combobox>
                                        </div>

                                        <div className="mt-6 flex justify-end gap-2">
                                            <button type="button" onClick={() => setIsAddChildModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">ยกเลิก</button>
                                            <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary-dark">ยืนยันการเพิ่ม</button>
                                        </div>
                                    </form>
                                </Dialog.Panel>
                            </Transition.Child>
                        </div>
                    </div>
                </Dialog>
            </Transition>
        </div>
    );
}
