import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import {
    Bell,
    CalendarDays,
    ChevronRight,
    ClipboardCheck,
    DoorOpen,
    GraduationCap,
    Home,
    ListChecks,
    LogOut,
    Settings,
    ShieldCheck,
    Sparkles,
    UserCheck,
    UserPlus,
    Users,
    type LucideIcon
} from 'lucide-react';
import Swal from 'sweetalert2';
import toast from 'react-hot-toast';

interface MenuItem {
    name: string;
    path: string;
    icon: LucideIcon;
}

interface MenuSection {
    title: string;
    items: MenuItem[];
}

const menuSections: MenuSection[] = [
    {
        title: 'ภาพรวม',
        items: [
            { name: 'แดชบอร์ด', path: '/', icon: Home },
            { name: 'สรุปผล', path: '/school-summary', icon: GraduationCap }
        ]
    },
    {
        title: 'จัดการข้อมูลหลัก',
        items: [
            { name: 'จัดการนักเรียน', path: '/students', icon: Users },
            { name: 'จัดการบุคลากร', path: '/teachers', icon: UserCheck },
            { name: 'จัดการผู้ปกครอง', path: '/parents', icon: UserPlus },
            { name: 'จัดการห้องเรียน', path: '/classrooms', icon: DoorOpen },
            { name: 'เลื่อนชั้น / เปลี่ยนเทอม', path: '/promotions', icon: GraduationCap }
        ]
    },
    {
        title: 'งานกิจการนักเรียน',
        items: [
            { name: 'ประเภทคะแนน', path: '/point-categories', icon: ListChecks },
            { name: 'คะแนนพฤติกรรม', path: '/behavior-points', icon: ShieldCheck },
            { name: 'รายงานการเช็คชื่อ', path: '/attendance-reports', icon: ClipboardCheck },
            { name: 'ติดตามการเช็คชื่อ', path: '/attendance-monitoring', icon: Bell },
            { name: 'ปฏิทินการศึกษา', path: '/academic-calendar', icon: CalendarDays }
        ]
    },
    {
        title: 'ระบบ',
        items: [
            { name: 'ตั้งค่าระบบ', path: '/settings', icon: Settings }
        ]
    }
];

const allMenuItems = menuSections.flatMap(section => section.items);

const getActiveMenu = (pathname: string) =>
    allMenuItems.find(item =>
        item.path === '/'
            ? pathname === '/'
            : pathname === item.path || pathname.startsWith(`${item.path}/`)
    ) ?? allMenuItems[0];

