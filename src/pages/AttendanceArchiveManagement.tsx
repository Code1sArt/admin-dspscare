import { useEffect, useRef, useState } from 'react';
import { Archive, Download, FileCheck2, LoaderCircle, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import Swal from 'sweetalert2';
import api from '../services/api';
import { archiveDate, archiveErrorMessage, archiveDownloadErrorMessage, readAttendanceArchive } from '../utils/attendanceArchive';
import type { ArchiveSummary } from '../utils/attendanceArchive';

interface Term { id: number; term: number; year: number; isActive: boolean; endDate: string }

export default function AttendanceArchiveManagement() {
    const [today] = useState(() => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10));
    const [terms, setTerms] = useState<Term[]>([]);
    const [termId, setTermId] = useState('');
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [progress, setProgress] = useState('');
    const [busy, setBusy] = useState(false);
    const [backup, setBackup] = useState<{ archive: ArchiveSummary; name: string } | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        let ignore = false;
        api.get<Term[]>('/terms').then(response => {
            if (!ignore) setTerms(response.data);
        }).catch(() => { if (!ignore) setLoadError(true); }).finally(() => { if (!ignore) setLoading(false); });
        return () => { ignore = true; };
    }, []);

    const exportSql = async () => {
        setBusy(true);
        try {
            setProgress('กำลังดาวน์โหลด SQL บีบอัด...');
            const response = await api.get<Blob>('/attendance/archive/export-gzip', {
                params: termId ? { termId } : {}, responseType: 'blob',
                onDownloadProgress: event => setProgress(`กำลังดาวน์โหลด ${(event.loaded / 1024 / 1024).toFixed(1)} MB...`)
            });
            const blob = response.data;
            const term = terms.find(item => String(item.id) === termId);
            const name = `dsps-attendance-${term ? `${term.year}-term-${term.term}` : 'all'}-${new Date().toISOString().slice(0, 10)}.sql.gz`;
            const archive = await readAttendanceArchive(new File([blob], name), {
                summaryOnly: true,
                onProgress: percent => setProgress(`กำลังตรวจสอบไฟล์สำรอง ${percent}%...`)
            });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = name;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
            setBackup(null);
            if (inputRef.current) inputRef.current.value = '';
            toast.success(`ส่งออก ${archive.count.toLocaleString('th-TH')} รายการแล้ว กรุณาเก็บไฟล์ให้เรียบร้อย`);
        } catch (error) {
            toast.error(await archiveDownloadErrorMessage(error, 'ส่งออกไม่สำเร็จ'));
        } finally { setBusy(false); setProgress(''); }
    };

    const verifyFile = async (file?: File) => {
        setBackup(null);
        if (!file) return;
        setBusy(true);
        try {
            const archive = await readAttendanceArchive(file, { summaryOnly: true, onProgress: percent => setProgress(`กำลังตรวจสอบไฟล์สำรอง ${percent}%...`) });
            setBackup({ archive, name: file.name });
            toast.success('อ่านไฟล์สำรองและตรวจสอบความสมบูรณ์แล้ว');
        } catch (error) {
            toast.error(archiveErrorMessage(error, 'อ่านไฟล์ไม่สำเร็จ'));
            if (inputRef.current) inputRef.current.value = '';
        } finally { setBusy(false); setProgress(''); }
    };

    const archivedTerms = backup?.archive.terms ?? [];
    const canPurge = !!backup && !loadError && !loading && archivedTerms.every(term => {
        const current = terms.find(item => item.id === term.id);
        return current && !current.isActive && current.endDate.slice(0, 10) < today;
    });

    const purge = async () => {
        if (!backup || !canPurge || busy) return;
        setBusy(true);
        try {
            const confirmation = await Swal.fire({
                title: 'ยืนยันล้างประวัติเช็คชื่อ',
                text: `ล้าง ${backup.archive.count.toLocaleString('th-TH')} รายการในภาคเรียนที่อยู่ในไฟล์สำรอง โดยเก็บคะแนนและประวัติคะแนนไว้ หลังล้างจะบันทึกเช็คชื่อในภาคเรียนเหล่านี้อีกไม่ได้ พิมพ์ “ล้างประวัติ” เพื่อยืนยัน`,
                icon: 'warning', input: 'text', inputPlaceholder: 'ล้างประวัติ',
                showCancelButton: true, confirmButtonText: 'ล้างประวัติ', cancelButtonText: 'ยกเลิก',
                confirmButtonColor: '#dc2626',
                inputValidator: value => value === 'ล้างประวัติ' ? undefined : 'กรุณาพิมพ์ ล้างประวัติ ให้ตรงกัน'
            });
            if (!confirmation.isConfirmed) return;
            const response = await api.post<{ deletedCount: number }>('/attendance/archive/purge', { receipt: backup.archive.receipt });
            setBackup(null);
            if (inputRef.current) inputRef.current.value = '';
            toast.success(`ล้างประวัติ ${response.data.deletedCount.toLocaleString('th-TH')} รายการแล้ว คะแนนยังคงเดิม`);
        } catch (error) {
            toast.error(archiveErrorMessage(error, 'ไม่สามารถล้างประวัติได้'));
        } finally { setBusy(false); setProgress(''); }
    };

    return <div className="mx-auto max-w-5xl space-y-6">
        <header>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-800"><Archive className="text-primary" /> สำรอง / ล้างประวัติเช็คชื่อ</h1>
            <p className="mt-2 text-gray-500">เก็บประวัติเข้าแถวและเขตพื้นที่เมื่อสิ้นเทอม พร้อมรักษาคะแนนสะสม</p>
        </header>
        <div className="rounded-xl border border-green-200 bg-green-50 p-5 text-sm leading-7 text-green-900">
            ล้างเฉพาะประวัติเช็คชื่อ รายการเพิ่ม–หักคะแนน บัญชีคะแนน และข้อมูลนักเรียนจะยังอยู่ครบ
            หลังล้าง ดูประวัติได้จาก <Link className="font-bold underline" to="/attendance-archive-reader">เมนูอ่านข้อมูลเก่า</Link> โดยเลือกไฟล์ SQL ที่เก็บไว้
        </div>
        <section className="space-y-4 rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-gray-800">1. ส่งออกประวัติเป็น SQL บีบอัด</h2>
            <p className="text-sm text-gray-500">รวมทุกสถานะ ทั้งเข้าแถวและเขตพื้นที่ พร้อมชื่อ ห้องเรียน ภาคเรียน และผู้บันทึก ณ วันที่ส่งออก</p>
            <label className="block text-sm font-medium text-gray-700" htmlFor="archive-term">ขอบเขตข้อมูล</label>
            <div className="flex flex-col gap-3 sm:flex-row">
                <select id="archive-term" value={termId} onChange={event => setTermId(event.target.value)} disabled={busy || loading || loadError} className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-4 py-3">
                    <option value="">ทุกภาคเรียน — ประวัติทั้งหมดที่ยังอยู่ในระบบ</option>
                    {terms.map(term => <option key={term.id} value={term.id}>ภาคเรียน {term.term}/{term.year}{term.isActive ? ' (ปัจจุบัน)' : ''}</option>)}
                </select>
                <button onClick={() => void exportSql()} disabled={busy || loading || loadError} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 font-bold text-white disabled:opacity-50"><Download size={18} /> ส่งออก SQL (.gz)</button>
            </div>
            {loading && <p role="status" className="text-sm text-gray-500">กำลังโหลดภาคเรียน...</p>}
            {loadError && <p role="alert" className="text-sm text-red-600">โหลดภาคเรียนไม่สำเร็จ กรุณาโหลดหน้านี้ใหม่</p>}
            <p className="text-xs leading-6 text-gray-500">ไฟล์นี้เปิดดูย้อนหลังได้จากเมนูอ่านข้อมูลเก่า เป็นไฟล์ .sql.gz ที่ลดขนาดด้วยการบีบอัด และตรวจสอบทีละส่วน รองรับข้อมูลทั้งภาคเรียนโดยไม่มีข้อจำกัด 200 MB เดิม</p>
        </section>
        <section className="space-y-4 rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-gray-800">2. เลือกไฟล์ที่ดาวน์โหลดเพื่อตรวจสอบก่อนล้าง</h2>
            <p className="text-sm text-gray-500">เลือกไฟล์ .sql.gz หรือ .sql จากเครื่องเพื่อยืนยันว่าเก็บไฟล์สำรองไว้แล้ว ระบบจะตรวจข้อมูลอีกครั้งก่อนลบ</p>
            <input ref={inputRef} aria-label="ไฟล์สำรองสำหรับตรวจสอบก่อนล้าง" type="file" accept=".sql,.sql.gz,.gz" disabled={busy} onChange={event => void verifyFile(event.target.files?.[0])} className="block w-full rounded-lg border border-dashed border-gray-300 p-4 text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-green-50 file:px-4 file:py-2 file:font-bold file:text-primary" />
            {backup && <div className="space-y-2 rounded-lg bg-slate-50 p-4 text-sm text-gray-700">
                <p className="flex items-center gap-2 font-bold"><FileCheck2 size={18} className="text-green-600" /> {backup.name}</p>
                <p>{backup.archive.count.toLocaleString('th-TH')} รายการ · ส่งออก {archiveDate(backup.archive.exportedAt)}</p>
                <p>ภาคเรียน {archivedTerms.map(term => `${term.term}/${term.year}`).join(', ')}</p>
                {!canPurge && <p role="status" className="text-amber-700">ล้างได้เมื่อทุกภาคเรียนในไฟล์สิ้นสุดแล้วและไม่ได้เป็นเทอมปัจจุบัน หากมีเทอมปัจจุบันปนอยู่ ให้ส่งออกเฉพาะเทอมเก่าที่ต้องการล้าง</p>}
            </div>}
        </section>
        <section className="space-y-4 rounded-xl border border-red-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-red-700">3. ล้างประวัติที่สำรองแล้ว</h2>
            <p className="text-sm leading-7 text-gray-600">เฉพาะผู้ดูแลระบบ และเฉพาะเทอมที่สิ้นสุดแล้ว หลังล้างจะล็อกการเช็คชื่อในเทอมนั้นเพื่อป้องกันการหักคะแนนซ้ำ หากข้อมูลเปลี่ยนหลังส่งออก ต้องส่งออกไฟล์ใหม่ก่อนล้าง</p>
            <button onClick={() => void purge()} disabled={!canPurge || busy} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-5 py-3 font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"><Trash2 size={18} /> ล้างประวัติโดยเก็บคะแนนไว้</button>
        </section>
        {busy && <p role="status" className="flex items-center gap-2 text-sm text-gray-500"><LoaderCircle size={16} className="animate-spin" /> {progress || 'กำลังดำเนินการ กรุณารอสักครู่...'}</p>}
    </div>;
}
