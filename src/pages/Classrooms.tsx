import { useState, useEffect } from 'react';
import { Search, Plus, Edit, Trash2, X, Users, Award, Shield, AlertTriangle, BookOpen, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import Swal from 'sweetalert2';
import api from '../services/api';

// --- กำหนดโครงสร้าง Type ---
interface Term {
    id: number;
    term: number;
    year: number;
    isActive: boolean;
}

interface Teacher {
    id: string;
    firstName: string;
    lastName: string;
}

interface Classroom {
    id: number;
    name: string;
    startingPoints: number;
    failingThreshold: number;
    certificateThreshold: number;
    shieldThreshold: number;
    termId: number;
    term: Term;
    advisors: Teacher[];
    _count: { students: number };
}

const DEFAULT_FORM = {
    name: '',
    startingPoints: 100,
    failingThreshold: 60,
    certificateThreshold: 80,
    shieldThreshold: 90,
    advisorIds: [] as string[],
    termId: '' as number | '',
};

export default function Classrooms() {
    const [classrooms, setClassrooms] = useState<Classroom[]>([]);
    const [terms, setTerms] = useState<Term[]>([]);
    const [teachers, setTeachers] = useState<Teacher[]>([]);
    const [loading, setLoading] = useState(true);

    const [searchQuery, setSearchQuery] = useState('');
    const [filterTermId, setFilterTermId] = useState<string>('ALL');

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState<'CREATE' | 'EDIT'>('CREATE');
    const [editId, setEditId] = useState<number | null>(null);
    const [formData, setFormData] = useState(DEFAULT_FORM);

    // State ใหม่สำหรับช่องค้นหาครูที่ปรึกษาใน Modal
    const [teacherSearch, setTeacherSearch] = useState('');

    useEffect(() => {
        fetchInitialData();
    }, []);

    const fetchInitialData = async () => {
        setLoading(true);
        try {
            const [roomsRes, termsRes, teachersRes] = await Promise.all([
                api.get('/classrooms'),
                api.get('/terms'),
                api.get('/teachers/staff')
            ]);
            setClassrooms(roomsRes.data);
            setTerms(termsRes.data);
            setTeachers(teachersRes.data);
        } catch (error) {
            toast.error('โหลดข้อมูลไม่สำเร็จ');
        } finally {
            setLoading(false);
        }
    };

    const fetchClassrooms = async () => {
        try {
            const response = await api.get('/classrooms');
            setClassrooms(response.data);
        } catch (error) {
            toast.error('โหลดข้อมูลห้องเรียนไม่สำเร็จ');
        }
    };

    // --- จัดการฟอร์ม ---
    const handleOpenCreate = () => {
        setModalMode('CREATE');
        setEditId(null);
        setTeacherSearch(''); // ล้างช่องค้นหาครูทุกครั้งที่เปิด Modal
        setFormData({
            ...DEFAULT_FORM,
            termId: terms.find(t => t.isActive)?.id || ''
        });
        setIsModalOpen(true);
    };

    const handleOpenEdit = (room: Classroom) => {
        setModalMode('EDIT');
        setEditId(room.id);
        setTeacherSearch(''); // ล้างช่องค้นหาครูทุกครั้งที่เปิด Modal
        setFormData({
            name: room.name,
            startingPoints: room.startingPoints,
            failingThreshold: room.failingThreshold,
            certificateThreshold: room.certificateThreshold,
            shieldThreshold: room.shieldThreshold,
            termId: room.termId,
            advisorIds: room.advisors.map(a => a.id),
        });
        setIsModalOpen(true);
    };

    const toggleAdvisor = (teacherId: string) => {
        setFormData(prev => {
            const isSelected = prev.advisorIds.includes(teacherId);
            if (isSelected) {
                return { ...prev, advisorIds: prev.advisorIds.filter(id => id !== teacherId) };
            } else {
                return { ...prev, advisorIds: [...prev.advisorIds, teacherId] };
            }
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.termId) return toast.error('กรุณาเลือกภาคเรียน');

        const toastId = toast.loading('กำลังบันทึกข้อมูล...');
        try {
            const payload = {
                ...formData,
                termId: Number(formData.termId),
                startingPoints: Number(formData.startingPoints),
                failingThreshold: Number(formData.failingThreshold),
                certificateThreshold: Number(formData.certificateThreshold),
                shieldThreshold: Number(formData.shieldThreshold),
            };

            if (modalMode === 'CREATE') {
                await api.post('/classrooms', payload);
                toast.success('สร้างห้องเรียนสำเร็จ', { id: toastId });
            } else {
                await api.patch(`/classrooms/${editId}`, payload);
                toast.success('แก้ไขห้องเรียนสำเร็จ', { id: toastId });
            }

            setIsModalOpen(false);
            fetchClassrooms();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'เกิดข้อผิดพลาดในการบันทึก', { id: toastId });
        }
    };

    const handleDelete = (id: number, name: string) => {
        Swal.fire({
            title: 'ยืนยันการลบ?',
            text: `คุณต้องการลบห้องเรียน ${name} ใช่หรือไม่? ข้อมูลนักเรียนในห้องจะได้รับผลกระทบ`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#9ca3af',
            confirmButtonText: 'ใช่, ลบเลย!',
            cancelButtonText: 'ยกเลิก'
        }).then(async (result) => {
            if (result.isConfirmed) {
                try {
                    await api.delete(`/classrooms/${id}`);
                    toast.success('ลบห้องเรียนสำเร็จ');
                    fetchClassrooms();
                } catch (error) {
                    toast.error('ไม่สามารถลบห้องเรียนได้');
                }
            }
        });
    };

    // กรองตารางห้องเรียน
    const filteredClassrooms = classrooms.filter(room => {
        const matchSearch = room.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchTerm = filterTermId === 'ALL' || room.termId.toString() === filterTermId;
        return matchSearch && matchTerm;
    });

    // ตัวกรองสำหรับรายชื่อครูใน Modal แบบ Real-time
    const filteredTeachers = teachers.filter(teacher =>
        `${teacher.firstName} ${teacher.lastName}`.toLowerCase().includes(teacherSearch.toLowerCase())
    );

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">จัดการห้องเรียน</h1>
                    <p className="text-gray-500">จัดการข้อมูลห้องเรียน ครูที่ปรึกษา และเกณฑ์พฤติกรรม (รวม {filteredClassrooms.length} ห้อง)</p>
                </div>
                <button
                    onClick={handleOpenCreate}
                    className="flex items-center gap-2 bg-primary hover:bg-blue-900 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
                >
                    <Plus size={18} /> สร้างห้องเรียน
                </button>
            </div>

            {/* Filters */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="text-gray-400" size={20} />
                    </div>
                    <input
                        type="text"
                        placeholder="ค้นหาชื่อห้องเรียน (เช่น ม.6/5)..."
                        className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary outline-none"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2 bg-white">
                    <BookOpen className="text-gray-400" size={20} />
                    <select
                        value={filterTermId}
                        onChange={(e) => setFilterTermId(e.target.value)}
                        className="bg-transparent focus:outline-none text-gray-700 outline-none border-none"
                    >
                        <option value="ALL">ดูทุกภาคเรียน</option>
                        {terms.map(t => (
                            <option key={t.id} value={t.id}>
                                เทอม {t.term}/{t.year} {t.isActive ? '(ปัจจุบัน)' : ''}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-100 text-sm text-gray-600">
                                <th className="p-4 font-medium">ชื่อห้องเรียน</th>
                                <th className="p-4 font-medium">ภาคเรียน</th>
                                <th className="p-4 font-medium">ครูที่ปรึกษา</th>
                                <th className="p-4 font-medium text-center">นักเรียน</th>
                                <th className="p-4 font-medium">เกณฑ์ (เริ่ม/ตก/บัตร/โล่)</th>
                                <th className="p-4 font-medium text-center">จัดการ</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr><td colSpan={6} className="p-8 text-center text-gray-500">กำลังโหลด...</td></tr>
                            ) : filteredClassrooms.length === 0 ? (
                                <tr><td colSpan={6} className="p-8 text-center text-gray-500">ไม่พบข้อมูลห้องเรียน</td></tr>
                            ) : (
                                filteredClassrooms.map((room) => (
                                    <tr key={room.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="p-4 font-bold text-gray-800 text-lg">{room.name}</td>
                                        <td className="p-4 text-gray-600">
                                            เทอม {room.term?.term}/{room.term?.year}
                                            {room.term?.isActive && <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">ปัจจุบัน</span>}
                                        </td>
                                        <td className="p-4">
                                            {room.advisors.length > 0 ? (
                                                <div className="flex flex-col gap-1">
                                                    {room.advisors.map(adv => (
                                                        <span key={adv.id} className="text-sm text-gray-700 flex items-center gap-1">
                                                            <Users size={14} className="text-blue-500" /> ครู{adv.firstName}
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="text-gray-400 text-sm italic">- ไม่มีที่ปรึกษา -</span>
                                            )}
                                        </td>
                                        <td className="p-4 text-center font-medium text-gray-800">
                                            {room._count.students} คน
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center gap-2 text-xs font-medium">
                                                <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded" title="คะแนนเริ่มต้น">{room.startingPoints}</span> /
                                                <span className="bg-red-50 text-red-600 px-2 py-1 rounded flex items-center gap-1" title="เกณฑ์ไม่ผ่าน"><AlertTriangle size={12} /> {room.failingThreshold}</span> /
                                                <span className="bg-yellow-50 text-yellow-600 px-2 py-1 rounded flex items-center gap-1" title="เกณฑ์เกียรติบัตร"><Award size={12} /> {room.certificateThreshold}</span> /
                                                <span className="bg-amber-50 text-amber-600 px-2 py-1 rounded flex items-center gap-1" title="เกณฑ์โล่"><Shield size={12} /> {room.shieldThreshold}</span>
                                            </div>
                                        </td>
                                        <td className="p-4 text-center">
                                            <div className="flex justify-center gap-2">
                                                <button onClick={() => handleOpenEdit(room)} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors">
                                                    <Edit size={18} />
                                                </button>
                                                <button onClick={() => handleDelete(room.id, room.name)} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
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
            </div>

            {/* Modal เพิ่ม/แก้ไข ห้องเรียน */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="flex justify-between items-center p-6 border-b bg-gray-50/50">
                            <h3 className="text-xl font-bold text-gray-800">
                                {modalMode === 'CREATE' ? 'สร้างห้องเรียนใหม่' : 'แก้ไขห้องเรียน'}
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                <X size={24} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* ข้อมูลพื้นฐาน */}
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">ชื่อห้องเรียน</label>
                                        <input
                                            type="text"
                                            required
                                            value={formData.name}
                                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                                            className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
                                            placeholder="เช่น ม.6/5"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">ภาคเรียนที่กำหนด</label>
                                        <select
                                            required
                                            value={formData.termId}
                                            onChange={e => setFormData({ ...formData, termId: Number(e.target.value) })}
                                            className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-primary bg-white"
                                        >
                                            <option value="">-- เลือกภาคเรียน --</option>
                                            {terms.map(t => (
                                                <option key={t.id} value={t.id}>เทอม {t.term}/{t.year} {t.isActive ? '(ปัจจุบัน)' : ''}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* การเลือกครูที่ปรึกษาแบบ Custom Checkbox List พร้อมช่องค้นหา */}
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">
                                            ครูที่ปรึกษา <span className="text-xs font-normal text-gray-500">(เลือกได้หลายคน)</span>
                                        </label>
                                        <div className="border border-gray-300 rounded-lg overflow-hidden flex flex-col">

                                            {/* ช่องค้นหาครู */}
                                            <div className="p-2 border-b border-gray-200 bg-white">
                                                <div className="relative">
                                                    <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
                                                        <Search className="text-gray-400" size={14} />
                                                    </div>
                                                    <input
                                                        type="text"
                                                        placeholder="ค้นหาชื่อ หรือนามสกุลครู..."
                                                        value={teacherSearch}
                                                        onChange={(e) => setTeacherSearch(e.target.value)}
                                                        className="w-full border border-gray-300 rounded-md pl-7 pr-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                                                    />
                                                </div>
                                            </div>

                                            {/* รายชื่อครู (มี Scroll) */}
                                            <div className="max-h-40 overflow-y-auto p-2 bg-gray-50 space-y-1">
                                                {filteredTeachers.length === 0 ? (
                                                    <div className="text-sm text-gray-500 text-center py-4">
                                                        {teachers.length === 0 ? 'ไม่มีรายชื่อครูในระบบ' : 'ไม่พบครูที่ค้นหา'}
                                                    </div>
                                                ) : (
                                                    filteredTeachers.map(teacher => (
                                                        <label key={teacher.id} className="flex items-center gap-2 p-2 hover:bg-white rounded cursor-pointer transition-colors border border-transparent hover:border-gray-200">
                                                            <input
                                                                type="checkbox"
                                                                checked={formData.advisorIds.includes(teacher.id)}
                                                                onChange={() => toggleAdvisor(teacher.id)}
                                                                className="w-4 h-4 text-primary rounded focus:ring-primary"
                                                            />
                                                            <span className="text-sm text-gray-700">ครู{teacher.firstName} {teacher.lastName}</span>
                                                        </label>
                                                    ))
                                                )}
                                            </div>

                                        </div>
                                    </div>
                                </div>

                                {/* เกณฑ์คะแนนพฤติกรรม */}
                                <div className="space-y-4 bg-gray-50 p-4 rounded-xl border border-gray-100">
                                    <h4 className="font-bold text-gray-800 flex items-center gap-2 mb-4">
                                        <Shield size={18} className="text-primary" /> เกณฑ์คะแนนพฤติกรรม
                                    </h4>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1">คะแนนเริ่มต้น (เต็ม)</label>
                                            <input
                                                type="number" required
                                                value={formData.startingPoints}
                                                onChange={e => setFormData({ ...formData, startingPoints: Number(e.target.value) })}
                                                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-primary text-center font-bold text-gray-700"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-red-600 mb-1 flex items-center gap-1"><AlertTriangle size={12} /> เกณฑ์ไม่ผ่าน</label>
                                            <input
                                                type="number" required
                                                value={formData.failingThreshold}
                                                onChange={e => setFormData({ ...formData, failingThreshold: Number(e.target.value) })}
                                                className="w-full border border-red-200 rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-red-500 text-center font-bold text-red-600 bg-red-50"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-yellow-600 mb-1 flex items-center gap-1"><Award size={12} /> เกณฑ์เกียรติบัตร</label>
                                            <input
                                                type="number" required
                                                value={formData.certificateThreshold}
                                                onChange={e => setFormData({ ...formData, certificateThreshold: Number(e.target.value) })}
                                                className="w-full border border-yellow-200 rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-yellow-500 text-center font-bold text-yellow-600 bg-yellow-50"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-amber-600 mb-1 flex items-center gap-1"><Shield size={12} /> เกณฑ์โล่รางวัล</label>
                                            <input
                                                type="number" required
                                                value={formData.shieldThreshold}
                                                onChange={e => setFormData({ ...formData, shieldThreshold: Number(e.target.value) })}
                                                className="w-full border border-amber-200 rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-amber-500 text-center font-bold text-amber-600 bg-amber-50"
                                            />
                                        </div>
                                    </div>
                                    <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                                        * เมื่อสร้างหรือแก้ไขห้องเรียนแล้ว เกณฑ์นี้จะถูกนำไปใช้ประเมินพฤติกรรมของนักเรียนในห้องนี้ทันที
                                    </p>
                                </div>
                            </div>

                            <div className="pt-6 mt-6 border-t flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    type="submit"
                                    className="px-6 py-2 text-white bg-primary hover:bg-blue-900 rounded-lg font-bold transition-colors shadow-sm flex items-center gap-2"
                                >
                                    <Save size={18} /> {modalMode === 'CREATE' ? 'บันทึกห้องเรียน' : 'บันทึกการแก้ไข'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}