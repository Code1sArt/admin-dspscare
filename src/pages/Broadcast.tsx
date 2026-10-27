import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { isAxiosError } from 'axios';
import { AlertCircle, Bell, CheckCircle2, DoorOpen, Loader2, Megaphone, Search, Send, Users, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';

type Audience = 'TEACHERS' | 'STUDENTS' | 'CLASSROOMS';
type Scope = 'ALL' | 'SELECTED';
interface Person { id: string; firstName: string; lastName: string; classroomId?: number }
interface Classroom { id: number; name: string }
interface Options {
    teachers: Person[];
    students: Person[];
    classrooms: Classroom[];
    inboxEnabled: boolean;
    pushEnabled: boolean;
}
interface Target {
    audience: Audience;
    scope: Scope;
    userIds: string[];
    classroomIds: number[];
}
interface Draft extends Target {
    requestId: string;
    title: string;
    body: string;
    recipientCount: number;
}
interface Preview { draft: Draft; audienceLabel: string }
interface SendResult {
    recipientCount: number;
    inboxCount: number;
    queuedDeviceCount: number;
    pushEnabled: boolean;
}

const audiences = [
    { value: 'TEACHERS', label: 'ครู', icon: Users, description: 'ครูทั้งหมดหรือเลือกเป็นรายบุคคล' },
    { value: 'STUDENTS', label: 'นักเรียน', icon: Users, description: 'นักเรียนในภาคเรียนปัจจุบัน' },
    { value: 'CLASSROOMS', label: 'ห้องเรียน', icon: DoorOpen, description: 'ส่งถึงนักเรียนในห้องที่เลือก' },
] as const;

function errorMessage(error: unknown, fallback: string) {
    if (isAxiosError(error)) {
        const message: unknown = error.response?.data?.message;
        if (typeof message === 'string') return message;
        if (Array.isArray(message) && message.every(item => typeof item === 'string')) return message.join('\n');
    }
    return fallback;
}

export default function Broadcast() {
    const [options, setOptions] = useState<Options | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [reloadKey, setReloadKey] = useState(0);
    const [audience, setAudience] = useState<Audience>('TEACHERS');
    const [scope, setScope] = useState<Scope>('ALL');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [search, setSearch] = useState('');
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [preview, setPreview] = useState<Preview | null>(null);
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<SendResult | null>(null);
    const [sendError, setSendError] = useState('');
    const busyRef = useRef(false);
    const retryDraft = useRef<{ fingerprint: string; requestId: string } | null>(null);
    const closeButton = useRef<HTMLButtonElement>(null);
    const previewButton = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const controller = new AbortController();
        api.get<Options>('/notifications/broadcasts/options', { signal: controller.signal })
            .then(response => { if (!controller.signal.aborted) setOptions(response.data); })
            .catch((error: unknown) => {
                if (!controller.signal.aborted) setLoadError(errorMessage(error, 'โหลดกลุ่มเป้าหมายไม่สำเร็จ'));
            })
            .finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, [reloadKey]);

    useEffect(() => {
        if (!preview) return;
        closeButton.current?.focus();
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !busyRef.current) {
                setPreview(null);
                previewButton.current?.focus();
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [preview]);

    const roomNames = new Map(options?.classrooms.map(room => [room.id, room.name]));
    const roomCounts = new Map<number, number>();
    options?.students.forEach(student => {
        if (student.classroomId !== undefined) roomCounts.set(student.classroomId, (roomCounts.get(student.classroomId) ?? 0) + 1);
    });
    const choices = audience === 'CLASSROOMS'
        ? (options?.classrooms ?? []).map(room => ({
            id: String(room.id), label: room.name,
            detail: `${roomCounts.get(room.id) ?? 0} คน`,
        }))
        : (audience === 'TEACHERS' ? options?.teachers ?? [] : options?.students ?? []).map(person => ({
            id: person.id, label: `${person.firstName} ${person.lastName}`,
            detail: person.classroomId ? roomNames.get(person.classroomId) ?? '' : 'ครู',
        }));
    const filteredChoices = choices.filter(choice => `${choice.label} ${choice.detail}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
    const selectedSet = new Set(selectedIds);
    const selectedRecipients = audience === 'CLASSROOMS'
        ? options?.students.filter(student => selectedSet.has(String(student.classroomId))).length ?? 0
        : scope === 'ALL' ? choices.length : selectedIds.length;
    const allFilteredSelected = filteredChoices.length > 0 && filteredChoices.every(choice => selectedSet.has(choice.id));

    function changeAudience(value: Audience) {
        setAudience(value);
        setScope(value === 'CLASSROOMS' ? 'SELECTED' : 'ALL');
        setSelectedIds([]);
        setSearch('');
    }

    function closePreview() {
        if (busyRef.current) return;
        setPreview(null);
        setSendError('');
        previewButton.current?.focus();
    }

    async function handlePreview(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (busyRef.current || !options?.inboxEnabled) return;
        if (!title.trim() || !body.trim()) return toast.error('กรุณากรอกหัวข้อและข้อความ');
        if (!selectedRecipients) return toast.error('กรุณาเลือกกลุ่มเป้าหมายที่มีผู้รับอย่างน้อย 1 คน');
        const target: Target = {
            audience, scope,
            userIds: audience !== 'CLASSROOMS' && scope === 'SELECTED' ? selectedIds : [],
            classroomIds: audience === 'CLASSROOMS' ? selectedIds.map(Number) : [],
        };
        busyRef.current = true;
        setBusy(true);
        setSendError('');
        try {
            const response = await api.post<{ recipientCount: number }>('/notifications/broadcasts/preview', target);
            const content = { ...target, title: title.trim(), body: body.trim() };
            const fingerprint = JSON.stringify(content);
            if (retryDraft.current?.fingerprint !== fingerprint) {
                retryDraft.current = { fingerprint, requestId: crypto.randomUUID() };
            }
            setPreview({
                draft: { ...content, requestId: retryDraft.current!.requestId, recipientCount: response.data.recipientCount },
                audienceLabel: audience === 'CLASSROOMS'
                    ? `นักเรียนในห้อง ${choices.filter(choice => selectedSet.has(choice.id)).map(choice => choice.label).join(', ')}`
                    : `${audience === 'TEACHERS' ? 'ครู' : 'นักเรียน'}${scope === 'ALL' ? 'ทั้งหมด' : 'ที่เลือก'}`,
            });
        } catch (error) {
            toast.error(errorMessage(error, 'ตรวจสอบจำนวนผู้รับไม่สำเร็จ กรุณาลองใหม่'));
        } finally {
            busyRef.current = false;
            setBusy(false);
        }
    }

    async function send() {
        if (!preview || busyRef.current) return;
        busyRef.current = true;
        setBusy(true);
        setSendError('');
        try {
            const response = await api.post<SendResult>('/notifications/broadcasts', preview.draft);
            setResult(response.data);
            setPreview(null);
            setTitle('');
            setBody('');
            retryDraft.current = null;
            toast.success('บันทึกข้อความแจ้งเตือนเรียบร้อยแล้ว');
            previewButton.current?.focus();
        } catch (error) {
            setSendError(errorMessage(error, 'ยังยืนยันผลการส่งไม่ได้ กรุณาลองอีกครั้ง ข้อความเดิมจะไม่ถูกบันทึกซ้ำ'));
        } finally {
            busyRef.current = false;
            setBusy(false);
        }
    }

    if (loading) return <div role="status" className="flex items-center justify-center gap-3 py-24 text-gray-500"><Loader2 className="animate-spin" size={24} />กำลังโหลดกลุ่มเป้าหมาย...</div>;
    if (loadError || !options) return (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
            <p>{loadError || 'ไม่พบข้อมูลกลุ่มเป้าหมาย'}</p>
            <button type="button" onClick={() => { setLoading(true); setLoadError(''); setReloadKey(value => value + 1); }} className="mt-3 rounded-lg border border-red-300 px-4 py-2 font-bold">ลองใหม่</button>
        </div>
    );

    return (
        <div className="mx-auto max-w-6xl space-y-6">
            <div className="flex items-start gap-4">
                <div className="rounded-2xl bg-primary/10 p-3 text-primary"><Megaphone size={28} /></div>
                <div><h1 className="text-2xl font-bold text-gray-900">Broadcast ข้อความ</h1><p className="mt-1 text-sm text-gray-500">ส่งข่าวสารและประกาศจากโรงเรียนไปยังผู้ใช้งานแอป DSPS CARE</p></div>
            </div>

            {!options.inboxEnabled && <div role="alert" className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"><AlertCircle className="shrink-0" size={20} />กล่องแจ้งเตือนในแอปยังไม่เปิดใช้งาน กรุณาเปิดบริการที่เซิร์ฟเวอร์ก่อนส่ง Broadcast</div>}
            {result && <div role="status" className="flex gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-green-800">
                <CheckCircle2 className="shrink-0" size={22} />
                <div className="flex-1"><p className="font-bold">บันทึกข้อความสำหรับผู้รับ {result.recipientCount.toLocaleString('th-TH')} คนแล้ว</p>
                    <p className="mt-1 text-sm">เพิ่มในกล่องแจ้งเตือน {result.inboxCount.toLocaleString('th-TH')} รายการ{result.pushEnabled ? ` · เข้าคิว Push ${result.queuedDeviceCount.toLocaleString('th-TH')} อุปกรณ์` : ' · ส่งผ่านกล่องแจ้งเตือนในแอป'}</p>
                    <p className="mt-1 text-xs">{result.pushEnabled ? 'ระบบจะทยอยส่ง Push ไปยังอุปกรณ์ที่ลงทะเบียนและยังเข้าสู่ระบบอยู่' : 'ขณะนี้ Push Notification ยังไม่เปิดใช้งาน'}</p>
                </div>
                <button type="button" aria-label="ปิดผลการส่ง" onClick={() => setResult(null)}><X size={18} /></button>
            </div>}

            <form onSubmit={handlePreview}>
                <fieldset disabled={busy || !!preview} className="grid min-w-0 gap-6 lg:grid-cols-[1.4fr_1fr]">
                    <div className="space-y-6">
                        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                            <h2 className="mb-4 text-lg font-bold text-gray-800">1. เลือกกลุ่มเป้าหมาย</h2>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" role="group" aria-label="กลุ่มเป้าหมาย">
                                {audiences.map(item => <button key={item.value} type="button" aria-pressed={audience === item.value} onClick={() => changeAudience(item.value)} className={`rounded-xl border p-4 text-left transition ${audience === item.value ? 'border-primary bg-primary/5 text-primary ring-1 ring-primary' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                                    <item.icon size={22} /><span className="mt-2 block font-bold">{item.label}</span><span className="mt-1 block text-xs leading-5">{item.description}</span>
                                </button>)}
                            </div>
                            {audience !== 'CLASSROOMS' && <div className="mt-5 flex flex-wrap gap-5 text-sm">
                                {(['ALL', 'SELECTED'] as const).map(value => <label key={value} className="flex cursor-pointer items-center gap-2"><input type="radio" name="scope" value={value} checked={scope === value} onChange={() => { setScope(value); setSelectedIds([]); setSearch(''); }} className="accent-primary" />{value === 'ALL' ? `ส่งถึง${audience === 'TEACHERS' ? 'ครู' : 'นักเรียน'}ทั้งหมด (${choices.length} คน)` : 'เลือกเป็นรายบุคคล'}</label>)}
                            </div>}
                            {(scope === 'SELECTED' || audience === 'CLASSROOMS') && <div className="mt-5 overflow-hidden rounded-xl border border-gray-200">
                                <div className="border-b border-gray-100 p-3">
                                    <label className="relative block"><Search className="absolute left-3 top-3 text-gray-400" size={17} /><span className="sr-only">ค้นหากลุ่มเป้าหมาย</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder={audience === 'CLASSROOMS' ? 'ค้นหาห้องเรียน...' : 'ค้นหาชื่อ หรือห้องเรียน...'} className="w-full rounded-lg border border-gray-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary" /></label>
                                    <div className="mt-3 flex items-center justify-between text-xs"><button type="button" disabled={!filteredChoices.length} onClick={() => setSelectedIds(previous => allFilteredSelected ? previous.filter(id => !filteredChoices.some(choice => choice.id === id)) : [...new Set([...previous, ...filteredChoices.map(choice => choice.id)])])} className="font-bold text-primary disabled:text-gray-400">{allFilteredSelected ? 'ยกเลิกผลค้นหาทั้งหมด' : 'เลือกผลค้นหาทั้งหมด'} ({filteredChoices.length})</button><button type="button" onClick={() => setSelectedIds([])} className="text-gray-500 hover:text-red-600">ล้างที่เลือก ({selectedIds.length})</button></div>
                                </div>
                                <div className="max-h-64 overflow-y-auto p-2">
                                    {filteredChoices.length === 0 ? <p className="py-8 text-center text-sm text-gray-400">ไม่พบ{audience === 'CLASSROOMS' ? 'ห้องเรียน' : 'รายชื่อ'}ที่ค้นหา</p> : filteredChoices.map(choice => <label key={choice.id} className="flex cursor-pointer items-center gap-3 rounded-lg p-3 hover:bg-gray-50"><input type="checkbox" checked={selectedSet.has(choice.id)} onChange={() => setSelectedIds(previous => previous.includes(choice.id) ? previous.filter(id => id !== choice.id) : [...previous, choice.id])} className="h-4 w-4 accent-primary" /><span className="flex-1 text-sm text-gray-700">{choice.label}</span><span className="text-xs text-gray-400">{choice.detail}</span></label>)}
                                </div>
                            </div>}
                            <p className="mt-4 text-xs leading-5 text-gray-500">ข้อมูลนักเรียนและห้องเรียนอ้างอิงภาคเรียนปัจจุบัน การเลือกห้องเรียนจะส่งถึงนักเรียนในห้องนั้น</p>
                        </section>

                        <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                            <h2 className="text-lg font-bold text-gray-800">2. เขียนข้อความ</h2>
                            <div><label htmlFor="broadcast-title" className="mb-2 block text-sm font-bold text-gray-700">หัวข้อประกาศ <span className="text-red-500">*</span></label><input id="broadcast-title" required maxLength={120} value={title} onChange={event => setTitle(event.target.value)} placeholder="เช่น แจ้งกำหนดการประชุมผู้ปกครอง" className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-primary focus:ring-1 focus:ring-primary" /><p className="mt-1 text-right text-xs text-gray-400">{title.length}/120</p></div>
                            <div><label htmlFor="broadcast-body" className="mb-2 block text-sm font-bold text-gray-700">ข้อความ <span className="text-red-500">*</span></label><textarea id="broadcast-body" required maxLength={1000} rows={6} value={body} onChange={event => setBody(event.target.value)} placeholder="พิมพ์รายละเอียดที่ต้องการแจ้งให้ผู้ใช้งานทราบ..." className="w-full resize-y rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-primary focus:ring-1 focus:ring-primary" /><p className="mt-1 text-right text-xs text-gray-400">{body.length}/1,000</p></div>
                        </section>
                    </div>

                    <aside className="space-y-5 lg:sticky lg:top-0 lg:self-start">
                        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                            <h2 className="font-bold text-gray-800">ตัวอย่างข้อความในแอป</h2>
                            <div className="mt-4 rounded-2xl border border-gray-100 bg-slate-50 p-4"><div className="mb-3 flex items-center gap-2 text-xs font-bold text-primary"><Bell size={16} /> DSPS CARE <span className="ml-auto font-normal text-gray-400">ตอนนี้</span></div><p className="break-words font-bold text-gray-800">{title.trim() || 'หัวข้อประกาศ'}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-gray-600">{body.trim() || 'ข้อความของคุณจะแสดงที่นี่'}</p></div>
                            <div className="mt-5 flex items-center justify-between border-t border-gray-100 pt-5"><span className="text-sm text-gray-500">จำนวนผู้รับที่เลือก</span><strong className="text-2xl text-primary">{selectedRecipients.toLocaleString('th-TH')} <span className="text-sm">คน</span></strong></div>
                            <p className="mt-3 text-xs leading-5 text-gray-500">{options.pushEnabled ? 'ส่งเข้ากล่องแจ้งเตือนในแอป พร้อมเข้าคิว Push ไปยังอุปกรณ์ที่พร้อมรับ' : 'ส่งเข้ากล่องแจ้งเตือนในแอป (Push ยังไม่เปิดใช้งาน)'}</p>
                            <button ref={previewButton} type="submit" disabled={busy || !options.inboxEnabled || !selectedRecipients || !title.trim() || !body.trim()} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-bold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40">{busy ? <Loader2 className="animate-spin" size={19} /> : <Send size={19} />}ตรวจสอบก่อนส่ง</button>
                        </div>
                    </aside>
                </fieldset>
            </form>

            {preview && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
                <div role="dialog" aria-modal="true" aria-labelledby="broadcast-confirm-title" onKeyDown={event => {
                    if (event.key !== 'Tab') return;
                    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
                    const first = buttons[0], last = buttons[buttons.length - 1];
                    if (!first) { event.preventDefault(); return; }
                    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
                    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
                }} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
                    <div className="flex items-center justify-between gap-3"><h2 id="broadcast-confirm-title" className="text-xl font-bold text-gray-900">ยืนยันส่ง Broadcast</h2><button ref={closeButton} type="button" disabled={busy} onClick={closePreview} aria-label="ปิดหน้าตรวจสอบ" className="rounded-lg p-2 text-gray-400 hover:bg-gray-100"><X size={22} /></button></div>
                    <p className="mt-4 break-words text-sm text-gray-600">{preview.audienceLabel}</p><p className="mt-2 font-bold text-primary">ผู้รับ {preview.draft.recipientCount.toLocaleString('th-TH')} คน</p>
                    <div className="mt-4 rounded-xl bg-gray-50 p-4"><p className="break-words font-bold text-gray-800">{preview.draft.title}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-gray-600">{preview.draft.body}</p></div>
                    {sendError && <p role="alert" className="mt-4 whitespace-pre-wrap rounded-lg bg-red-50 p-3 text-sm text-red-700">{sendError}</p>}
                    <div className="mt-6 flex justify-end gap-3"><button type="button" disabled={busy} onClick={closePreview} className="rounded-xl bg-gray-100 px-5 py-2.5 font-bold text-gray-600 disabled:opacity-50">กลับไปแก้ไข</button><button type="button" disabled={busy} onClick={send} className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 font-bold text-white disabled:opacity-50">{busy ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}{busy ? 'กำลังส่ง...' : 'ยืนยันส่งข้อความ'}</button></div>
                </div>
            </div>}
        </div>
    );
}