export default function AdminLayout() {
    const location = useLocation();
    const navigate = useNavigate();
    const activeMenu = getActiveMenu(location.pathname);

    const handleLogout = () => {
        Swal.fire({
            title: 'ต้องการออกจากระบบ?',
            text: 'คุณต้องเข้าสู่ระบบใหม่ในครั้งถัดไป',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#1B813E',
            cancelButtonColor: '#ef4444',
            confirmButtonText: 'ใช่, ออกจากระบบ',
            cancelButtonText: 'ยกเลิก',
            customClass: {
                popup: 'font-prompt'
            }
        }).then((result) => {
            if (result.isConfirmed) {
                localStorage.removeItem('token');
                navigate('/login');
                toast.success('ออกจากระบบเรียบร้อยแล้ว');
            }
        });
    };

    return (
        <div className="flex h-screen overflow-hidden bg-slate-100">
            <aside className="relative flex w-[292px] shrink-0 flex-col overflow-hidden bg-[#063d1f] text-white shadow-2xl">
                <div className="pointer-events-none absolute -left-20 -top-20 h-56 w-56 rounded-full bg-[#1B813E]/45 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-24 right-0 h-64 w-64 rounded-full bg-secondary/20 blur-3xl" />

                <div className="relative border-b border-white/10 p-6">
                    <Link to="/" className="group flex items-center gap-3">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white p-1.5 shadow-lg shadow-black/20 transition group-hover:scale-105">
                            <img
                                src="/school-logo.png"
                                alt="โลโก้โรงเรียน"
                                className="h-full w-full object-contain"
                            />
                        </div>
                        <div>
                            <h1 className="text-xl font-black tracking-tight">DSPS CARE</h1>
                            <p className="mt-0.5 text-xs font-medium text-yellow-100/70">โรงเรียนเทพศิรินทร์พุแค สระบุรี</p>
                        </div>
                    </Link>

                    <div className="mt-5 rounded-2xl border border-secondary/30 bg-[#1B813E]/35 p-4">
                        <div className="flex items-start gap-3">
                            <div className="mt-0.5 rounded-xl bg-secondary/20 p-2 text-secondary">
                                <Sparkles size={18} />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-yellow-50">พร้อมดูแลระบบ</p>
                                <p className="mt-1 text-xs leading-5 text-yellow-50/70">
                                    เมนูทั้งหมดถูกจัดกลุ่มให้เข้าถึงงานประจำวันได้เร็วขึ้น
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <nav className="relative flex-1 space-y-6 overflow-y-auto px-4 py-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {menuSections.map(section => (
                        <div key={section.title}>
                            <p className="mb-2 px-3 text-[11px] font-black uppercase tracking-[0.16em] text-yellow-100/45">
                                {section.title}
                            </p>
                            <div className="space-y-1.5">
                                {section.items.map(item => (
                                    <SidebarLink
                                        key={item.path}
                                        item={item}
                                        isActive={activeMenu.path === item.path}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                </nav>

                <div className="relative border-t border-white/10 p-4">
                    <button
                        type="button"
                        onClick={handleLogout}
                        className="group flex w-full items-center justify-between rounded-2xl border border-rose-400/10 bg-rose-500/10 px-4 py-3 text-left text-rose-100 transition hover:border-rose-300/30 hover:bg-rose-500/20"
                    >
                        <span className="flex items-center gap-3">
                            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-400/15 text-rose-200">
                                <LogOut size={19} />
                            </span>
                            <span>
                                <span className="block text-sm font-bold">ออกจากระบบ</span>
                                <span className="block text-xs text-rose-100/60">Sign out safely</span>
                            </span>
                        </span>
                        <ChevronRight className="text-rose-100/40 transition group-hover:translate-x-1 group-hover:text-rose-100" size={18} />
                    </button>
                </div>
            </aside>

            <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
                <header className="flex h-20 shrink-0 items-center justify-between border-b border-gray-200/80 bg-white/90 px-8 backdrop-blur">
                    <div>
                        <div className="flex items-center gap-2 text-xs font-bold text-gray-400">
                            <span>ผู้ดูแลระบบ</span>
                            <ChevronRight size={14} />
                            <span className="text-primary">{activeMenu.name}</span>
                        </div>
                        <h2 className="mt-1 text-xl font-black text-gray-900">{activeMenu.name}</h2>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="hidden text-right sm:block">
                            <p className="text-sm font-bold text-gray-800">Admin</p>
                            <p className="text-xs text-gray-400">DSPS CARE</p>
                        </div>
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white p-1.5 shadow-lg shadow-green-100 ring-1 ring-primary/10">
                            <img
                                src="/school-logo.png"
                                alt="โลโก้โรงเรียน"
                                className="h-full w-full object-contain"
                            />
                        </div>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-8">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}

function SidebarLink({ item, isActive }: { item: MenuItem; isActive: boolean }) {
    const Icon = item.icon;

    return (
        <Link
            to={item.path}
            className={`group relative flex items-center justify-between rounded-2xl px-3 py-2.5 transition ${
                isActive
                    ? 'bg-secondary text-[#063d1f] shadow-xl shadow-black/20'
                    : 'text-green-50/80 hover:bg-white/10 hover:text-white'
            }`}
        >
            <span className="flex min-w-0 items-center gap-3">
                <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition ${
                        isActive
                            ? 'bg-[#0b5f30] text-secondary shadow-lg shadow-yellow-200/10'
                            : 'bg-white/5 text-yellow-50/55 group-hover:bg-white/10 group-hover:text-secondary'
                    }`}
                >
                    <Icon size={19} />
                </span>
                <span className="truncate text-sm font-bold">{item.name}</span>
            </span>
            <ChevronRight
                className={`shrink-0 transition ${
                    isActive
                        ? 'text-[#0b5f30]'
                        : 'text-yellow-50/25 opacity-0 group-hover:translate-x-1 group-hover:text-yellow-50/70 group-hover:opacity-100'
                }`}
                size={17}
            />
        </Link>
    );
}
