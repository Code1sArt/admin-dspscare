import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ArrowRight,
    CheckCircle2,
    Eye,
    EyeOff,
    Lock,
    ShieldCheck,
    Sparkles,
    User,
    Users
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';

export default function Login() {
    const [citizenId, setCitizenId] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        const toastId = toast.loading('กำลังตรวจสอบข้อมูล...');

        try {
            const response = await api.post('/auth/login', {
                citizenId,
                password,
            });

            if (response.data.user.role !== 'ADMIN') {
                toast.error('คุณไม่ใช่ผู้ดูแลระบบ', { id: toastId });
                return;
            }

            const token = response.data.access_token;
            localStorage.setItem('token', token);
            toast.success('เข้าสู่ระบบสำเร็จ!', { id: toastId });
            navigate('/');
        } catch (err: any) {
            const errorMsg = err.response?.data?.message || 'รหัสประจำตัวหรือรหัสผ่านไม่ถูกต้อง';
            toast.error(errorMsg, { id: toastId });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="relative min-h-screen overflow-hidden bg-[#063d1f] text-white">
            <div className="pointer-events-none absolute -left-28 -top-28 h-80 w-80 rounded-full bg-primary/45 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-32 right-0 h-96 w-96 rounded-full bg-secondary/25 blur-3xl" />
            <div className="pointer-events-none absolute left-1/2 top-1/3 h-72 w-72 -translate-x-1/2 rounded-full bg-white/10 blur-3xl" />

            <div className="relative grid min-h-screen lg:grid-cols-[minmax(0,1.08fr)_minmax(420px,0.92fr)]">
                <section className="flex flex-col justify-between px-6 py-8 sm:px-10 lg:px-14">
                    <div className="flex items-center gap-3">
                        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-white p-2 shadow-2xl shadow-black/20">
                            <img
                                src="/school-logo.png"
                                alt="โลโก้โรงเรียนเทพศิรินทร์พุแค สระบุรี"
                                className="h-full w-full object-contain"
                            />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-secondary">DSPS CARE</p>
                            <h1 className="text-xl font-black tracking-tight">โรงเรียนเทพศิรินทร์พุแค สระบุรี</h1>
                        </div>
                    </div>

                    <div className="my-12 max-w-3xl lg:my-0">
                        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-secondary/25 bg-secondary/15 px-4 py-2 text-sm font-bold text-yellow-50">
                            <Sparkles size={17} />
                            ระบบดูแลนักเรียนสำหรับผู้ดูแลระบบ
                        </div>

                        <h2 className="max-w-2xl text-3xl font-black leading-[1.35] sm:text-4xl xl:text-5xl xl:leading-[1.28]">
                            ดูแลข้อมูลโรงเรียน
                            <span className="block text-secondary">ให้เป็นระบบในที่เดียว</span>
                        </h2>

                        <div className="mt-7 rounded-3xl border border-secondary/25 bg-white/10 p-5 backdrop-blur">
                            <p className="text-lg font-black text-secondary">
                                “น สิยา โลกวฑฺฒโน ไม่ควรเป็นคนรกโลก”
                            </p>
                            <p className="mt-2 text-sm leading-6 text-yellow-50/75">
                                คติเตือนใจของชาวเทพศิรินทร์ สู่ระบบที่ช่วยให้การดูแลนักเรียนเป็นระเบียบ
                                ตรวจสอบได้ และพร้อมสนับสนุนครูในการพัฒนาผู้เรียนทุกวัน
                            </p>
                        </div>

                        <div className="mt-7 grid gap-3 sm:grid-cols-3">
                            <FeatureCard
                                icon={Users}
                                title="ข้อมูลนักเรียน"
                                detail="จัดการประวัติ ห้องเรียน และผู้ปกครอง"
                            />
                            <FeatureCard
                                icon={CheckCircle2}
                                title="เช็คชื่อ"
                                detail="ติดตามสถานะรายวันอย่างรวดเร็ว"
                            />
                            <FeatureCard
                                icon={ShieldCheck}
                                title="พฤติกรรม"
                                detail="สรุปคะแนนและเกณฑ์รางวัลแบบชัดเจน"
                            />
                        </div>
                    </div>

                    <p className="text-xs text-yellow-50/55">
                        © {new Date().getFullYear()} DSPS CARE · Admin Panel
                    </p>
                </section>

                <section className="flex items-center justify-center bg-[radial-gradient(circle_at_top,#ffffff_0%,#f8fbf2_45%,#eef5e8_100%)] px-5 py-10 text-gray-900 lg:rounded-l-[3rem] lg:px-10">
                    <div className="w-full max-w-md">
                        <div className="mb-6 text-center lg:hidden">
                            <img
                                src="/school-logo.png"
                                alt="โลโก้โรงเรียนเทพศิรินทร์พุแค สระบุรี"
                                className="mx-auto h-24 w-24 object-contain"
                            />
                        </div>

                        <div className="overflow-hidden rounded-[2rem] border border-primary/10 bg-white shadow-2xl shadow-green-950/10">
                            <div className="h-2 bg-gradient-to-r from-primary via-secondary to-primary" />
                            <div className="p-7 sm:p-8">
                                <div className="mb-8">
                                    <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                        <Lock size={23} />
                                    </div>
                                    <h2 className="text-3xl font-black text-gray-950">เข้าสู่ระบบ</h2>
                                    <p className="mt-2 text-sm leading-6 text-gray-500">
                                        สำหรับผู้ดูแลระบบ เพื่อจัดการข้อมูลนักเรียน ห้องเรียน การเช็คชื่อ
                                        และสรุปผลพฤติกรรมของโรงเรียน
                                    </p>
                                </div>

                                <form onSubmit={handleLogin} className="space-y-5">
                                    <div>
                                        <label className="mb-2 block text-sm font-bold text-gray-700">
                                            รหัสประจำตัว / บัตรประชาชน
                                        </label>
                                        <div className="relative">
                                            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                                                <User className="text-primary" size={20} />
                                            </div>
                                            <input
                                                type="text"
                                                value={citizenId}
                                                onChange={(e) => setCitizenId(e.target.value)}
                                                className="block w-full rounded-2xl border border-gray-200 bg-gray-50 py-3.5 pl-12 pr-4 font-semibold text-gray-800 outline-none transition focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/10"
                                                placeholder="กรอกรหัสประจำตัว"
                                                autoComplete="username"
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="mb-2 block text-sm font-bold text-gray-700">
                                            รหัสผ่าน
                                        </label>
                                        <div className="relative">
                                            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                                                <Lock className="text-primary" size={20} />
                                            </div>
                                            <input
                                                type={showPassword ? 'text' : 'password'}
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                className="block w-full rounded-2xl border border-gray-200 bg-gray-50 py-3.5 pl-12 pr-12 font-semibold text-gray-800 outline-none transition focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/10"
                                                placeholder="กรอกรหัสผ่าน"
                                                autoComplete="current-password"
                                                required
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(current => !current)}
                                                className="absolute inset-y-0 right-0 flex items-center pr-4 text-gray-400 transition hover:text-primary"
                                                aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                                            >
                                                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                            </button>
                                        </div>
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={isLoading}
                                        className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-4 font-black text-white shadow-xl shadow-green-900/15 transition hover:bg-[#0f6b32] disabled:cursor-not-allowed disabled:opacity-70"
                                    >
                                        {isLoading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบผู้ดูแล'}
                                        <ArrowRight className="transition group-hover:translate-x-1" size={19} />
                                    </button>
                                </form>

                                <div className="mt-6 rounded-2xl border border-secondary/40 bg-secondary/20 px-4 py-3 text-xs leading-5 text-[#6b5400]">
                                    ระบบนี้สงวนสิทธิ์สำหรับผู้ดูแลระบบโรงเรียนเท่านั้น
                                    หากไม่สามารถเข้าสู่ระบบได้ กรุณาติดต่อผู้ดูแลระบบหลัก
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}

function FeatureCard({
    icon: Icon,
    title,
    detail
}: {
    icon: React.ElementType;
    title: string;
    detail: string;
}) {
    return (
        <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-secondary/20 text-secondary">
                <Icon size={20} />
            </div>
            <p className="font-black text-white">{title}</p>
            <p className="mt-1 text-xs leading-5 text-yellow-50/65">{detail}</p>
        </div>
    );
}
