import { useEffect, useRef, useState } from 'react';
import { Dialog } from '@headlessui/react';
import { isAxiosError } from 'axios';
import { Copy, KeyRound, LoaderCircle, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';

interface Term { id: number; term: number; year: number; isActive: boolean }
interface Classroom { id: number; name: string; termId: number }
interface Invitation { invitationCode: string; expiresAt: string; classroom: { id: number; name: string } }

export default function ParentClassroomLinkInvitationDialog({ onClose }: { onClose: () => void }) {
    const [terms, setTerms] = useState<Term[]>([]);
    const [classrooms, setClassrooms] = useState<Classroom[]>([]);
    const [termId, setTermId] = useState('');
    const [classroomId, setClassroomId] = useState('');
    const [loading, setLoading] = useState(true);
    const [loadAttempt, setLoadAttempt] = useState(0);
    const [loadError, setLoadError] = useState('');
    const [error, setError] = useState('');
    const [issuing, setIssuing] = useState(false);
    const [invitation, setInvitation] = useState<Invitation | null>(null);
    const requestInFlight = useRef(false);
    const codeInput = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const controller = new AbortController();
        const load = async () => {
            setLoading(true);
            setLoadError('');
            try {
                const [termResponse, classroomResponse] = await Promise.all([
                    api.get<Term[]>('/terms', { signal: controller.signal }),
                    api.get<Classroom[]>('/classrooms', { signal: controller.signal }),
                ]);
                if (controller.signal.aborted) return;
                setTerms(termResponse.data);
                setClassrooms(classroomResponse.data);
                setTermId(current => current || String((termResponse.data.find(term => term.isActive) ?? termResponse.data[0])?.id ?? ''));
            } catch {
                if (!controller.signal.aborted) setLoadError('โหลดภาคเรียนและห้องเรียนไม่สำเร็จ');
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        };
        void load();
        return () => controller.abort();
    }, [loadAttempt]);

    const close = () => { if (!requestInFlight.current) onClose(); };
    const issue = async () => {
        if (requestInFlight.current || !classroomId || loading || loadError) return;
        requestInFlight.current = true;
        setIssuing(true);
        setError('');
        try {
            const response = await api.post<Invitation>('/parents/classroom-invitations', { classroomId: Number(classroomId) });
            setInvitation(response.data);
            toast.success('ออกรหัสห้องสำเร็จ');
        } catch (error: unknown) {
            const message: unknown = isAxiosError(error) ? error.response?.data?.message : undefined;
            setError(Array.isArray(message) ? message.join(' / ') : typeof message === 'string' ? message : 'ออกรหัสไม่สำเร็จ กรุณาลองอีกครั้ง');
        } finally {
            requestInFlight.current = false;
            setIssuing(false);
        }
    };
    const copy = async () => {
        if (!invitation) return;
        try {
            await navigator.clipboard.writeText(invitation.invitationCode);
            toast.success('คัดลอกรหัสห้องแล้ว');
        } catch {
            codeInput.current?.focus(); codeInput.current?.select();
            toast.error('กรุณาคัดลอกรหัสที่เลือกไว้ด้วยตนเอง');
        }
    };

    return (
        <Dialog open onClose={close} className="relative z-50">
            <div className="fixed inset-0 bg-black/25 backdrop-blur-sm" aria-hidden="true" />
            <div className="fixed inset-0 overflow-y-auto">
                <div className="flex min-h-full items-center justify-center p-4">
                    <Dialog.Panel className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
                        <div className="flex items-start justify-between gap-4">
                            <Dialog.Title className="flex items-center gap-2 text-lg font-bold text-gray-900"><KeyRound size={20} className="text-primary" /> ออกรหัสเชื่อมโยงทั้งห้อง</Dialog.Title>
                            <button type="button" onClick={close} disabled={issuing} aria-label="ปิดหน้าต่าง" className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-40"><X size={20} /></button>
                        </div>
                        <Dialog.Description className="mt-2 text-sm leading-6 text-gray-500">รหัสเดียว 5 ตัว ใช้ได้กับนักเรียนทั้งห้อง ผู้ปกครองนำไปเลือกนักเรียนในความดูแลได้หลายคน</Dialog.Description>
                        <form onSubmit={event => { event.preventDefault(); void issue(); }} className="mt-5 space-y-4">
                            <fieldset disabled={issuing || loading} className="grid gap-3 sm:grid-cols-2 disabled:opacity-60">
                                <div>
                                    <label htmlFor="classroom-invitation-term" className="mb-1 block text-sm font-medium text-gray-700">ภาคเรียน</label>
                                    <select id="classroom-invitation-term" required value={termId} onChange={event => { setTermId(event.target.value); setClassroomId(''); setInvitation(null); setError(''); }} className="w-full rounded-lg border border-gray-300 px-3 py-2">
                                        <option value="">เลือกภาคเรียน</option>
                                        {terms.map(term => <option key={term.id} value={term.id}>{term.term}/{term.year}{term.isActive ? ' (ปัจจุบัน)' : ''}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="classroom-invitation-room" className="mb-1 block text-sm font-medium text-gray-700">ห้องเรียน</label>
                                    <select id="classroom-invitation-room" required value={classroomId} onChange={event => { setClassroomId(event.target.value); setInvitation(null); setError(''); }} className="w-full rounded-lg border border-gray-300 px-3 py-2">
                                        <option value="">เลือกห้องเรียน</option>
                                        {classrooms.filter(room => String(room.termId) === termId).map(room => <option key={room.id} value={room.id}>{room.name}</option>)}
                                    </select>
                                </div>
                            </fieldset>
                            {loading && <p role="status" className="text-sm text-gray-500">กำลังโหลดข้อมูล...</p>}
                            {loadError && <p role="alert" className="text-sm text-red-700">{loadError} <button type="button" onClick={() => setLoadAttempt(value => value + 1)} className="font-bold underline">ลองใหม่</button></p>}
                            {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
                            {invitation && <div className="space-y-3 rounded-xl border border-green-200 bg-green-50 p-4" role="status">
                                <label htmlFor="classroom-link-code" className="block text-center text-sm font-bold text-green-800">รหัสห้อง {invitation.classroom.name}</label>
                                <input ref={codeInput} id="classroom-link-code" readOnly value={invitation.invitationCode} className="w-full rounded-lg border border-green-200 bg-white p-3 text-center font-mono text-4xl font-bold tracking-widest text-green-900" />
                                <button type="button" onClick={() => void copy()} className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-white"><Copy size={16} /> คัดลอกรหัสห้อง</button>
                                <p className="text-center text-xs text-green-800">หมดอายุ {new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(invitation.expiresAt))} น. (เวลาไทย)</p>
                            </div>}
                            <p className="rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900">รหัสประกอบด้วย a–z, A–Z และ 0–9 ต้องกรอกตัวพิมพ์เล็ก–ใหญ่ให้ตรงกัน ใช้ซ้ำได้ทั้งห้องภายใน 14 วันนับจากเวลาที่ออก กรุณาคัดลอกก่อนปิดหน้าต่าง การออกรหัสใหม่จะยกเลิกรหัสเดิมของห้องนี้</p>
                            <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4">
                                <button type="button" onClick={close} disabled={issuing} className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-40">ปิดหน้าต่าง</button>
                                <button type="submit" disabled={issuing || loading || !classroomId || Boolean(loadError)} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary-dark disabled:opacity-60">{issuing ? <LoaderCircle size={16} className="animate-spin" /> : <KeyRound size={16} />}{issuing ? 'กำลังออกรหัส...' : invitation ? 'ออกรหัสใหม่แทนรหัสเดิม' : 'ออกรหัสห้อง'}</button>
                            </div>
                        </form>
                    </Dialog.Panel>
                </div>
            </div>
        </Dialog>
    );
}
