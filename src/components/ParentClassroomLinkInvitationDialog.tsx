import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Dialog } from '@headlessui/react';
import { isAxiosError } from 'axios';
import { Copy, Download, KeyRound, LoaderCircle, X } from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx-js-style';
import api from '../services/api';
import { issueClassroomInvitations } from '../utils/parentLinkInvitations';
import type { ClassroomInvitationRow, ParentLinkInvitation } from '../utils/parentLinkInvitations';

interface Term { id: number; term: number; year: number; isActive: boolean }
interface Classroom { id: number; name: string; termId: number }
type Student = Pick<ClassroomInvitationRow, 'id' | 'citizenId' | 'firstName' | 'lastName'>;

const formatExpiry = (value: string) => new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok',
}).format(new Date(value));

const getErrorMessage = (error: unknown) => {
    const message: unknown = isAxiosError(error) ? error.response?.data?.message : undefined;
    return Array.isArray(message) ? message.join(' / ')
        : typeof message === 'string' ? message : 'ออกรหัสไม่สำเร็จ กรุณาลองอีกครั้ง';
};

export default function ParentClassroomLinkInvitationDialog({ onClose, onSingle }: {
    onClose: () => void;
    onSingle: () => void;
}) {
    const [terms, setTerms] = useState<Term[]>([]);
    const [classrooms, setClassrooms] = useState<Classroom[]>([]);
    const [termId, setTermId] = useState('');
    const [classroomId, setClassroomId] = useState('');
    const [rows, setRows] = useState<ClassroomInvitationRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingStudents, setLoadingStudents] = useState(false);
    const [loadAttempt, setLoadAttempt] = useState(0);
    const [initialError, setInitialError] = useState('');
    const [rosterError, setRosterError] = useState('');
    const [started, setStarted] = useState(false);
    const [issuing, setIssuing] = useState(false);
    const [processed, setProcessed] = useState(0);
    const [batchSize, setBatchSize] = useState(0);
    const requestInFlight = useRef(false);

    useEffect(() => {
        const controller = new AbortController();
        const load = async () => {
            setLoading(true);
            setInitialError('');
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
                if (!controller.signal.aborted) setInitialError('โหลดภาคเรียนและห้องเรียนไม่สำเร็จ');
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        };
        void load();
        return () => controller.abort();
    }, [loadAttempt]);

    useEffect(() => {
        if (!classroomId) return;
        const controller = new AbortController();
        const load = async () => {
            setLoadingStudents(true);
            setRosterError('');
            try {
                const response = await api.get<Student[]>('/students', {
                    params: { classroomId }, signal: controller.signal,
                });
                if (!controller.signal.aborted) {
                    setRows(response.data);
                }
            } catch {
                if (!controller.signal.aborted) setRosterError('โหลดรายชื่อนักเรียนไม่สำเร็จ');
            } finally {
                if (!controller.signal.aborted) setLoadingStudents(false);
            }
        };
        void load();
        return () => controller.abort();
    }, [classroomId, loadAttempt]);

    const successCount = rows.filter(row => row.invitation).length;
    const remaining = rows.filter(row => !row.invitation);
    const selectedClassroom = classrooms.find(room => String(room.id) === classroomId);
    const selectedTerm = terms.find(term => String(term.id) === termId);

    const closeDialog = () => {
        if (!requestInFlight.current) onClose();
    };

    const handleIssue = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (requestInFlight.current || loading || loadingStudents || initialError || rosterError || !remaining.length) return;
        requestInFlight.current = true;
        setIssuing(true);
        setStarted(true);
        setProcessed(0);
        setBatchSize(remaining.length);
        try {
            await issueClassroomInvitations(rows, async payload => {
                const response = await api.post<ParentLinkInvitation>('/parents/link-invitations', payload);
                return response.data;
            }, result => {
                setRows(current => current.map(row => row.id === result.id ? result : row));
                setProcessed(current => current + 1);
            }, getErrorMessage);
        } finally {
            requestInFlight.current = false;
            setIssuing(false);
        }
    };

    const handleDownload = () => {
        try {
            const workbook = XLSX.utils.book_new();
            const sheet = XLSX.utils.json_to_sheet(rows.map(row => ({
                'ภาคเรียน': selectedTerm ? `${selectedTerm.term}/${selectedTerm.year}` : '',
                'ห้องเรียน': selectedClassroom?.name ?? '',
                'รหัสนักเรียน': row.citizenId,
                'ชื่อ-นามสกุลนักเรียน': `${row.firstName} ${row.lastName}`,
                'รหัสเชื่อมโยง': row.invitation?.invitationCode ?? '',
                'หมดอายุ (เวลาไทย)': row.invitation ? formatExpiry(row.invitation.expiresAt) : '',
                'สถานะ': row.invitation ? 'สำเร็จ' : row.error ?? 'ยังไม่ออกรหัส',
            })));
            sheet['!cols'] = [14, 16, 20, 30, 52, 30, 45].map(wch => ({ wch }));
            XLSX.utils.book_append_sheet(workbook, sheet, 'รหัสเชื่อมโยง');
            const roomName = (selectedClassroom?.name ?? '').replace(/[\\/:*?"<>|]/g, '-');
            XLSX.writeFile(workbook, `รหัสเชื่อมโยงผู้ปกครอง_${roomName}.xlsx`);
        } catch {
            toast.error('ดาวน์โหลดไม่สำเร็จ กรุณาลองอีกครั้ง');
        }
    };

    const handleCopy = async (code: string, input: HTMLInputElement | null) => {
        try {
            await navigator.clipboard.writeText(code);
            toast.success('คัดลอกรหัสแล้ว');
        } catch {
            input?.focus();
            input?.select();
            toast.error('คัดลอกอัตโนมัติไม่ได้ กรุณาคัดลอกรหัสที่เลือกไว้ด้วยตนเอง');
        }
    };

    return (
        <Dialog open onClose={closeDialog} className="relative z-50">
            <div className="fixed inset-0 bg-black/25 backdrop-blur-sm" aria-hidden="true" />
            <div className="fixed inset-0 overflow-y-auto">
                <div className="flex min-h-full items-center justify-center p-4">
                    <Dialog.Panel className="w-full max-w-5xl rounded-2xl bg-white p-4 shadow-xl sm:p-6">
                        <div className="flex items-start justify-between gap-4">
                            <Dialog.Title className="flex items-center gap-2 text-lg font-bold text-gray-900"><KeyRound size={20} className="shrink-0 text-primary" /> ออกรหัสเชื่อมโยงทั้งห้อง</Dialog.Title>
                            <button type="button" onClick={closeDialog} disabled={issuing} aria-label="ปิดหน้าต่าง" className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-40"><X size={20} /></button>
                        </div>
                        <Dialog.Description className="mt-2 text-sm leading-6 text-gray-500">เลือกห้องเรียน แล้วกดออกรหัสให้นักเรียนทั้งห้องได้ทันที</Dialog.Description>
                        {!started && <button type="button" onClick={onSingle} className="mt-3 text-sm font-bold text-primary hover:underline">ออกเฉพาะรายคน</button>}
                        <form onSubmit={handleIssue} className="mt-5 space-y-4">
                            <fieldset disabled={started || loading} className="grid gap-3 sm:grid-cols-2 disabled:opacity-60">
                                <div>
                                    <label htmlFor="classroom-invitation-term" className="mb-1 block text-sm font-medium text-gray-700">ภาคเรียน</label>
                                    <select id="classroom-invitation-term" required value={termId} onChange={event => {
                                        setTermId(event.target.value); setClassroomId(''); setRows([]); setLoadingStudents(false); setRosterError('');
                                    }} className="w-full rounded-lg border border-gray-300 px-3 py-2">
                                        <option value="">เลือกภาคเรียน</option>
                                        {terms.map(term => <option key={term.id} value={term.id}>{term.term}/{term.year}{term.isActive ? ' (ปัจจุบัน)' : ''}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="classroom-invitation-room" className="mb-1 block text-sm font-medium text-gray-700">ห้องเรียน</label>
                                    <select id="classroom-invitation-room" required value={classroomId} onChange={event => {
                                        setClassroomId(event.target.value); setRows([]); setLoadingStudents(Boolean(event.target.value)); setRosterError('');
                                    }} className="w-full rounded-lg border border-gray-300 px-3 py-2">
                                        <option value="">เลือกห้องเรียน</option>
                                        {classrooms.filter(room => String(room.termId) === termId).map(room => <option key={room.id} value={room.id}>{room.name}</option>)}
                                    </select>
                                </div>
                            </fieldset>

                            {(loading || loadingStudents) ? <p role="status" className="flex items-center justify-center gap-2 p-6 text-sm text-gray-500"><LoaderCircle size={18} className="animate-spin" /> กำลังโหลดข้อมูล...</p> : rows.length > 0 ? (
                                <>
                                    <div className="max-h-[45vh] overflow-auto rounded-xl border border-gray-200">
                                        <table className="w-full text-left text-sm">
                                            <thead className="sticky top-0 bg-gray-50 text-gray-600"><tr><th className="p-3">นักเรียน ({rows.length} คน)</th><th className="p-3">รหัสเชื่อมโยง / สถานะ</th></tr></thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {rows.map(row => <tr key={row.id}>
                                                    <td className="min-w-44 p-3"><p className="font-medium text-gray-800">{row.firstName} {row.lastName}</p><p className="text-xs text-gray-500">{row.citizenId}</p></td>
                                                    <td className="min-w-64 p-3">
                                                        {row.invitation ? <div>
                                                            <div className="flex items-center gap-2"><input aria-label={`รหัสเชื่อมโยงของ ${row.firstName} ${row.lastName}`} readOnly value={row.invitation.invitationCode} className="w-44 rounded border border-green-200 bg-green-50 p-2 font-mono text-xs text-green-900" /><button type="button" aria-label={`คัดลอกรหัสของ ${row.firstName} ${row.lastName}`} onClick={event => void handleCopy(row.invitation!.invitationCode, event.currentTarget.previousElementSibling as HTMLInputElement)} className="rounded-lg p-2 text-primary hover:bg-primary/5"><Copy size={16} /></button></div>
                                                            <p className="mt-1 text-xs text-green-700">หมดอายุ {formatExpiry(row.invitation.expiresAt)} น. (เวลาไทย)</p>
                                                        </div> : row.error ? <p role="alert" className="text-xs text-red-700">{row.error}</p> : <span className="text-gray-400">{issuing ? 'กำลังดำเนินการ...' : 'ยังไม่ออกรหัส'}</span>}
                                                    </td>
                                                </tr>)}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            ) : classroomId && !rosterError ? <p className="p-6 text-center text-sm text-gray-500">ไม่พบนักเรียนในห้องนี้</p> : null}

                            {(initialError || rosterError) && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{initialError || rosterError}<button type="button" onClick={() => setLoadAttempt(current => current + 1)} className="ml-3 font-bold underline">โหลดข้อมูลอีกครั้ง</button></div>}
                            {started && <p role="status" aria-live="polite" className="text-sm font-medium text-gray-700">{issuing ? `กำลังออกรหัส ${processed}/${batchSize} รายการ · ` : ''}สำเร็จ {successCount}/{rows.length} คน{!issuing && remaining.length > 0 ? ` · ไม่สำเร็จ ${remaining.length} คน สามารถลองใหม่ได้` : ''}</p>}
                            <p className="rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900">แต่ละคนได้รับรหัสเฉพาะ ใช้ได้ครั้งเดียวภายใน 24 ชั่วโมง กรุณาดาวน์โหลดก่อนปิดหน้าต่าง เพราะเปิดดูรหัสย้อนหลังไม่ได้ และส่งให้ผู้ปกครองแต่ละคนเฉพาะรหัสของตนเอง</p>
                            <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4">
                                <button type="button" onClick={closeDialog} disabled={issuing} className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-40">ปิดหน้าต่าง</button>
                                {successCount > 0 && <button type="button" onClick={handleDownload} disabled={issuing} className="flex items-center gap-2 rounded-lg border border-primary/20 px-4 py-2 text-sm font-bold text-primary disabled:opacity-40"><Download size={16} /> ดาวน์โหลด Excel</button>}
                                {remaining.length > 0 && <button type="submit" disabled={issuing || loading || loadingStudents || Boolean(initialError || rosterError)} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary-dark disabled:opacity-60">{issuing ? <LoaderCircle size={16} className="animate-spin" /> : <KeyRound size={16} />}{issuing ? 'กำลังออกรหัส...' : started ? `ลองใหม่เฉพาะที่ไม่สำเร็จ (${remaining.length})` : `ออกรหัสทั้งห้อง (${rows.length} คน)`}</button>}
                            </div>
                        </form>
                    </Dialog.Panel>
                </div>
            </div>
        </Dialog>
    );
}
