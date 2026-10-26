export const MAX_ARCHIVE_BYTES = 200 * 1024 * 1024;
export const attendanceStatusLabels = {
    PRESENT: 'มาเรียน', ABSENT: 'ขาด', LATE: 'สาย', LEAVE: 'ลา', ACTIVITY: 'กิจกรรม'
} as const;
export const attendanceTypeLabels = { ASSEMBLY: 'เข้าแถว', AREA: 'เขตพื้นที่' } as const;

export interface ArchiveRecord {
    id: string;
    type: keyof typeof attendanceTypeLabels;
    status: keyof typeof attendanceStatusLabels;
    date: string;
    studentId: string;
    recorderId: string;
    termId: number;
    classroomId: number | null;
    student: { id: string; citizenId: string; firstName: string; lastName: string };
    recorder: { id: string; firstName: string; lastName: string };
    classroom: { id: number; name: string } | null;
    term: { id: number; term: number; year: number };
}

export interface AttendanceArchive {
    format: 'dsps-attendance-archive';
    version: 1;
    exportedAt: string;
    count: number;
    digest: string;
    receipt: string;
    records: ArchiveRecord[];
}

const object = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;
const isoDate = (value: unknown): value is string =>
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
const person = (value: unknown) => object(value) &&
    ['id', 'firstName', 'lastName'].every(key => typeof value[key] === 'string');

function isRecord(value: unknown): value is ArchiveRecord {
    if (!object(value) || !object(value.term)) return false;
    return typeof value.id === 'string' && value.id.length > 0 &&
        typeof value.type === 'string' && Object.hasOwn(attendanceTypeLabels, value.type) &&
        typeof value.status === 'string' && Object.hasOwn(attendanceStatusLabels, value.status) &&
        isoDate(value.date) && typeof value.studentId === 'string' && typeof value.recorderId === 'string' &&
        integer(value.termId) && value.term.id === value.termId && integer(value.term.term) && integer(value.term.year) &&
        (value.classroomId === null || integer(value.classroomId)) &&
        (value.classroom === null || (object(value.classroom) && value.classroom.id === value.classroomId && typeof value.classroom.name === 'string')) &&
        person(value.student) && object(value.student) && typeof value.student.citizenId === 'string' && value.student.id === value.studentId &&
        person(value.recorder) && object(value.recorder) && value.recorder.id === value.recorderId;
}

export async function parseAttendanceArchive(sql: string): Promise<AttendanceArchive> {
    const begin = '-- DSPS_ARCHIVE_BEGIN';
    const end = '-- DSPS_ARCHIVE_END';
    const start = sql.indexOf(begin);
    const finish = sql.indexOf(end);
    if (start < 0 || finish <= start || sql.indexOf(begin, start + begin.length) !== -1 || sql.indexOf(end, finish + end.length) !== -1) {
        throw new Error('ไฟล์นี้ไม่ใช่ SQL ประวัติเช็คชื่อที่ส่งออกจากเมนูนี้');
    }
    const encoded = sql.slice(start + begin.length, finish).trim().split(/\r?\n/).map(line => {
        if (!/^-- [A-Za-z0-9+/=]+$/.test(line)) throw new Error('ข้อมูลสำรองในไฟล์ไม่สมบูรณ์');
        return line.slice(3);
    }).join('');
    let payload: unknown;
    try {
        const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
        payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch {
        throw new Error('ไม่สามารถอ่านข้อมูลในไฟล์ SQL ได้ ไฟล์อาจเสียหาย');
    }
    if (!object(payload) || payload.format !== 'dsps-attendance-archive' || payload.version !== 1 ||
        !isoDate(payload.exportedAt) || !integer(payload.count) ||
        typeof payload.digest !== 'string' || !/^[a-f0-9]{64}$/.test(payload.digest) ||
        typeof payload.receipt !== 'string' || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(payload.receipt) ||
        !Array.isArray(payload.records) || payload.records.length !== payload.count || !payload.records.every(isRecord) ||
        new Set(payload.records.map(record => record.id)).size !== payload.count) {
        throw new Error('โครงสร้างข้อมูลสำรองไม่ถูกต้อง หรือเป็นรูปแบบที่ยังไม่รองรับ');
    }
    if (!globalThis.crypto?.subtle) throw new Error('กรุณาเปิดระบบผ่าน HTTPS เพื่อให้ตรวจสอบไฟล์สำรองได้');
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload.records)));
    const digest = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
    if (digest !== payload.digest) throw new Error('ข้อมูลในไฟล์ไม่ตรงกับรหัสตรวจสอบ กรุณาใช้ไฟล์สำรองที่สมบูรณ์');
    return payload as unknown as AttendanceArchive;
}

export async function readAttendanceArchive(file: File) {
    if (!file.name.toLowerCase().endsWith('.sql')) throw new Error('กรุณาเลือกไฟล์ .sql');
    if (file.size > MAX_ARCHIVE_BYTES) throw new Error('รองรับไฟล์ขนาดไม่เกิน 200 MB กรุณาส่งออกแยกภาคเรียน');
    return parseAttendanceArchive(await file.text());
}

export const archiveErrorMessage = (error: unknown, fallback: string) => {
    if (object(error) && object(error.response)) {
        let data: unknown = error.response.data;
        if (typeof data === 'string') {
            try { data = JSON.parse(data); } catch { /* Use the fallback below for non-JSON responses. */ }
        }
        const message = object(data) ? data.message : undefined;
        if (typeof message === 'string') return message;
        if (Array.isArray(message) && typeof message[0] === 'string') return message[0];
    }
    return error instanceof Error ? error.message : fallback;
};

export const archiveDate = (date: string) => new Date(date).toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short'
});
// Attendance days follow Bangkok, including timestamps close to UTC midnight.
export const archiveDay = (date: string) => new Date(new Date(date).getTime() + 7 * 3600000).toISOString().slice(0, 10);
