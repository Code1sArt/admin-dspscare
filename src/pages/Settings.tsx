import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
    Bell, Smartphone,
    Save, Shield, Calendar, Plus, Check, User, ChevronLeft, ChevronRight, X, Edit3
} from 'lucide-react';
import toast from 'react-hot-toast';
import Swal from 'sweetalert2';
import api from '../services/api';

interface Profile {
    id: string;
    firstName: string;
    lastName: string;
    role: string;
    citizenId: string;
    lineUserId: string | null;
}

interface Term {
    id: string;
    term: number;
    year: number;
    startDate?: string | null;
    endDate?: string | null;
    isActive: boolean;
}

interface TermForm {
    term: string;
    year: string;
    startDate: string;
    endDate: string;
    isActive: boolean;
}

const emptyTermForm: TermForm = {
    term: '',
    year: '',
    startDate: '',
    endDate: '',
    isActive: false
};

const toIsoDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const parseIsoDate = (date: string) => {
    const dateOnly = date.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
    if (dateOnly) {
        const [year, month, day] = dateOnly.split('-').map(Number);
        return new Date(year, month - 1, day);
    }
    return new Date(date);
};

const formatThaiDate = (date?: string | null) => {
    if (!date) return 'ยังไม่ได้เลือก';
    const parsedDate = parseIsoDate(date);
    if (Number.isNaN(parsedDate.getTime())) return 'วันที่ไม่ถูกต้อง';

    return new Intl.DateTimeFormat('th-TH', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    }).format(parsedDate);
};

interface DateRangeCalendarProps {
    startDate: string;
    endDate: string;
    onChange: (startDate: string, endDate: string) => void;
}

function DateRangeCalendar({ startDate, endDate, onChange }: DateRangeCalendarProps) {
    const initialDate = startDate ? parseIsoDate(startDate) : new Date();
    const [displayMonth, setDisplayMonth] = useState(
        new Date(initialDate.getFullYear(), initialDate.getMonth(), 1)
    );

    const firstDay = new Date(displayMonth.getFullYear(), displayMonth.getMonth(), 1).getDay();
    const daysInMonth = new Date(displayMonth.getFullYear(), displayMonth.getMonth() + 1, 0).getDate();
    const previousMonthDays = new Date(displayMonth.getFullYear(), displayMonth.getMonth(), 0).getDate();
    const cells = Array.from({ length: 42 }, (_, index) => {
        const dayOffset = index - firstDay + 1;
        return new Date(displayMonth.getFullYear(), displayMonth.getMonth(), dayOffset);
    });

    const handleSelectDate = (date: Date) => {
        const selected = toIsoDate(date);
        if (!startDate || endDate || selected < startDate) {
            onChange(selected, '');
            return;
        }
        onChange(startDate, selected);
    };

    const changeMonth = (offset: number) => {
        setDisplayMonth(current => new Date(current.getFullYear(), current.getMonth() + offset, 1));
    };

    return (
        <div className="rounded-2xl border border-indigo-100 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
                <button type="button" onClick={() => changeMonth(-1)} className="rounded-lg p-2 text-gray-500 hover:bg-indigo-50 hover:text-indigo-700" aria-label="เดือนก่อนหน้า">
                    <ChevronLeft size={20} />
                </button>
                <div className="font-bold text-gray-800">
                    {new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric' }).format(displayMonth)}
                </div>
                <button type="button" onClick={() => changeMonth(1)} className="rounded-lg p-2 text-gray-500 hover:bg-indigo-50 hover:text-indigo-700" aria-label="เดือนถัดไป">
                    <ChevronRight size={20} />
                </button>
            </div>

            <div className="grid grid-cols-7 text-center text-xs font-medium text-gray-400">
                {['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map(day => (
                    <div key={day} className="py-2">{day}</div>
                ))}
            </div>
            <div className="grid grid-cols-7 gap-y-1">
                {cells.map((date, index) => {
                    const isoDate = toIsoDate(date);
                    const isCurrentMonth = index >= firstDay && index < firstDay + daysInMonth;
                    const isStart = isoDate === startDate;
                    const isEnd = isoDate === endDate;
                    const isInRange = Boolean(startDate && endDate && isoDate > startDate && isoDate < endDate);
                    const isToday = isoDate === toIsoDate(new Date());
                    const dayNumber = isCurrentMonth
                        ? date.getDate()
                        : index < firstDay
                            ? previousMonthDays - firstDay + index + 1
                            : index - firstDay - daysInMonth + 1;

                    return (
                        <button
                            key={isoDate}
                            type="button"
                            onClick={() => handleSelectDate(date)}
                            className={`relative mx-auto flex h-10 w-10 items-center justify-center rounded-xl text-sm transition-colors
                                ${!isCurrentMonth ? 'text-gray-300' : 'text-gray-700 hover:bg-indigo-50'}
                                ${isInRange ? '!rounded-none bg-indigo-50 text-indigo-700' : ''}
                                ${isStart || isEnd ? '!bg-indigo-600 !text-white shadow-md shadow-indigo-200' : ''}
                                ${isToday && !isStart && !isEnd ? 'font-bold ring-1 ring-indigo-400' : ''}`}
                        >
                            {dayNumber}
                        </button>
                    );
                })}
            </div>
            <p className="mt-3 text-center text-xs text-gray-400">
                เลือกวันเปิดเรียนก่อน แล้วเลือกวันปิดเรียน
            </p>
        </div>
    );
}

