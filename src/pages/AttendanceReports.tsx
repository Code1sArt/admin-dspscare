import { useState, useEffect, useMemo } from 'react';
import {
    Search, Calendar, Filter, FileText, BarChart2,
    CheckCircle, XCircle, Clock, Info, AlertTriangle, ChevronLeft, ChevronRight, Activity
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

// --- Types ---
interface Classroom {
    id: number;
    name: string;
}

interface AttendanceRecord {
    id: string;
    type: 'ASSEMBLY' | 'AREA';
    status: 'PRESENT' | 'ABSENT' | 'LATE' | 'LEAVE' | 'ACTIVITY';
    date: string;
    student: {
        citizenId: string;
        firstName: string;
        lastName: string;
        classroom: { name: string };
    };
    recorder: {
        firstName: string;
        lastName: string;
    };
}

interface SummaryStatistics {
    totalStudents: number;
    totalChecked: number;
    notChecked: number;
    present: number;
    absent: number;
    late: number;
    leave: number;
    activity?: number;
}

interface SummaryPercentage {
    present: number;
    absent: number;
    late: number;
    leave: number;
    activity?: number;
    notChecked: number;
}

interface SummaryData {
    classroomId: number;
    classroomName: string;
    statistics: SummaryStatistics;
    percentages: SummaryPercentage;
}

const ITEMS_PER_PAGE = 10;

const getTodayString = () => new Date().toISOString().split('T')[0];

export default function AttendanceReports() {
    const [activeTab, setActiveTab] = useState<'HISTORY' | 'SUMMARY'>('HISTORY');
    const [loading, setLoading] = useState(false);
    const [classrooms, setClassrooms] = useState<Classroom[]>([]);

    // --- Filters State ---
    const [filterDate, setFilterDate] = useState(getTodayString());
    const [filterClassroomId, setFilterClassroomId] = useState('');
    const [filterType, setFilterType] = useState('ALL');
    const [searchQuery, setSearchQuery] = useState('');

    // --- Pagination States (แยกอิสระ 2 Tab) ---
    const [historyPage, setHistoryPage] = useState(1);
    const [summaryPage, setSummaryPage] = useState(1);

    // --- Data State ---
    const [historyRecords, setHistoryRecords] = useState<AttendanceRecord[]>([]);
    const [summaryData, setSummaryData] = useState<SummaryData[]>([]);

    // 1. ดึงรายชื่อห้องเรียน
    useEffect(() => {
        api.get('/classrooms').then(res => setClassrooms(res.data)).catch(() => { });
    }, []);

    // 2. ดึงข้อมูลเมื่อ Filter เปลี่ยน
    useEffect(() => {
        if (activeTab === 'HISTORY') {
            fetchHistory();
        } else {
            fetchSummary();
        }
    }, [activeTab, filterDate, filterClassroomId, filterType]);

    // รีเซ็ตหน้ากลับไป 1 เสมอเมื่อมีการพิมพ์ค้นหา หรือเปลี่ยน Filter
    useEffect(() => {
        setHistoryPage(1);
        setSummaryPage(1);
    }, [searchQuery, filterDate, filterClassroomId, filterType]);

    const fetchHistory = async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams();
            if (filterDate) params.append('date', filterDate);
            if (filterClassroomId) params.append('classroomId', filterClassroomId);
            if (filterType !== 'ALL') params.append('type', filterType);

            const res = await api.get(`/attendance/history/daily?${params.toString()}`);
            const combined = [
                ...(res.data.records.ASSEMBLY || []),
                ...(res.data.records.AREA || [])
            ];
            setHistoryRecords(combined);
        } catch (error) {
            toast.error('ไม่สามารถโหลดประวัติการเช็คชื่อได้');
        } finally {
            setLoading(false);
        }
    };

    const fetchSummary = async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams();
            if (filterDate) params.append('date', filterDate);
            if (filterClassroomId) params.append('classroomId', filterClassroomId);
            if (filterType !== 'ALL') params.append('type', filterType);

            const res = await api.get(`/attendance/summary/daily?${params.toString()}`);
            setSummaryData(res.data.summary || []);
        } catch (error) {
            toast.error('ไม่สามารถโหลดสรุปสถิติได้');
        } finally {
            setLoading(false);
        }
    };

    // --- Logic สำหรับ Tab: HISTORY ---
    const filteredHistory = useMemo(() => {
        return historyRecords.filter(r =>
            `${r.student.firstName} ${r.student.lastName} ${r.student.citizenId} ${r.student.classroom.name}`
                .toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [historyRecords, searchQuery]);

    const totalHistoryPages = Math.ceil(filteredHistory.length / ITEMS_PER_PAGE);
    const paginatedHistory = useMemo(() => {
        const start = (historyPage - 1) * ITEMS_PER_PAGE;
        return filteredHistory.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredHistory, historyPage]);

    // --- Logic สำหรับ Tab: SUMMARY ---
    const filteredSummary = useMemo(() => {
        return summaryData.filter(s =>
            s.classroomName.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [summaryData, searchQuery]);

    const totalSummaryPages = Math.ceil(filteredSummary.length / ITEMS_PER_PAGE);
    const paginatedSummary = useMemo(() => {
        const start = (summaryPage - 1) * ITEMS_PER_PAGE;
        return filteredSummary.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredSummary, summaryPage]);

    // Chart Data (แสดงผลทั้งหมดที่ถูกกรอง ไม่แบ่งหน้าในกราฟ)
    const chartData = filteredSummary.map(s => ({
        name: s.classroomName,
        มาเรียน: s.statistics.present,
        มาสาย: s.statistics.late,
        ลา: s.statistics.leave,
        กิจกรรม: s.statistics.activity ?? 0,
        ขาด: s.statistics.absent,
        ยังไม่เช็ค: s.statistics.notChecked,
    }));

    // Helper Elements
    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'PRESENT': return <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1 w-fit"><CheckCircle size={12} /> มาเรียน</span>;
            case 'ABSENT': return <span className="bg-red-100 text-red-700 px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1 w-fit"><XCircle size={12} /> ขาด</span>;
            case 'LATE': return <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1 w-fit"><Clock size={12} /> สาย</span>;
            case 'LEAVE': return <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1 w-fit"><Info size={12} /> ลา</span>;
            case 'ACTIVITY': return <span className="bg-cyan-100 text-cyan-700 px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1 w-fit"><Activity size={12} /> กิจกรรม</span>;
            default: return <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded-full text-xs font-bold w-fit">{status}</span>;
        }
    };

    const getTypeBadge = (type: string) => {
        return type === 'ASSEMBLY'
            ? <span className="bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded text-xs font-bold">เข้าแถว</span>
            : <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded text-xs font-bold">เขตพื้นที่</span>;
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">รายงานการเช็คชื่อ</h1>
                    <p className="text-gray-500">ดูประวัติรายบุคคล และสรุปสถิติการมาเรียนรายวัน</p>
                </div>
            </div>

            {/* --- ตัวกรองส่วนกลาง --- */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                        type="date"
                        value={filterDate}
                        onChange={(e) => setFilterDate(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-1 focus:ring-primary text-gray-700 font-medium"
                    />
                </div>
                <div className="relative">
                    <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <select
                        value={filterClassroomId}
                        onChange={(e) => setFilterClassroomId(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-1 focus:ring-primary text-gray-700 font-medium bg-white"
                    >
                        <option value="">-- ทุกห้องเรียน --</option>
                        {classrooms.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </div>
                <div className="relative">
                    <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <select
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-1 focus:ring-primary text-gray-700 font-medium bg-white"
                    >
                        <option value="ALL">รวมทุกประเภท</option>
                        <option value="ASSEMBLY">เฉพาะเข้าแถวหน้าเสาธง</option>
                        <option value="AREA">เฉพาะเวรเขตพื้นที่</option>
                    </select>
                </div>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                        type="text"
                        placeholder={activeTab === 'HISTORY' ? "ค้นหาชื่อ, นามสกุล..." : "ค้นหาชื่อห้องเรียน..."}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-1 focus:ring-primary text-gray-700"
                    />
                </div>
            </div>

            {/* --- Tabs Switcher --- */}
            <div className="flex border-b border-gray-200">
                <button
                    onClick={() => setActiveTab('HISTORY')}
                    className={`flex items-center gap-2 px-6 py-3 font-bold border-b-2 transition-colors ${activeTab === 'HISTORY' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                    <FileText size={18} /> ประวัติรายบุคคล
                </button>
                <button
                    onClick={() => setActiveTab('SUMMARY')}
                    className={`flex items-center gap-2 px-6 py-3 font-bold border-b-2 transition-colors ${activeTab === 'SUMMARY' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                    <BarChart2 size={18} /> สรุปสถิติ
                </button>
            </div>

            {/* ---------------------------------------------------- */}
            {/* TAB 1: ประวัติรายบุคคล (HISTORY)                       */}
            {/* ---------------------------------------------------- */}
            {activeTab === 'HISTORY' && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden animate-in fade-in duration-300">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left whitespace-nowrap">
                            <thead className="bg-gray-50 border-b border-gray-100 text-sm text-gray-600">
                                <tr>
                                    <th className="p-4 font-medium">เวลาที่บันทึก</th>
                                    <th className="p-4 font-medium">ประเภท</th>
                                    <th className="p-4 font-medium">รหัสประจำตัว</th>
                                    <th className="p-4 font-medium">ชื่อ-นามสกุล</th>
                                    <th className="p-4 font-medium">ห้องเรียน</th>
                                    <th className="p-4 font-medium">สถานะ</th>
                                    <th className="p-4 font-medium">ผู้บันทึก</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {loading ? (
                                    <tr><td colSpan={7} className="p-8 text-center text-gray-500">กำลังโหลดข้อมูล...</td></tr>
                                ) : paginatedHistory.length === 0 ? (
                                    <tr><td colSpan={7} className="p-8 text-center text-gray-500">ไม่พบประวัติการเช็คชื่อในเงื่อนไขที่เลือก</td></tr>
                                ) : (
                                    paginatedHistory.map((record) => (
                                        <tr key={record.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="p-4 text-gray-600 text-sm">
                                                {new Date(record.date).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
                                            </td>
                                            <td className="p-4">{getTypeBadge(record.type)}</td>
                                            <td className="p-4 font-mono text-gray-500 text-sm">{record.student.citizenId}</td>
                                            <td className="p-4 font-bold text-gray-800">{record.student.firstName} {record.student.lastName}</td>
                                            <td className="p-4 text-gray-700">{record.student.classroom.name}</td>
                                            <td className="p-4">{getStatusBadge(record.status)}</td>
                                            <td className="p-4 text-gray-500 text-sm text-ellipsis overflow-hidden">
                                                ครู{record.recorder.firstName}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination (History) */}
                    {filteredHistory.length > 0 && (
                        <div className="p-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
                            <p className="text-sm text-gray-500">แสดง {paginatedHistory.length} จาก {filteredHistory.length} รายการ</p>
                            <div className="flex items-center gap-2">
                                <button
                                    disabled={historyPage === 1}
                                    onClick={() => setHistoryPage(prev => prev - 1)}
                                    className="p-1.5 border border-gray-300 rounded hover:bg-white disabled:opacity-50 transition-colors"
                                >
                                    <ChevronLeft size={18} />
                                </button>
                                <span className="text-sm font-bold text-gray-700">หน้า {historyPage} / {totalHistoryPages || 1}</span>
                                <button
                                    disabled={historyPage === totalHistoryPages || totalHistoryPages === 0}
                                    onClick={() => setHistoryPage(prev => prev + 1)}
                                    className="p-1.5 border border-gray-300 rounded hover:bg-white disabled:opacity-50 transition-colors"
                                >
                                    <ChevronRight size={18} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ---------------------------------------------------- */}
            {/* TAB 2: สรุปสถิติ (SUMMARY)                            */}
            {/* ---------------------------------------------------- */}
            {activeTab === 'SUMMARY' && (
                <div className="space-y-6 animate-in fade-in duration-300">

                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2">
                            <BarChart2 className="text-primary" /> กราฟแสดงสถิติการเข้าเรียนแยกตามห้อง
                        </h3>
                        {loading ? (
                            <div className="h-80 flex items-center justify-center text-gray-400">กำลังประมวลผลกราฟ...</div>
                        ) : filteredSummary.length === 0 ? (
                            <div className="h-80 flex items-center justify-center text-gray-400">ไม่มีข้อมูลแสดงสถิติในวันนี้</div>
                        ) : (
                            <div className="h-96 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                                        <Tooltip cursor={{ fill: '#F3F4F6' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                        <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                                        <Bar dataKey="มาเรียน" stackId="a" fill="#10B981" radius={[0, 0, 4, 4]} />
                                        <Bar dataKey="มาสาย" stackId="a" fill="#F59E0B" />
                                        <Bar dataKey="ลา" stackId="a" fill="#3B82F6" />
                                        <Bar dataKey="กิจกรรม" stackId="a" fill="#06B6D4" />
                                        <Bar dataKey="ขาด" stackId="a" fill="#EF4444" />
                                        <Bar dataKey="ยังไม่เช็ค" stackId="a" fill="#E5E7EB" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left whitespace-nowrap text-sm">
                                <thead className="bg-gray-50 border-b border-gray-100 text-gray-600">
                                    <tr>
                                        <th className="p-4 font-medium">ห้องเรียน</th>
                                        <th className="p-4 font-medium text-center">นักเรียนทั้งหมด</th>
                                        <th className="p-4 font-medium text-center text-green-700">มาเรียน</th>
                                        <th className="p-4 font-medium text-center text-orange-600">สาย</th>
                                        <th className="p-4 font-medium text-center text-blue-600">ลา</th>
                                        <th className="p-4 font-medium text-center text-cyan-600">กิจกรรม</th>
                                        <th className="p-4 font-medium text-center text-red-600">ขาด</th>
                                        <th className="p-4 font-medium text-center text-gray-500">ยังไม่เช็คชื่อ</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {loading ? (
                                        <tr><td colSpan={8} className="p-8 text-center text-gray-500">กำลังโหลดตารางสถิติ...</td></tr>
                                    ) : paginatedSummary.length === 0 ? (
                                        <tr><td colSpan={8} className="p-8 text-center text-gray-500">ไม่พบข้อมูลสรุป</td></tr>
                                    ) : (
                                        paginatedSummary.map((s) => (
                                            <tr key={s.classroomId} className="hover:bg-gray-50 transition-colors">
                                                <td className="p-4 font-bold text-gray-800 text-base">{s.classroomName}</td>
                                                <td className="p-4 text-center font-bold text-gray-600">{s.statistics.totalStudents}</td>
                                                <td className="p-4 text-center">
                                                    <span className="font-bold text-green-600">{s.statistics.present}</span>
                                                    <span className="text-xs text-gray-400 ml-1">({s.percentages.present}%)</span>
                                                </td>
                                                <td className="p-4 text-center">
                                                    <span className="font-bold text-orange-500">{s.statistics.late}</span>
                                                    <span className="text-xs text-gray-400 ml-1">({s.percentages.late}%)</span>
                                                </td>
                                                <td className="p-4 text-center">
                                                    <span className="font-bold text-blue-500">{s.statistics.leave}</span>
                                                    <span className="text-xs text-gray-400 ml-1">({s.percentages.leave}%)</span>
                                                </td>
                                                <td className="p-4 text-center">
                                                    <span className="font-bold text-cyan-600">{s.statistics.activity ?? 0}</span>
                                                    <span className="text-xs text-gray-400 ml-1">({s.percentages.activity ?? 0}%)</span>
                                                </td>
                                                <td className="p-4 text-center">
                                                    <span className="font-bold text-red-500">{s.statistics.absent}</span>
                                                    <span className="text-xs text-gray-400 ml-1">({s.percentages.absent}%)</span>
                                                </td>
                                                <td className="p-4 text-center">
                                                    {s.statistics.notChecked > 0 ? (
                                                        <span className="inline-flex items-center gap-1 font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                                                            <AlertTriangle size={12} className="text-yellow-500" /> {s.statistics.notChecked}
                                                        </span>
                                                    ) : (
                                                        <span className="text-green-500"><CheckCircle size={16} className="mx-auto" /></span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination (Summary) */}
                        {filteredSummary.length > 0 && (
                            <div className="p-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
                                <p className="text-sm text-gray-500">แสดง {paginatedSummary.length} จาก {filteredSummary.length} ห้อง</p>
                                <div className="flex items-center gap-2">
                                    <button
                                        disabled={summaryPage === 1}
                                        onClick={() => setSummaryPage(prev => prev - 1)}
                                        className="p-1.5 border border-gray-300 rounded hover:bg-white disabled:opacity-50 transition-colors"
                                    >
                                        <ChevronLeft size={18} />
                                    </button>
                                    <span className="text-sm font-bold text-gray-700">หน้า {summaryPage} / {totalSummaryPages || 1}</span>
                                    <button
                                        disabled={summaryPage === totalSummaryPages || totalSummaryPages === 0}
                                        onClick={() => setSummaryPage(prev => prev + 1)}
                                        className="p-1.5 border border-gray-300 rounded hover:bg-white disabled:opacity-50 transition-colors"
                                    >
                                        <ChevronRight size={18} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
