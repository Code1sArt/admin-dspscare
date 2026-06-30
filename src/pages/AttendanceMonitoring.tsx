import { useState, useEffect, useMemo } from 'react';
import {
    Search, Calendar, Bell, AlertTriangle, CheckCircle2,
    ChevronLeft, ChevronRight, Users, ClipboardList
} from 'lucide-react';
import toast from 'react-hot-toast';
import Swal from 'sweetalert2';
import api from '../services/api';

interface MissingDetail {
    classroomId: number;
    className: string;
    advisorName: string;
    studentCount: number;
    isAssemblyChecked: boolean;
    isAreaChecked: boolean;
}

interface MissingReportResponse {
    targetDate: string;
    summary: {
        totalClassrooms: number;
        missingAssembly: number;
        missingArea: number;
    };
    details: MissingDetail[];
}

const ITEMS_PER_PAGE = 10;

export default function AttendanceMonitoring() {
    const [report, setReport] = useState<MissingReportResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);

    useEffect(() => {
        fetchReport();
    }, [filterDate]);

    const fetchReport = async () => {
        try {
            setLoading(true);
            const res = await api.get(`/attendance/missing-report?date=${filterDate}`);
            setReport(res.data);
            setCurrentPage(1);
        } catch (error) {
            toast.error('ไม่สามารถโหลดข้อมูลรายงานได้');
        } finally {
            setLoading(false);
        }
    };

    const handleSendNotification = async () => {
        const totalMissing = (report?.summary.missingAssembly || 0) + (report?.summary.missingArea || 0);

        if (totalMissing === 0) {
            return toast.success('ครูทุกท่านเช็คชื่อครบถ้วนแล้ว');
        }

        const result = await Swal.fire({
            title: 'ส่งข้อความเตือน?',
            text: `ระบบจะส่งข้อความแจ้งเตือนไปยังครูที่ยังไม่ได้เช็คชื่อผ่าน LINE`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#2563eb',
            confirmButtonText: 'ส่งข้อความทั้งหมด',
            cancelButtonText: 'ยกเลิก'
        });

        if (result.isConfirmed) {
            const toastId = toast.loading('กำลังส่งแจ้งเตือน...');
            try {
                const res = await api.post('/attendance/notify-missing', { date: filterDate });
                toast.success(`ส่งแจ้งเตือนสำเร็จ ${res.data.count} รายการ`, { id: toastId });
            } catch (error) {
                toast.error('เกิดข้อผิดพลาดในการส่งแจ้งเตือน', { id: toastId });
            }
        }
    };

    // Logic กรองข้อมูลและแบ่งหน้า
    const filteredDetails = useMemo(() => {
        if (!report) return [];
        return report.details.filter(d =>
            d.className.toLowerCase().includes(searchQuery.toLowerCase()) ||
            d.advisorName.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [report, searchQuery]);

    const totalPages = Math.ceil(filteredDetails.length / ITEMS_PER_PAGE);
    const paginatedData = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredDetails.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredDetails, currentPage]);

    return (
        <div className="p-6 space-y-6 max-w-7xl mx-auto">
            {/* Header & Main Action */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <ClipboardList className="text-primary" /> ติดตามการเช็คชื่อของครู
                    </h1>
                    <p className="text-gray-500 text-sm">ตรวจสอบสถานะการบันทึกข้อมูลรายห้องเรียน</p>
                </div>
                <button
                    onClick={handleSendNotification}
                    className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold shadow-lg transition-all active:scale-95"
                >
                    <Bell size={20} /> ส่งข้อความเตือนครูทั้งหมด
                </button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-gray-50 rounded-xl text-gray-400"><Users size={24} /></div>
                    <div>
                        <p className="text-sm font-medium text-gray-500">ห้องเรียนทั้งหมด</p>
                        <p className="text-2xl font-bold text-gray-800">{report?.summary.totalClassrooms || 0}</p>
                    </div>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-orange-100 shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-orange-50 rounded-xl text-orange-500"><AlertTriangle size={24} /></div>
                    <div>
                        <p className="text-sm font-medium text-gray-500">ยังไม่เช็คเข้าแถว</p>
                        <p className="text-2xl font-bold text-orange-600">{report?.summary.missingAssembly || 0}</p>
                    </div>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-red-100 shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-red-50 rounded-xl text-red-500"><AlertTriangle size={24} /></div>
                    <div>
                        <p className="text-sm font-medium text-gray-500">ยังไม่เช็คเขตพื้นที่</p>
                        <p className="text-2xl font-bold text-red-600">{report?.summary.missingArea || 0}</p>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                        type="date"
                        value={filterDate}
                        onChange={(e) => setFilterDate(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-primary/20"
                    />
                </div>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                        type="text"
                        placeholder="ค้นหาชื่อห้อง หรือครูที่ปรึกษา..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-primary/20"
                    />
                </div>
            </div>

            {/* Report Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left whitespace-nowrap">
                        <thead className="bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase">
                            <tr>
                                <th className="p-4">ห้องเรียน</th>
                                <th className="p-4">ครูที่ปรึกษา</th>
                                <th className="p-4 text-center">นักเรียน</th>
                                <th className="p-4 text-center">เข้าแถวหน้าเสาธง</th>
                                <th className="p-4 text-center">เวรเขตพื้นที่</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-sm">
                            {loading ? (
                                <tr><td colSpan={5} className="p-10 text-center text-gray-400 italic">กำลังตรวจสอบข้อมูล...</td></tr>
                            ) : paginatedData.length === 0 ? (
                                <tr><td colSpan={5} className="p-10 text-center text-gray-400 italic">ไม่พบข้อมูลที่ต้องการ</td></tr>
                            ) : (
                                paginatedData.map((item) => (
                                    <tr key={item.classroomId} className="hover:bg-gray-50 transition-colors">
                                        <td className="p-4 font-bold text-gray-800">{item.className}</td>
                                        <td className="p-4 text-gray-600">{item.advisorName}</td>
                                        <td className="p-4 text-center text-gray-500">{item.studentCount} คน</td>
                                        <td className="p-4">
                                            <div className="flex justify-center">
                                                {item.isAssemblyChecked ? (
                                                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-50 text-green-600 rounded-full font-bold text-xs">
                                                        <CheckCircle2 size={14} /> เช็คแล้ว
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-red-50 text-red-600 rounded-full font-bold text-xs">
                                                        <AlertTriangle size={14} /> ยังไม่เช็ค
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex justify-center">
                                                {item.isAreaChecked ? (
                                                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-50 text-green-600 rounded-full font-bold text-xs">
                                                        <CheckCircle2 size={14} /> เช็คแล้ว
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-red-50 text-red-600 rounded-full font-bold text-xs">
                                                        <AlertTriangle size={14} /> ยังไม่เช็ค
                                                    </span>
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
                {filteredDetails.length > 0 && (
                    <div className="p-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
                        <p className="text-sm text-gray-500">แสดง {paginatedData.length} จาก {filteredDetails.length} รายการ</p>
                        <div className="flex items-center gap-2">
                            <button
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage(p => p - 1)}
                                className="p-1.5 border border-gray-300 rounded hover:bg-white disabled:opacity-30 transition-all"
                            >
                                <ChevronLeft size={20} />
                            </button>
                            <span className="text-sm font-bold text-primary bg-primary/10 px-3 py-1 rounded-lg">หน้า {currentPage} / {totalPages}</span>
                            <button
                                disabled={currentPage === totalPages}
                                onClick={() => setCurrentPage(p => p + 1)}
                                className="p-1.5 border border-gray-300 rounded hover:bg-white disabled:opacity-30 transition-all"
                            >
                                <ChevronRight size={20} />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}