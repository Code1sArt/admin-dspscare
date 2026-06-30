import { useState, useEffect, useMemo } from 'react';
import {
    Search, Plus, Edit, Trash2, X,
    ChevronLeft, ChevronRight, Eye, Filter, Check, Minus, AlertCircle, Award
} from 'lucide-react';
import toast from 'react-hot-toast';
import Swal from 'sweetalert2';
import api from '../services/api';

// --- Types ---
interface PointCategory {
    id: number;
    name: string;
    type: 'ADD' | 'DEDUCT';
    defaultPoints: number;
    allowedForTeacher: boolean;
    allowedForAffairs: boolean;
}

const ITEMS_PER_PAGE = 10;

const DEFAULT_FORM = {
    name: '',
    type: 'DEDUCT' as 'ADD' | 'DEDUCT',
    defaultPoints: 5,
    allowedForTeacher: true,
    allowedForAffairs: true,
};

export default function PointCategories() {
    const [categories, setCategories] = useState<PointCategory[]>([]);
    const [loading, setLoading] = useState(false);

    // --- Filter States ---
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState<string>('ALL');
    const [currentPage, setCurrentPage] = useState(1);

    // --- Modals State ---
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState<'CREATE' | 'EDIT'>('CREATE');
    const [editId, setEditId] = useState<number | null>(null);
    const [formData, setFormData] = useState(DEFAULT_FORM);

    // --- Detail Modal State ---
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState<PointCategory | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);

    // 1. โหลดข้อมูลทั้งหมดเมื่อเปิดหน้า
    useEffect(() => {
        fetchCategories();
    }, []);

    const fetchCategories = async () => {
        try {
            setLoading(true);
            const res = await api.get('/point-categories');
            setCategories(res.data);
        } catch (error) {
            toast.error('ไม่สามารถโหลดข้อมูลประเภทคะแนนได้');
        } finally {
            setLoading(false);
        }
    };

    // 2. กรองและแบ่งหน้า
    const filteredData = useMemo(() => {
        return categories.filter((c) => {
            const matchSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase());
            const matchType = filterType === 'ALL' || c.type === filterType;
            return matchSearch && matchType;
        });
    }, [categories, searchQuery, filterType]);

    const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE);
    const paginatedData = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredData.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredData, currentPage]);

    useEffect(() => { setCurrentPage(1); }, [searchQuery, filterType]);

    // --- จัดการฟอร์ม เพิ่ม/แก้ไข ---
    const handleOpenCreate = () => {
        setModalMode('CREATE');
        setFormData(DEFAULT_FORM);
        setIsFormModalOpen(true);
    };

    const handleOpenEdit = (c: PointCategory) => {
        setModalMode('EDIT');
        setEditId(c.id);
        setFormData({
            name: c.name,
            type: c.type,
            defaultPoints: c.defaultPoints,
            allowedForTeacher: c.allowedForTeacher,
            allowedForAffairs: c.allowedForAffairs,
        });
        setIsFormModalOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const toastId = toast.loading('กำลังบันทึก...');
        try {
            const payload = {
                ...formData,
                defaultPoints: Number(formData.defaultPoints),
            };

            if (modalMode === 'CREATE') {
                await api.post('/point-categories', payload);
                toast.success('เพิ่มประเภทพฤติกรรมสำเร็จ', { id: toastId });
            } else {
                await api.patch(`/point-categories/${editId}`, payload);
                toast.success('แก้ไขข้อมูลสำเร็จ', { id: toastId });
            }
            setIsFormModalOpen(false);
            fetchCategories();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'เกิดข้อผิดพลาด', { id: toastId });
        }
    };

    const handleDelete = (id: number, name: string) => {
        Swal.fire({
            title: 'ยืนยันการลบ?',
            text: `ต้องการลบหัวข้อ "${name}" หรือไม่? หากมีการบันทึกพฤติกรรมด้วยหัวข้อนี้ไปแล้วอาจส่งผลกระทบกับข้อมูลเดิม`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            confirmButtonText: 'ใช่, ลบเลย',
            cancelButtonText: 'ยกเลิก'
        }).then(async (result) => {
            if (result.isConfirmed) {
                try {
                    await api.delete(`/point-categories/${id}`); // สมมติว่ามีเส้น DELETE
                    toast.success('ลบข้อมูลสำเร็จ');
                    fetchCategories();
                } catch (error) {
                    toast.error('ลบข้อมูลไม่สำเร็จ (อาจมีการใช้งานอยู่)');
                }
            }
        });
    };

    // --- ดูรายละเอียด (ยิง API เดี่ยว) ---
    const handleViewDetail = async (id: number) => {
        setIsDetailModalOpen(true);
        setDetailLoading(true);
        try {
            const res = await api.get(`/point-categories/${id}`);
            setSelectedCategory(res.data);
        } catch (error) {
            toast.error('ไม่สามารถโหลดรายละเอียดได้');
            setIsDetailModalOpen(false);
        } finally {
            setDetailLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">ประเภทคะแนนพฤติกรรม</h1>
                    <p className="text-gray-500">จัดการหัวข้อการเพิ่มและหักคะแนน พร้อมกำหนดสิทธิ์การใช้งาน</p>
                </div>
                <button
                    onClick={handleOpenCreate}
                    className="flex items-center justify-center gap-2 bg-primary hover:bg-blue-900 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                >
                    <Plus size={18} /> เพิ่มประเภทคะแนน
                </button>
            </div>

            {/* --- Filters Area --- */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                    <input
                        type="text"
                        placeholder="ค้นหาชื่อพฤติกรรม..."
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-primary outline-none"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-lg border border-gray-300">
                    <Filter size={18} className="text-gray-500" />
                    <select
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                        className="bg-transparent outline-none text-gray-700 text-sm font-medium"
                    >
                        <option value="ALL">ทุกประเภท (เพิ่ม/หัก)</option>
                        <option value="ADD">เชิงบวก (+ เพิ่มคะแนน)</option>
                        <option value="DEDUCT">เชิงลบ (- หักคะแนน)</option>
                    </select>
                </div>
            </div>

            {/* --- Table --- */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left whitespace-nowrap">
                        <thead className="bg-gray-50 border-b border-gray-100 text-sm text-gray-600">
                            <tr>
                                <th className="p-4 font-medium">ชื่อพฤติกรรม</th>
                                <th className="p-4 font-medium text-center">ประเภท</th>
                                <th className="p-4 font-medium text-center">คะแนนตั้งต้น</th>
                                <th className="p-4 font-medium text-center">สิทธิ์การใช้งาน</th>
                                <th className="p-4 font-medium text-center">การจัดการ</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr><td colSpan={5} className="p-8 text-center text-gray-500">กำลังโหลดข้อมูล...</td></tr>
                            ) : paginatedData.length === 0 ? (
                                <tr><td colSpan={5} className="p-8 text-center text-gray-500">ไม่มีข้อมูลประเภทคะแนน</td></tr>
                            ) : (
                                paginatedData.map((c) => (
                                    <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="p-4 font-bold text-gray-800">{c.name}</td>
                                        <td className="p-4 text-center">
                                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${c.type === 'ADD' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                                }`}>
                                                {c.type === 'ADD' ? <Award size={12} /> : <AlertCircle size={12} />}
                                                {c.type === 'ADD' ? 'เพิ่มคะแนน' : 'หักคะแนน'}
                                            </span>
                                        </td>
                                        <td className="p-4 text-center font-bold text-lg text-gray-700">
                                            {c.type === 'ADD' ? '+' : '-'}{c.defaultPoints}
                                        </td>
                                        <td className="p-4">
                                            <div className="flex justify-center gap-2">
                                                <span className={`text-xs px-2 py-1 rounded border ${c.allowedForTeacher ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                                                    ครูที่ปรึกษา
                                                </span>
                                                <span className={`text-xs px-2 py-1 rounded border ${c.allowedForAffairs ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                                                    ฝ่ายกิจการ
                                                </span>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex justify-center gap-1">
                                                <button onClick={() => handleViewDetail(c.id)} title="ดูข้อมูล" className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded">
                                                    <Eye size={18} />
                                                </button>
                                                <button onClick={() => handleOpenEdit(c)} title="แก้ไข" className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded">
                                                    <Edit size={18} />
                                                </button>
                                                <button onClick={() => handleDelete(c.id, c.name)} title="ลบ" className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded">
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

                {/* Pagination Controls */}
                {filteredData.length > 0 && (
                    <div className="p-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
                        <p className="text-sm text-gray-500">แสดง {paginatedData.length} จาก {filteredData.length} รายการ</p>
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

            {/* --- Modal 1: ฟอร์มเพิ่ม/แก้ไข --- */}
            {isFormModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-6 border-b flex justify-between items-center bg-gray-50/50">
                            <h3 className="text-xl font-bold text-gray-800">{modalMode === 'CREATE' ? 'เพิ่มประเภทคะแนน' : 'แก้ไขประเภทคะแนน'}</h3>
                            <button onClick={() => setIsFormModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-5">

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">ชื่อพฤติกรรม</label>
                                <input
                                    type="text" required
                                    placeholder="เช่น ช่วยเหลืองานโรงเรียน, มาสาย"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">ประเภท</label>
                                    <select
                                        value={formData.type}
                                        onChange={(e) => setFormData({ ...formData, type: e.target.value as 'ADD' | 'DEDUCT' })}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-primary bg-white"
                                    >
                                        <option value="ADD">เชิงบวก (+)</option>
                                        <option value="DEDUCT">เชิงลบ (-)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">คะแนนตั้งต้น</label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500 font-bold">
                                            {formData.type === 'ADD' ? '+' : '-'}
                                        </div>
                                        <input
                                            type="number" required min="1"
                                            value={formData.defaultPoints}
                                            onChange={(e) => setFormData({ ...formData, defaultPoints: Number(e.target.value) })}
                                            className="w-full border border-gray-300 rounded-lg pl-8 pr-3 py-2 outline-none focus:ring-1 focus:ring-primary"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                                <label className="block text-sm font-bold text-gray-800 mb-3">กำหนดสิทธิ์ผู้บันทึก (ใครใช้ข้อนี้ได้บ้าง?)</label>
                                <div className="space-y-3">
                                    <label className="flex items-center gap-3 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={formData.allowedForTeacher}
                                            onChange={(e) => setFormData({ ...formData, allowedForTeacher: e.target.checked })}
                                            className="w-5 h-5 text-primary rounded border-gray-300 focus:ring-primary"
                                        />
                                        <span className="text-gray-700 font-medium">ครูที่ปรึกษา</span>
                                    </label>
                                    <label className="flex items-center gap-3 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={formData.allowedForAffairs}
                                            onChange={(e) => setFormData({ ...formData, allowedForAffairs: e.target.checked })}
                                            className="w-5 h-5 text-primary rounded border-gray-300 focus:ring-primary"
                                        />
                                        <span className="text-gray-700 font-medium">ฝ่ายกิจการนักเรียน / แอดมิน</span>
                                    </label>
                                </div>
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button type="button" onClick={() => setIsFormModalOpen(false)} className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg font-bold text-gray-700 transition-colors">ยกเลิก</button>
                                <button type="submit" className="flex-1 py-2 bg-primary hover:bg-blue-900 text-white rounded-lg font-bold transition-colors shadow-md">บันทึกข้อมูล</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* --- Modal 2: ดูรายละเอียด --- */}
            {isDetailModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-6 border-b flex justify-between items-center bg-gray-50/50">
                            <h3 className="text-xl font-bold text-gray-800">รายละเอียดพฤติกรรม</h3>
                            <button onClick={() => setIsDetailModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
                        </div>

                        <div className="p-6">
                            {detailLoading ? (
                                <div className="text-center py-8 text-gray-500">กำลังโหลด...</div>
                            ) : selectedCategory ? (
                                <div className="space-y-6 text-center">
                                    <div className={`mx-auto w-20 h-20 rounded-full flex items-center justify-center ${selectedCategory.type === 'ADD' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                                        {selectedCategory.type === 'ADD' ? <Plus size={40} /> : <Minus size={40} />}
                                    </div>

                                    <div>
                                        <h4 className="text-2xl font-bold text-gray-800 mb-1">{selectedCategory.name}</h4>
                                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-bold ${selectedCategory.type === 'ADD' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                                            {selectedCategory.type === 'ADD' ? 'พฤติกรรมเชิงบวก' : 'พฤติกรรมเชิงลบ'}
                                        </span>
                                    </div>

                                    <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                                        <p className="text-sm text-gray-500 mb-1">คะแนนตั้งต้นสำหรับข้อนี้</p>
                                        <p className={`text-4xl font-black ${selectedCategory.type === 'ADD' ? 'text-green-600' : 'text-red-600'}`}>
                                            {selectedCategory.type === 'ADD' ? '+' : '-'}{selectedCategory.defaultPoints}
                                        </p>
                                    </div>

                                    <div className="text-left space-y-2">
                                        <p className="text-sm font-bold text-gray-700 mb-2">สิทธิ์ในการบันทึก:</p>
                                        <div className="flex items-center gap-2">
                                            {selectedCategory.allowedForTeacher ? <Check size={16} className="text-green-500" /> : <X size={16} className="text-red-400" />}
                                            <span className={selectedCategory.allowedForTeacher ? 'text-gray-800' : 'text-gray-400 line-through'}>ครูที่ปรึกษา</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {selectedCategory.allowedForAffairs ? <Check size={16} className="text-green-500" /> : <X size={16} className="text-red-400" />}
                                            <span className={selectedCategory.allowedForAffairs ? 'text-gray-800' : 'text-gray-400 line-through'}>ฝ่ายกิจการนักเรียน / แอดมิน</span>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-8 text-red-500">ไม่พบข้อมูล</div>
                            )}
                        </div>
                        <div className="p-4 border-t bg-gray-50">
                            <button onClick={() => setIsDetailModalOpen(false)} className="w-full py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-bold transition-colors">
                                ปิดหน้าต่าง
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}