export default function Settings() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(false);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [cutoffTime, setCutoffTime] = useState('08:30');
    const [terms, setTerms] = useState<Term[]>([]);
    const [showTermModal, setShowTermModal] = useState(false);
    const [termForm, setTermForm] = useState<TermForm>(emptyTermForm);
    const [editingTermId, setEditingTermId] = useState<string | null>(null);
    const [savingTerm, setSavingTerm] = useState(false);

    // State สำหรับการแก้ไขชื่อ-นามสกุล
    const [editName, setEditName] = useState({ firstName: '', lastName: '' });

    // 1. ตรวจสอบ Callback จาก LINE ตอนเปิดหน้าเว็บ
    useEffect(() => {
        const successParam = searchParams.get('success');
        const errorParam = searchParams.get('error');

        if (successParam === 'line_linked') {
            toast.success('เชื่อมต่อบัญชี LINE สำเร็จแล้ว!');
            // เคลียร์ URL ไม่ให้มี ?success=... ค้างอยู่
            navigate('/settings', { replace: true });
        } else if (errorParam) {
            toast.error('ไม่สามารถเชื่อมต่อบัญชี LINE ได้ กรุณาลองใหม่');
            navigate('/settings', { replace: true });
        }
    }, [searchParams, navigate]);

    // 2. ดึงข้อมูลทั้งหมดเมื่อโหลดหน้า
    useEffect(() => {
        fetchData();
    }, []);

    async function fetchData() {
        try {
            setLoading(true);
            const [profileRes, cutoffRes, termsRes] = await Promise.all([
                api.get('/users/me'),
                api.get('/settings/attendance-time'),
                api.get('/terms')
            ]);

            setProfile(profileRes.data);
            setEditName({
                firstName: profileRes.data.firstName,
                lastName: profileRes.data.lastName
            });
            setCutoffTime(cutoffRes.data.cutoffTime);
            setTerms(termsRes.data);
        } catch {
            toast.error('ไม่สามารถโหลดข้อมูลการตั้งค่าได้');
        } finally {
            setLoading(false);
        }
    }

    // --- ฟังก์ชันจัดการ Profile ---
    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!profile) return;

        const toastId = toast.loading('กำลังบันทึกข้อมูลส่วนตัว...');
        try {
            await api.patch(`/users/${profile.id}`, {
                firstName: editName.firstName,
                lastName: editName.lastName
            });
            toast.success('อัปเดตชื่อ-นามสกุลสำเร็จ', { id: toastId });
            fetchData();
        } catch {
            toast.error('บันทึกข้อมูลไม่สำเร็จ', { id: toastId });
        }
    };

    const handleChangePassword = async () => {
        const { value: formValues } = await Swal.fire({
            title: 'เปลี่ยนรหัสผ่าน',
            html: `
        <input id="old-pass" class="swal2-input text-sm" type="password" placeholder="รหัสผ่านเดิม">
        <input id="new-pass" class="swal2-input text-sm" type="password" placeholder="รหัสผ่านใหม่ (อย่างน้อย 6 ตัว)">
      `,
            showCancelButton: true,
            confirmButtonText: 'บันทึก',
            cancelButtonText: 'ยกเลิก',
            confirmButtonColor: '#1e3a8a',
            preConfirm: () => {
                const oldPass = (document.getElementById('old-pass') as HTMLInputElement).value;
                const newPass = (document.getElementById('new-pass') as HTMLInputElement).value;
                if (!newPass || newPass.length < 6) {
                    Swal.showValidationMessage('รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร');
                }
                return { oldPass, newPass };
            }
        });

        if (formValues && profile) {
            try {
                await api.patch(`/users/${profile.id}`, { password: formValues.newPass });
                toast.success('เปลี่ยนรหัสผ่านสำเร็จ! กรุณาใช้รหัสผ่านใหม่ในครั้งถัดไป');
            } catch {
                toast.error('เปลี่ยนรหัสผ่านไม่สำเร็จ');
            }
        }
    };

    const handleLinkLine = () => {
        if (profile?.lineUserId) {
            Swal.fire({
                title: 'ยกเลิกการเชื่อมต่อ LINE?',
                text: 'คุณจะไม่ได้รับการแจ้งเตือนผ่าน LINE อีกต่อไป',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#ef4444',
                confirmButtonText: 'ยกเลิกการเชื่อมต่อ',
                cancelButtonText: 'ปิด'
            }).then(async (result) => {
                if (result.isConfirmed) {
                    try {
                        await api.patch(`/users/${profile.id}`, { lineUserId: null });
                        toast.success('ยกเลิกการเชื่อมต่อเรียบร้อยแล้ว');
                        fetchData();
                    } catch {
                        toast.error('เกิดข้อผิดพลาด ไม่สามารถยกเลิกได้');
                    }
                }
            });
            return;
        }

        const clientID = '2009963963'; // เปลี่ยนเป็น Channel ID ของคุณที่ได้จาก LINE Developers
        const redirectURI = encodeURIComponent(import.meta.env.VITE_LINE_CALLBACK_URL);
        const state = profile?.id; // แนบ ID ของ User ไปกับ LINE ด้วย
        const scope = 'profile%20openid';

        const lineLoginURL = `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${clientID}&redirect_uri=${redirectURI}&state=${state}&scope=${scope}`;

        Swal.fire({
            title: 'เชื่อมต่อบัญชี LINE',
            text: 'ระบบจะพาคุณไปยังหน้าล็อกอินของ LINE เพื่อผูกบัญชีสำหรับรับแจ้งเตือน',
            icon: 'info',
            showCancelButton: true,
            confirmButtonColor: '#06C755',
            confirmButtonText: 'ไปหน้าล็อกอิน LINE',
            cancelButtonText: 'ยกเลิก'
        }).then((result) => {
            if (result.isConfirmed) {
                window.location.href = lineLoginURL;
            }
        });
    };

    // --- ฟังก์ชันจัดการระบบ ---
    const handleUpdateCutoff = async (e: React.FormEvent) => {
        e.preventDefault();
        const toastId = toast.loading('กำลังบันทึกเวลา...');
        try {
            await api.patch('/settings/attendance-time', { time: cutoffTime });
            toast.success('อัปเดตเวลาตัดยอดสำเร็จ', { id: toastId });
        } catch {
            toast.error('ไม่สามารถอัปเดตเวลาได้', { id: toastId });
        }
    };

    const handleAddTerm = () => {
        setEditingTermId(null);
        setTermForm(emptyTermForm);
        setShowTermModal(true);
    };

    const handleEditTerm = (term: Term) => {
        setEditingTermId(term.id);
        setTermForm({
            term: String(term.term),
            year: String(term.year),
            startDate: term.startDate ? term.startDate.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? '' : '',
            endDate: term.endDate ? term.endDate.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? '' : '',
            isActive: term.isActive
        });
        setShowTermModal(true);
    };

    const handleSubmitTerm = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!termForm.startDate || !termForm.endDate) {
            toast.error('กรุณาเลือกวันเปิดเรียนและวันปิดเรียน');
            return;
        }
        if (termForm.endDate < termForm.startDate) {
            toast.error('วันปิดเรียนต้องอยู่หลังวันเปิดเรียน');
            return;
        }

        setSavingTerm(true);
        try {
            const payload = {
                term: Number(termForm.term),
                year: Number(termForm.year),
                startDate: termForm.startDate,
                endDate: termForm.endDate,
                isActive: termForm.isActive
            };

            if (editingTermId) {
                await api.patch(`/terms/${editingTermId}`, payload);
                toast.success('แก้ไขภาคเรียนสำเร็จ');
            } else {
                await api.post('/terms', payload);
                toast.success('เพิ่มภาคเรียนสำเร็จ');
            }

            setShowTermModal(false);
            setEditingTermId(null);
            setTermForm(emptyTermForm);
            await fetchData();
        } catch {
            toast.error(editingTermId ? 'ไม่สามารถแก้ไขภาคเรียนได้' : 'ไม่สามารถเพิ่มภาคเรียนได้');
        } finally {
            setSavingTerm(false);
        }
    };

    const handleSetActiveTerm = async (id: string) => {
        try {
            await api.patch(`/terms/${id}`, { isActive: true });
            toast.success('เปลี่ยนภาคเรียนปัจจุบันแล้ว');
            fetchData();
        } catch {
            toast.error('ไม่สามารถเปลี่ยนภาคเรียนได้');
        }
    };

    if (loading && !profile) return <div className="p-12 text-center text-gray-500 font-medium">กำลังโหลดการตั้งค่า...</div>;
    if (!profile) return null;

    return (
        <div className="space-y-6 max-w-6xl mx-auto">
            <header>
                <h1 className="text-2xl font-bold text-gray-800">ตั้งค่าระบบและบัญชีผู้ใช้</h1>
                <p className="text-gray-500">จัดการข้อมูลส่วนตัว ภาคเรียน และการแจ้งเตือน</p>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* คอลัมน์ซ้าย: ข้อมูลส่วนตัว & LINE */}
                <div className="lg:col-span-1 space-y-6">

                    {/* แก้ไขข้อมูลส่วนตัว */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="p-6 border-b border-gray-50 flex items-center gap-2">
                            <User size={20} className="text-primary" />
                            <h2 className="font-bold text-gray-800">ข้อมูลส่วนตัว</h2>
                        </div>
                        <form onSubmit={handleUpdateProfile} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">รหัสประจำตัว (Username)</label>
                                <input
                                    type="text"
                                    value={profile.citizenId}
                                    disabled
                                    className="w-full border border-gray-200 bg-gray-50 text-gray-500 rounded-lg px-3 py-2 outline-none cursor-not-allowed"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อจริง</label>
                                <input
                                    type="text"
                                    required
                                    value={editName.firstName}
                                    onChange={(e) => setEditName({ ...editName, firstName: e.target.value })}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">นามสกุล</label>
                                <input
                                    type="text"
                                    required
                                    value={editName.lastName}
                                    onChange={(e) => setEditName({ ...editName, lastName: e.target.value })}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
                                />
                            </div>
                            <button type="submit" className="w-full bg-primary text-white py-2 rounded-lg font-bold hover:bg-blue-900 transition-colors flex items-center justify-center gap-2">
                                <Save size={18} /> บันทึกข้อมูลส่วนตัว
                            </button>
                        </form>
                    </div>

                    {/* การเชื่อมต่อ LINE */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="p-6 border-b border-gray-50 flex items-center gap-2">
                            <Bell size={20} className="text-green-600" />
                            <h2 className="font-bold text-gray-800">แจ้งเตือนผ่าน LINE</h2>
                        </div>
                        <div className="p-6 text-center">
                            <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-4 ${profile.lineUserId ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                                <Smartphone size={32} />
                            </div>
                            <h3 className="font-bold text-gray-800 mb-1">
                                {profile.lineUserId ? 'เชื่อมต่อแล้ว' : 'ยังไม่ได้เชื่อมต่อ'}
                            </h3>
                            <p className="text-xs text-gray-500 mb-6 px-2">
                                {profile.lineUserId
                                    ? 'คุณกำลังรับการแจ้งเตือนต่างๆ ของระบบผ่านแอปพลิเคชัน LINE'
                                    : 'ผูกบัญชีเพื่อรับการแจ้งเตือนรายงานสรุปและอัปเดตระบบผ่าน LINE'}
                            </p>
                            <button
                                onClick={handleLinkLine}
                                className={`w-full py-2 rounded-lg font-bold transition-colors ${profile.lineUserId
                                        ? 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                                        : 'bg-[#06C755] text-white hover:bg-green-600'
                                    }`}
                            >
                                {profile.lineUserId ? 'ยกเลิกการผูกบัญชี' : 'เชื่อมต่อบัญชี LINE'}
                            </button>
                        </div>
                    </div>

                    {/* ความปลอดภัย */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                        <button onClick={handleChangePassword} className="w-full flex items-center justify-center gap-2 text-gray-600 hover:text-primary font-bold text-sm transition-colors">
                            <Shield size={18} /> เปลี่ยนรหัสผ่านใหม่
                        </button>
                    </div>
                </div>

                {/* คอลัมน์ขวา: ตั้งค่าระบบ (เวลาเช็คชื่อ & ภาคเรียน) */}
                <div className="lg:col-span-2 space-y-6">

                    {/* ส่วนจัดการเวลาเช็คชื่อ */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="p-6 border-b border-gray-50">
                            <h2 className="font-bold text-gray-800 text-lg">เวลาตัดยอดเช็คชื่อ (Cut-off Time)</h2>
                            <p className="text-sm text-gray-500 mt-1">กำหนดเวลาช้าที่สุดที่ครูสามารถบันทึกหรือแก้ไขสถานะการมาเรียนของนักเรียนได้</p>
                        </div>
                        <form onSubmit={handleUpdateCutoff} className="p-6 bg-gray-50/30">
                            <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
                                <div className="w-full sm:w-auto">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">เวลา (รูปแบบ 24 ชม.)</label>
                                    <input
                                        type="time"
                                        required
                                        value={cutoffTime}
                                        onChange={(e) => setCutoffTime(e.target.value)}
                                        className="w-full sm:w-48 border border-gray-300 rounded-lg px-4 py-2.5 outline-none focus:ring-1 focus:ring-primary bg-white"
                                    />
                                </div>
                                <button type="submit" className="w-full sm:w-auto bg-primary text-white px-6 py-2.5 rounded-lg font-bold hover:bg-blue-900 transition-colors">
                                    บันทึกเวลา
                                </button>
                            </div>
                        </form>
                    </div>

                    {/* ส่วนจัดการภาคเรียน */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="p-6 border-b border-gray-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <div>
                                <h2 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                                    <Calendar size={20} className="text-indigo-600" /> ปีการศึกษาและภาคเรียน
                                </h2>
                                <p className="text-sm text-gray-500 mt-1">จัดการรอบการศึกษา ช่วงเปิด–ปิดเรียน และกำหนดภาคเรียนปัจจุบัน</p>
                            </div>
                            <button
                                onClick={handleAddTerm}
                                className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-4 py-2 rounded-lg transition-colors flex items-center gap-2 text-sm font-bold border border-indigo-100 w-full sm:w-auto justify-center"
                            >
                                <Plus size={16} /> เพิ่มภาคเรียน
                            </button>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                                    <tr>
                                        <th className="px-6 py-4 font-medium">ภาคเรียนที่</th>
                                        <th className="px-6 py-4 font-medium">ปีการศึกษา</th>
                                        <th className="px-6 py-4 font-medium">ช่วงเปิดเรียน</th>
                                        <th className="px-6 py-4 font-medium text-center">สถานะปัจจุบัน</th>
                                        <th className="px-6 py-4 font-medium text-right">การจัดการ</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {terms.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-8 text-center text-gray-500">ยังไม่มีข้อมูลภาคเรียน</td>
                                        </tr>
                                    ) : (
                                        terms.map((t) => (
                                            <tr key={t.id} className={`transition-colors hover:bg-gray-50 ${t.isActive ? 'bg-blue-50/30' : ''}`}>
                                                <td className="px-6 py-4 font-medium text-gray-800">{t.term}</td>
                                                <td className="px-6 py-4 text-gray-600">{t.year}</td>
                                                <td className="px-6 py-4 text-sm text-gray-600 whitespace-nowrap">
                                                    {t.startDate && t.endDate
                                                        ? `${formatThaiDate(t.startDate)} – ${formatThaiDate(t.endDate)}`
                                                        : <span className="text-gray-400">ไม่ได้ระบุ</span>}
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    {t.isActive ? (
                                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800 border border-green-200 shadow-sm">
                                                            <Check size={14} /> ใช้งานอยู่
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs text-gray-400">-</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex items-center justify-end gap-3">
                                                        <button
                                                            onClick={() => handleEditTerm(t)}
                                                            className="inline-flex items-center gap-1 text-sm font-bold text-gray-600 transition-colors hover:text-primary hover:underline"
                                                        >
                                                            <Edit3 size={15} /> แก้ไข
                                                        </button>
                                                    {!t.isActive && (
                                                        <button
                                                            onClick={() => handleSetActiveTerm(t.id)}
                                                            className="text-sm font-bold text-primary hover:text-blue-800 hover:underline transition-colors"
                                                        >
                                                            ตั้งเป็นปัจจุบัน
                                                        </button>
                                                    )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

            </div>

            {showTermModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onMouseDown={() => {
                    setShowTermModal(false);
                    setEditingTermId(null);
                }}>
                    <div className="max-h-[95vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-gray-50 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
                        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-gray-100 bg-white px-6 py-5">
                            <div>
                                <h2 className="text-xl font-bold text-gray-800">
                                    {editingTermId ? 'แก้ไขปีการศึกษา / ภาคเรียน' : 'เพิ่มปีการศึกษา / ภาคเรียน'}
                                </h2>
                                <p className="mt-1 text-sm text-gray-500">
                                    {editingTermId
                                        ? 'ปรับข้อมูลภาคเรียน ช่วงเปิด–ปิดเรียน และสถานะใช้งาน'
                                        : 'กำหนดข้อมูลภาคเรียนและช่วงเวลาที่เปิดทำการเรียนการสอน'}
                                </p>
                            </div>
                            <button type="button" onClick={() => {
                                setShowTermModal(false);
                                setEditingTermId(null);
                            }} className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="ปิด">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmitTerm} className="p-6">
                            <div className="grid gap-6 md:grid-cols-[0.8fr_1.2fr]">
                                <div className="space-y-4">
                                    <div>
                                        <label className="mb-2 block text-sm font-bold text-gray-700">ภาคเรียนที่</label>
                                        <input
                                            type="number"
                                            min="1"
                                            required
                                            value={termForm.term}
                                            onChange={(e) => setTermForm({ ...termForm, term: e.target.value })}
                                            placeholder="เช่น 1"
                                            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-2 block text-sm font-bold text-gray-700">ปีการศึกษา</label>
                                        <input
                                            type="number"
                                            min="2500"
                                            required
                                            value={termForm.year}
                                            onChange={(e) => setTermForm({ ...termForm, year: e.target.value })}
                                            placeholder="เช่น 2569"
                                            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                                        />
                                    </div>

                                    <div className="rounded-2xl bg-indigo-600 p-4 text-white">
                                        <div className="mb-3 flex items-center gap-2 text-sm font-bold">
                                            <Calendar size={17} /> ช่วงเวลาที่เลือก
                                        </div>
                                        <div className="space-y-3">
                                            <div className="rounded-xl bg-white/10 p-3">
                                                <div className="text-xs text-indigo-100">วันเปิดเรียน</div>
                                                <div className="mt-1 font-bold">{formatThaiDate(termForm.startDate)}</div>
                                            </div>
                                            <div className="rounded-xl bg-white/10 p-3">
                                                <div className="text-xs text-indigo-100">วันปิดเรียน</div>
                                                <div className="mt-1 font-bold">{formatThaiDate(termForm.endDate)}</div>
                                            </div>
                                        </div>
                                    </div>

                                    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
                                        <input
                                            type="checkbox"
                                            checked={termForm.isActive}
                                            onChange={(e) => setTermForm({ ...termForm, isActive: e.target.checked })}
                                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <span>
                                            <span className="block text-sm font-bold text-gray-700">ตั้งเป็นภาคเรียนปัจจุบัน</span>
                                            <span className="block text-xs text-gray-400">เปิดใช้งานภาคเรียนนี้ทันทีหลังบันทึก</span>
                                        </span>
                                    </label>
                                </div>

                                <DateRangeCalendar
                                    startDate={termForm.startDate}
                                    endDate={termForm.endDate}
                                    onChange={(startDate, endDate) => setTermForm({ ...termForm, startDate, endDate })}
                                />
                            </div>

                            <div className="mt-6 flex flex-col-reverse gap-3 border-t border-gray-200 pt-5 sm:flex-row sm:justify-end">
                                <button type="button" onClick={() => {
                                    setShowTermModal(false);
                                    setEditingTermId(null);
                                }} className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 font-bold text-gray-600 hover:bg-gray-50">
                                    ยกเลิก
                                </button>
                                <button type="submit" disabled={savingTerm} className="rounded-xl bg-indigo-600 px-6 py-2.5 font-bold text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60">
                                    {savingTerm ? 'กำลังบันทึก...' : editingTermId ? 'บันทึกการแก้ไข' : 'บันทึกภาคเรียน'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
