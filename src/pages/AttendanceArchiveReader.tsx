import { useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, FileUp, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { archiveDate, archiveDay, archiveErrorMessage, attendanceStatusLabels, attendanceTypeLabels, readAttendanceArchive } from '../utils/attendanceArchive';
import type { AttendanceArchive } from '../utils/attendanceArchive';

const PAGE_SIZE = 50;

export default function AttendanceArchiveReader() {
    const [archive, setArchive] = useState<AttendanceArchive | null>(null);
    const [filename, setFilename] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [query, setQuery] = useState('');
    const [termId, setTermId] = useState('');
    const [classroomId, setClassroomId] = useState('');
    const [type, setType] = useState('');
    const [status, setStatus] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [page, setPage] = useState(1);
    const inputRef = useRef<HTMLInputElement>(null);

    const resetFilters = () => {
        setQuery(''); setTermId(''); setClassroomId(''); setType(''); setStatus(''); setStartDate(''); setEndDate(''); setPage(1);
    };
    const openFile = async (file?: File) => {
        if (!file) return;
        setLoading(true); setError(''); setArchive(null); setFilename(''); resetFilters();
        try {
            const nextArchive = await readAttendanceArchive(file);
            setArchive(nextArchive); setFilename(file.name);
            toast.success('เปิดข้อมูลย้อนหลังแล้ว');
        } catch (cause) {
            setError(archiveErrorMessage(cause, 'เปิดไฟล์ไม่สำเร็จ'));
        } finally { setLoading(false); }
    };
    const closeFile = () => {
        setArchive(null); setFilename(''); setError(''); resetFilters();
        if (inputRef.current) inputRef.current.value = '';
    };

    const { terms, classrooms, rows } = useMemo(() => {
        const records = archive?.records ?? [];
        return {
            terms: [...new Map(records.map(record => [record.termId, record.term])).values()].sort((a, b) => b.year - a.year || b.term - a.term),
            classrooms: [...new Map(records.filter(record => !termId || String(record.termId) === termId).map(record => [String(record.classroomId ?? 'unknown'), record.classroom?.name ?? 'ไม่ระบุห้อง ณ วันบันทึก'])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'th', { numeric: true })),
            rows: records.map(record => ({ record, day: archiveDay(record.date), search: `${record.student.citizenId} ${record.student.firstName} ${record.student.lastName} ${record.recorder.firstName} ${record.recorder.lastName}`.toLocaleLowerCase('th') }))
        };
    }, [archive, termId]);

    const invalidRange = !!startDate && !!endDate && startDate > endDate;
    const filtered = useMemo(() => {
        if (invalidRange) return [];
        const search = query.trim().toLocaleLowerCase('th');
        return rows.filter(({ record, day, search: text }) =>
            (!search || text.includes(search)) && (!termId || String(record.termId) === termId) &&
            (!classroomId || String(record.classroomId ?? 'unknown') === classroomId) &&
            (!type || record.type === type) && (!status || record.status === status) &&
            (!startDate || day >= startDate) && (!endDate || day <= endDate)
        ).sort((a, b) => b.record.date.localeCompare(a.record.date) || a.record.student.firstName.localeCompare(b.record.student.firstName, 'th'));
    }, [rows, query, termId, classroomId, type, status, startDate, endDate, invalidRange]);
    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const currentPage = Math.min(page, pageCount);
    const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
    const counts = useMemo(() => {
        const result = { PRESENT: 0, ABSENT: 0, LATE: 0, LEAVE: 0, ACTIVITY: 0 };
        filtered.forEach(({ record }) => result[record.status]++);
        return result;
    }, [filtered]);
    const inputClass = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm';

    return <div className="mx-auto max-w-7xl space-y-6">
        <header>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-800"><BookOpen className="text-primary" /> อ่านข้อมูลเช็คชื่อเก่า</h1>
            <p className="mt-2 text-gray-500">เปิดไฟล์ SQL จากเมนูสำรองประวัติเพื่อค้นหาและดูข้อมูลย้อนหลัง</p>
        </header>
        <section className="space-y-4 rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <p className="text-sm leading-7 text-gray-600">อ่านไฟล์ในเบราว์เซอร์ ไม่มีการนำข้อมูลกลับเข้า DB และไม่เปลี่ยนคะแนน รองรับไฟล์ .sql ที่ส่งออกจากเมนูสำรองประวัติของระบบนี้ ขนาดไม่เกิน 200 MB</p>
            <label className="flex items-center gap-2 text-sm font-bold text-gray-700" htmlFor="historical-sql"><FileUp size={18} /> เลือกไฟล์ประวัติ</label>
            <input id="historical-sql" ref={inputRef} type="file" accept=".sql" disabled={loading} onChange={event => void openFile(event.target.files?.[0])} className="block w-full text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-green-50 file:px-4 file:py-2 file:font-bold file:text-primary" />
            {loading && <p role="status" className="text-sm text-gray-500">กำลังอ่านและตรวจสอบไฟล์...</p>}
            {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            {archive && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-green-50 p-4 text-sm text-green-900">
                <div className="min-w-0"><p className="break-all font-bold">{filename}</p><p className="mt-1">ทั้งหมด {archive.count.toLocaleString('th-TH')} รายการ · ส่งออก {archiveDate(archive.exportedAt)}</p></div>
                <button onClick={closeFile} className="flex items-center gap-1 rounded-lg px-3 py-2 font-bold hover:bg-green-100"><X size={16} /> ปิดไฟล์</button>
            </div>}
        </section>
        {archive && <>
            <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="space-y-2 text-sm font-medium text-gray-700"><span>ค้นหานักเรียน / ผู้บันทึก</span><input className={inputClass} type="search" placeholder="ชื่อ นามสกุล หรือรหัสนักเรียน" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></label>
                    <label className="space-y-2 text-sm font-medium text-gray-700"><span>ภาคเรียน</span><select aria-label="ภาคเรียน" className={inputClass} value={termId} onChange={event => { setTermId(event.target.value); setClassroomId(''); setPage(1); }}><option value="">ทุกภาคเรียน</option>{terms.map(term => <option key={term.id} value={term.id}>{term.term}/{term.year}</option>)}</select></label>
                    <label className="space-y-2 text-sm font-medium text-gray-700"><span>ห้องเรียน</span><select aria-label="ห้องเรียน" className={inputClass} value={classroomId} onChange={event => { setClassroomId(event.target.value); setPage(1); }}><option value="">ทุกห้อง</option>{classrooms.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
                    <label className="space-y-2 text-sm font-medium text-gray-700"><span>ประเภท</span><select aria-label="ประเภท" className={inputClass} value={type} onChange={event => { setType(event.target.value); setPage(1); }}><option value="">ทุกประเภท</option>{Object.entries(attendanceTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                    <label className="space-y-2 text-sm font-medium text-gray-700"><span>สถานะ</span><select aria-label="สถานะ" className={inputClass} value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">ทุกสถานะ</option>{Object.entries(attendanceStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                    <label className="space-y-2 text-sm font-medium text-gray-700"><span>ตั้งแต่วันที่</span><input className={inputClass} type="date" value={startDate} onChange={event => { setStartDate(event.target.value); setPage(1); }} /></label>
                    <label className="space-y-2 text-sm font-medium text-gray-700"><span>ถึงวันที่</span><input className={inputClass} type="date" value={endDate} onChange={event => { setEndDate(event.target.value); setPage(1); }} /></label>
                    <div className="flex items-end"><button onClick={resetFilters} className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50">ล้างตัวกรอง</button></div>
                </div>
                {invalidRange && <p role="alert" className="mt-3 text-sm text-red-600">วันเริ่มต้นต้องไม่อยู่หลังวันสิ้นสุด</p>}
            </section>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{Object.entries(counts).map(([key, count]) => <div key={key} className="rounded-xl border border-gray-100 bg-white p-4"><p className="text-sm text-gray-500">{attendanceStatusLabels[key as keyof typeof counts]}</p><p className="mt-1 text-2xl font-bold text-gray-800">{count.toLocaleString('th-TH')}</p></div>)}</div>
            <section className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
                <div className="border-b border-gray-100 p-4 text-sm text-gray-600">พบ {filtered.length.toLocaleString('th-TH')} รายการตามตัวกรอง · นับแยกตามประเภทการเช็คชื่อ · เวลาไทย</div>
                <div className="overflow-x-auto"><table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 text-gray-500"><tr>{['วันที่ / เวลา', 'นักเรียน', 'ห้อง / ภาคเรียน', 'ประเภท', 'สถานะ', 'ผู้บันทึก'].map(label => <th key={label} className="whitespace-nowrap px-5 py-4 font-medium">{label}</th>)}</tr></thead>
                    <tbody className="divide-y divide-gray-100">{visible.length ? visible.map(({ record }) => <tr key={record.id} className="hover:bg-gray-50">
                        <td className="whitespace-nowrap px-5 py-4">{archiveDate(record.date)}</td>
                        <td className="px-5 py-4"><p className="font-medium text-gray-800">{record.student.firstName} {record.student.lastName}</p><p className="mt-1 text-xs text-gray-500">{record.student.citizenId}</p></td>
                        <td className="px-5 py-4"><p>{record.classroom?.name ?? 'ไม่ระบุห้อง ณ วันบันทึก'}</p><p className="mt-1 text-xs text-gray-500">{record.term.term}/{record.term.year}</p></td>
                        <td className="whitespace-nowrap px-5 py-4">{attendanceTypeLabels[record.type]}</td>
                        <td className="px-5 py-4"><span className={`inline-block whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold ${record.status === 'ABSENT' ? 'bg-red-50 text-red-700' : record.status === 'LATE' ? 'bg-orange-50 text-orange-700' : 'bg-green-50 text-green-700'}`}>{attendanceStatusLabels[record.status]}</span></td>
                        <td className="px-5 py-4">{record.recorder.firstName} {record.recorder.lastName}</td>
                    </tr>) : <tr><td colSpan={6} className="p-12 text-center text-gray-500">ไม่พบประวัติที่ตรงกับตัวกรอง</td></tr>}</tbody>
                </table></div>
                <div className="flex items-center justify-between gap-3 border-t border-gray-100 p-4 text-sm text-gray-500">
                    <p>หน้า {currentPage.toLocaleString('th-TH')} / {pageCount.toLocaleString('th-TH')} · {PAGE_SIZE} รายการต่อหน้า</p>
                    <div className="flex gap-2"><button aria-label="หน้าก่อนหน้า" onClick={() => setPage(currentPage - 1)} disabled={currentPage <= 1} className="rounded-lg border p-2 disabled:opacity-30"><ChevronLeft size={18} /></button><button aria-label="หน้าถัดไป" onClick={() => setPage(currentPage + 1)} disabled={currentPage >= pageCount} className="rounded-lg border p-2 disabled:opacity-30"><ChevronRight size={18} /></button></div>
                </div>
            </section>
        </>}
    </div>;
}
