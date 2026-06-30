import { useState, useEffect, useMemo } from 'react';
import {
    Search, Filter, Trophy, Medal,
    XCircle, CheckCircle, Download, BookOpen, Users,
    ChevronLeft, ChevronRight
} from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import api from '../services/api';

// --- Types ---
interface StudentListItem {
    id: string;
    citizenId: string;
    name: string;
    classroom: string;
    score: number;
}

interface SummaryResponse {
    summary: {
        total: number;
        failedCount: number;
        normalCount: number;
        certificateCount: number;
        shieldCount: number;
    };
    lists: {
        failed: StudentListItem[];
        normal: StudentListItem[];
        certificate: StudentListItem[];
        shield: StudentListItem[];
    };
}

interface Classroom {
    id: number;
    name: string;
    termId: number;
}

interface Term {
    id: number;
    term: number;
    year: number;
    isActive: boolean;
}

type TabType = 'normal' | 'failed' | 'certificate' | 'shield';

const ITEMS_PER_PAGE = 15;

export default function SchoolSummary() {
    const [data, setData] = useState<SummaryResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<TabType>('normal');

    // Filters
    const [terms, setTerms] = useState<Term[]>([]);
    const [classrooms, setClassrooms] = useState<Classroom[]>([]);
    const [selectedTermId, setSelectedTermId] = useState('');
    const [selectedClassroomId, setSelectedClassroomId] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);

    // 1. โหลดข้อมูลพื้นฐาน (ปีการศึกษา/ห้องเรียน)
    useEffect(() => {
        const init = async () => {
            try {
                const [tRes, cRes] = await Promise.all([
                    api.get('/terms'),
                    api.get('/classrooms')
                ]);
                setTerms(tRes.data);
                setClassrooms(cRes.data);
                const active = tRes.data.find((t: Term) => t.isActive);
                if (active) setSelectedTermId(active.id.toString());
            } catch (e) {
                toast.error('โหลดข้อมูลพื้นฐานล้มเหลว');
            }
        };
        init();
    }, []);

    // 2. ดึงข้อมูลสรุปเมื่อ Filter เปลี่ยน
    useEffect(() => {
        fetchSummary();
    }, [selectedTermId, selectedClassroomId]);

    const fetchSummary = async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams();
            if (selectedTermId) params.append('termId', selectedTermId);
            if (selectedClassroomId) params.append('classroomId', selectedClassroomId);

            const res = await api.get(`/summary/school-wide?${params.toString()}`);
            setData(res.data);
            setCurrentPage(1);
        } catch (e) {
            toast.error('ไม่สามารถโหลดข้อมูลสรุปได้');
        } finally {
            setLoading(false);
        }
    };

    // กรองห้องเรียนตามเทอมที่เลือก
    const filteredClassrooms = useMemo(() => {
        return classrooms.filter(c => c.termId === Number(selectedTermId));
    }, [classrooms, selectedTermId]);

    // Logic การค้นหาและแบ่งหน้า
    const currentList = data?.lists[activeTab] || [];
    const filteredList = useMemo(() => {
        return currentList.filter(s =>
            s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.citizenId.includes(searchQuery)
        );
    }, [currentList, searchQuery]);

    const totalPages = Math.ceil(filteredList.length / ITEMS_PER_PAGE);
    const paginatedData = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredList.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredList, currentPage]);

    // --- Export Excel ---
    const handleExportExcel = () => {
        if (!filteredList.length) return toast.error('ไม่มีข้อมูลสำหรับส่งออก');

        const tabNames: Record<TabType, string> = {
            normal: 'นักเรียนที่ผ่าน',
            failed: 'นักเรียนที่ไม่ผ่าน',
            certificate: 'นักเรียนที่ได้รับเกียรติบัตร',
            shield: 'นักเรียนที่ได้รับโล่รางวัล'
        };

        const worksheet = XLSX.utils.json_to_sheet(filteredList.map(s => ({
            'รหัสประจำตัว': s.citizenId,
            'ชื่อ-นามสกุล': s.name,
            'ชั้นเรียน': s.classroom,
            'คะแนนคงเหลือ': s.score
        })));

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');
        XLSX.writeFile(workbook, `สรุป_${tabNames[activeTab]}_${new Date().toLocaleDateString()}.xlsx`);
        toast.success('ส่งออกไฟล์ Excel สำเร็จ');
    };

    return (
        <div className="p-6 space-y-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <Trophy className="text-primary" /> สรุปผลการประเมินพฤติกรรม
                    </h1>
                    <p className="text-gray-500 text-sm">ภาพรวมสถิตินักเรียนแยกตามระดับผลการประเมิน</p>
                </div>
                <button
                    onClick={handleExportExcel}
                    className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-xl font-bold shadow-md transition-all active:scale-95"
                >
                    <Download size={20} /> ส่งออก Excel
                </button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {[
                    { label: 'ทั้งหมด', count: data?.summary.total, icon: Users, color: 'text-gray-600', bg: 'bg-gray-100' },
                    { label: 'ผ่านเกณฑ์', count: data?.summary.normalCount, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
                    { label: 'ไม่ผ่านเกณฑ์', count: data?.summary.failedCount, icon: XCircle, color: 'text-red-600', bg: 'bg-red-50' },
                    { label: 'เกียรติบัตร', count: data?.summary.certificateCount, icon: Medal, color: 'text-blue-600', bg: 'bg-blue-50' },
                    { label: 'โล่รางวัล', count: data?.summary.shieldCount, icon: Trophy, color: 'text-purple-600', bg: 'bg-purple-50' },
                ].map((item, idx) => (
                    <div key={idx} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col items-center">
                        <div className={`p-3 ${item.bg} ${item.color} rounded-full mb-3`}><item.icon size={24} /></div>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{item.label}</p>
                        <p className={`text-2xl font-black ${item.color}`}>{item.count || 0}</p>
                    </div>
                ))}
            </div>

            {/* Filter Bar */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                        type="text" placeholder="ค้นหาชื่อ หรือ รหัสประจำตัว..."
                        className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 outline-none"
                        value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <div className="flex items-center gap-2">
                    <BookOpen size={18} className="text-gray-400" />
                    <select
                        value={selectedTermId} onChange={(e) => { setSelectedTermId(e.target.value); setSelectedClassroomId(''); }}
                        className="border border-gray-200 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-primary/20 bg-white"
                    >
                        {terms.map(t => <option key={t.id} value={t.id}>เทอม {t.term}/{t.year}</option>)}
                    </select>
                </div>
                <div className="flex items-center gap-2">
                    <Filter size={18} className="text-gray-400" />
                    <select
                        value={selectedClassroomId} onChange={(e) => setSelectedClassroomId(e.target.value)}
                        className="border border-gray-200 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-primary/20 bg-white"
                    >
                        <option value="">ทุกห้องเรียน</option>
                        {filteredClassrooms.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200">
                {[
                    { id: 'normal', label: 'ผ่านเกณฑ์', icon: CheckCircle },
                    { id: 'failed', label: 'ไม่ผ่านเกณฑ์', icon: XCircle },
                    { id: 'certificate', label: 'เกียรติบัตร', icon: Medal },
                    { id: 'shield', label: 'โล่รางวัล', icon: Trophy },
                ].map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => { setActiveTab(tab.id as TabType); setCurrentPage(1); }}
                        className={`flex items-center gap-2 px-6 py-4 font-bold border-b-2 transition-all ${activeTab === tab.id
                                ? 'border-primary text-primary bg-primary/5'
                                : 'border-transparent text-gray-400 hover:text-gray-600'
                            }`}
                    >
                        <tab.icon size={18} /> {tab.label}
                    </button>
                ))}
            </div>

            {/* Data Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left whitespace-nowrap">
                        <thead className="bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-widest">
                            <tr>
                                <th className="p-4">รหัสประจำตัว</th>
                                <th className="p-4">ชื่อ-นามสกุล</th>
                                <th className="p-4">ชั้นเรียน</th>
                                <th className="p-4 text-center">คะแนนพฤติกรรม</th>
                                <th className="p-4 text-center">สถานะ</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-sm">
                            {loading ? (
                                <tr><td colSpan={5} className="p-10 text-center text-gray-400 italic">กำลังรวบรวมข้อมูล...</td></tr>
                            ) : paginatedData.length === 0 ? (
                                <tr><td colSpan={5} className="p-10 text-center text-gray-400 italic">ไม่พบรายชื่อในหมวดหมู่นี้</td></tr>
                            ) : (
                                paginatedData.map((s) => (
                                    <tr key={s.id} className="hover:bg-gray-50/50 transition-colors">
                                        <td className="p-4 font-mono text-gray-500">{s.citizenId}</td>
                                        <td className="p-4 font-bold text-gray-800">{s.name}</td>
                                        <td className="p-4 text-gray-600">{s.classroom}</td>
                                        <td className="p-4 text-center">
                                            <span className={`font-black text-lg ${activeTab === 'failed' ? 'text-red-500' : 'text-primary'}`}>
                                                {s.score}
                                            </span>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex justify-center">
                                                {activeTab === 'failed' ? (
                                                    <span className="bg-red-100 text-red-600 px-3 py-1 rounded-full text-xs font-bold">ต้องปรับปรุง</span>
                                                ) : activeTab === 'shield' ? (
                                                    <span className="bg-purple-100 text-purple-600 px-3 py-1 rounded-full text-xs font-bold">ดีเยี่ยม (โล่)</span>
                                                ) : activeTab === 'certificate' ? (
                                                    <span className="bg-blue-100 text-blue-600 px-3 py-1 rounded-full text-xs font-bold">ดีมาก (เกียรติบัตร)</span>
                                                ) : (
                                                    <span className="bg-green-100 text-green-600 px-3 py-1 rounded-full text-xs font-bold">ผ่านเกณฑ์</span>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {filteredList.length > 0 && (
                    <div className="p-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
                        <p className="text-sm text-gray-500">แสดง {paginatedData.length} จาก {filteredList.length} รายการ</p>
                        <div className="flex items-center gap-2">
                            <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="p-2 border border-gray-200 rounded-xl hover:bg-white disabled:opacity-30 transition-all shadow-sm"><ChevronLeft size={20} /></button>
                            <span className="text-sm font-bold text-primary bg-primary/10 px-3 py-1 rounded-lg">หน้า {currentPage} / {totalPages}</span>
                            <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="p-2 border border-gray-200 rounded-xl hover:bg-white disabled:opacity-30 transition-all shadow-sm"><ChevronRight size={20} /></button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
