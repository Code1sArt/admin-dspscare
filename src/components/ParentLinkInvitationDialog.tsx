import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Dialog } from '@headlessui/react';
import { isAxiosError } from 'axios';
import { CheckCircle2, Copy, KeyRound, LoaderCircle, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import ParentClassroomLinkInvitationDialog from './ParentClassroomLinkInvitationDialog';

interface Invitation {
    invitationCode: string;
    expiresAt: string;
}

interface Props {
    onClose: () => void;
}

export default function ParentLinkInvitationDialog({ onClose }: Props) {
    const [mode, setMode] = useState<'single' | 'classroom'>('classroom');
    const [studentCitizenId, setStudentCitizenId] = useState('');
    const [issuing, setIssuing] = useState(false);
    const [invitation, setInvitation] = useState<Invitation | null>(null);
    const [error, setError] = useState('');
    const requestInFlight = useRef(false);
    const codeInput = useRef<HTMLTextAreaElement>(null);

    const handleIssue = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (requestInFlight.current || invitation) return;

        if (!studentCitizenId.trim()) {
            setError('กรุณากรอกรหัสนักเรียน');
            return;
        }

        requestInFlight.current = true;
        setIssuing(true);
        setError('');
        try {
            const response = await api.post<Invitation>('/parents/link-invitations', {
                studentCitizenId: studentCitizenId.trim(),
            });
            setInvitation(response.data);
            toast.success('ออกรหัสเชื่อมโยงสำเร็จ');
        } catch (error: unknown) {
            const message = isAxiosError(error) ? error.response?.data?.message : undefined;
            setError(
                Array.isArray(message) ? message.join(' / ')
                    : typeof message === 'string' ? message
                        : 'ออกรหัสไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง',
            );
        } finally {
            requestInFlight.current = false;
            setIssuing(false);
        }
    };

    const handleCopy = async () => {
        if (!invitation) return;
        try {
            await navigator.clipboard.writeText(invitation.invitationCode);
            toast.success('คัดลอกรหัสแล้ว');
        } catch {
            codeInput.current?.focus();
            codeInput.current?.select();
            toast.error('คัดลอกอัตโนมัติไม่ได้ กรุณาคัดลอกรหัสที่เลือกไว้ด้วยตนเอง');
        }
    };

    const closeDialog = () => {
        if (!requestInFlight.current) onClose();
    };

    if (mode === 'classroom') {
        return <ParentClassroomLinkInvitationDialog onClose={onClose} onSingle={() => setMode('single')} />;
    }

    return (
        <Dialog open onClose={closeDialog} className="relative z-50">
            <div className="fixed inset-0 bg-black/25 backdrop-blur-sm" aria-hidden="true" />
            <div className="fixed inset-0 overflow-y-auto">
                <div className="flex min-h-full items-center justify-center p-4">
                    <Dialog.Panel className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
                        <div className="flex items-start justify-between gap-4">
                            <Dialog.Title className="flex items-center gap-2 text-lg font-bold text-gray-900">
                                <KeyRound size={20} className="shrink-0 text-primary" /> ออกรหัสเชื่อมโยงผู้ปกครอง
                            </Dialog.Title>
                            <button type="button" onClick={closeDialog} disabled={issuing} aria-label="ปิดหน้าต่าง" className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-40">
                                <X size={20} />
                            </button>
                        </div>
                        <Dialog.Description className="mt-2 text-sm leading-6 text-gray-500">
                            ให้ผู้ปกครองนำรหัสไปกรอกตอนสมัครสมาชิก เพื่อเชื่อมบัญชีกับนักเรียนที่ระบุ
                        </Dialog.Description>

                        {invitation ? (
                            <div className="mt-5 space-y-4" role="status">
                                <div className="rounded-xl border border-green-200 bg-green-50 p-4">
                                    <p className="flex items-center gap-2 font-bold text-green-800"><CheckCircle2 size={18} /> ออกรหัสสำเร็จ</p>
                                    <dl className="mt-3 space-y-2 text-sm text-gray-700">
                                        <div><dt className="inline font-medium">รหัสนักเรียน: </dt><dd className="inline break-all">{studentCitizenId.trim()}</dd></div>
                                        <div><dt className="inline font-medium">หมดอายุ: </dt><dd className="inline"><time dateTime={invitation.expiresAt}>{new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(invitation.expiresAt))}</time> น. (เวลาไทย)</dd></div>
                                    </dl>
                                </div>
                                <div>
                                    <label htmlFor="parent-invitation-code" className="mb-2 block text-sm font-bold text-gray-700">รหัสเชื่อมโยงสำหรับผู้ปกครอง</label>
                                    <textarea ref={codeInput} id="parent-invitation-code" readOnly rows={2} value={invitation.invitationCode} spellCheck={false} className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 p-3 font-mono text-sm leading-6 text-gray-900 outline-none focus:ring-2 focus:ring-primary/30" />
                                    <button type="button" onClick={handleCopy} className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-white hover:bg-primary-dark">
                                        <Copy size={16} /> คัดลอกรหัส
                                    </button>
                                </div>
                                <p className="rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900">
                                    รหัสใช้ได้ครั้งเดียว ภายใน 24 ชั่วโมง และใช้ได้เฉพาะนักเรียนที่ระบุ กรุณาคัดลอกและส่งให้ผู้ปกครองของนักเรียนคนนี้โดยตรงก่อนปิดหน้าต่าง เพราะไม่สามารถเปิดดูรหัสนี้ย้อนหลังได้
                                </p>
                                <div className="flex justify-end">
                                    <button type="button" onClick={closeDialog} className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200">ปิดหน้าต่าง</button>
                                </div>
                            </div>
                        ) : (
                            <form onSubmit={handleIssue} className="mt-5 space-y-4">
                                <button type="button" disabled={issuing} onClick={() => setMode('classroom')} className="text-sm font-bold text-primary hover:underline disabled:opacity-40">เปลี่ยนเป็นออกทั้งห้อง</button>
                                <fieldset disabled={issuing} className="space-y-4 disabled:opacity-60">
                                    <div>
                                        <label htmlFor="invitation-student-id" className="mb-1 block text-sm font-medium text-gray-700">รหัสนักเรียน</label>
                                        <input id="invitation-student-id" required autoComplete="off" value={studentCitizenId} onChange={event => setStudentCitizenId(event.target.value)} placeholder="กรอกรหัสนักเรียนตามข้อมูลในระบบ" className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-primary/30" />
                                    </div>
                                </fieldset>
                                {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
                                <p className="text-xs leading-5 text-gray-500">รหัสมีอายุ 24 ชั่วโมง ใช้ได้ครั้งเดียว และจะแสดงให้คัดลอกหลังออกสำเร็จ</p>
                                <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
                                    <button type="button" onClick={closeDialog} disabled={issuing} className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-40">ยกเลิก</button>
                                    <button type="submit" disabled={issuing} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary-dark disabled:cursor-wait disabled:opacity-60">
                                        {issuing ? <LoaderCircle size={16} className="animate-spin" /> : <KeyRound size={16} />}
                                        {issuing ? 'กำลังออกรหัส...' : 'ออกรหัสเชื่อมโยง'}
                                    </button>
                                </div>
                            </form>
                        )}
                    </Dialog.Panel>
                </div>
            </div>
        </Dialog>
    );
}
