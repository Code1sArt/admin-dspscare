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

export interface ArchiveSummary {
    format: 'dsps-attendance-archive';
    version: 1 | 2;
    exportedAt: string;
    count: number;
    digest: string;
    receipt: string;
    terms: { id: number; term: number; year: number }[];
}

export interface AttendanceArchive extends ArchiveSummary {
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

function receiptMatches(archive: ArchiveSummary) {
    try {
        const encoded = archive.receipt.split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
        const claims = decodeBase64Json(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '='));
        return object(claims) && claims.version === archive.version && claims.count === archive.count &&
            claims.digest === archive.digest && JSON.stringify(claims.termIds) === JSON.stringify(archive.terms.map(term => term.id).sort((a, b) => a - b));
    } catch { return false; }
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
    const archive = { ...payload, terms: [...new Map(payload.records.map(record => [record.termId, record.term])).values()].sort((a, b) => a.id - b.id) } as unknown as AttendanceArchive;
    if (!receiptMatches(archive)) throw new Error('หลักฐานการส่งออกไม่ตรงกับข้อมูลในไฟล์สำรอง');
    return archive;
}

type ReadOptions = { summaryOnly?: boolean; onProgress?: (percent: number) => void };
const sha256 = async (value: unknown) => {
    if (!globalThis.crypto?.subtle) throw new Error('กรุณาเปิดระบบผ่าน HTTPS เพื่อให้ตรวจสอบไฟล์สำรองได้');
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
    return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
};
const decodeBase64Json = (encoded: string): unknown => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(encoded), char => char.charCodeAt(0))));
const decodeHex = (hex: string) => {
    if (hex.length % 2) throw new Error('ข้อมูล SQL ไม่สมบูรณ์');
    const bytes = new Uint8Array(hex.length / 2);
    for (let index = 0; index < bytes.length; index++) bytes[index] = parseInt(hex.slice(index * 2, index * 2 + 2), 16);
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
};

// Never expand the whole SQL or gzip into a JavaScript string. Each generated
// INSERT is one line, and only 1,000 records are held for integrity checks.
async function* sqlLines(stream: ReadableStream<Uint8Array>) {
    const reader = stream.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let pending = '';
    try {
        while (true) {
            const { done, value } = await reader.read();
            pending += done ? decoder.decode() : decoder.decode(value, { stream: true });
            const parts = pending.split('\n');
            pending = parts.pop()!;
            for (const line of parts) yield line.replace(/\r$/, '');
            if (pending.length > 4 * 1024 * 1024) throw new Error('บรรทัดข้อมูลในไฟล์ SQL ไม่ถูกต้อง');
            if (done) break;
        }
        if (pending) yield pending.replace(/\r$/, '');
    } finally {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
    }
}

async function readV2(lines: AsyncGenerator<string>, options: ReadOptions): Promise<AttendanceArchive> {
    const records: ArchiveRecord[] = [];
    let batch: ArchiveRecord[] = [];
    const chunks: { count: number; digest: string }[] = [];
    const terms = new Map<number, ArchiveRecord['term']>();
    const ids = new Set<string>();
    let count = 0;
    let started = false;
    let committed = false;
    let manifest: ArchiveSummary | undefined;
    let shortBatch = false;
    for await (const line of lines) {
        if (!line.trim()) continue;
        if (manifest) throw new Error('พบข้อมูลเกินหลังจบไฟล์สำรอง');
        if (line === 'START TRANSACTION;' && !started) { started = true; continue; }
        if (line === 'COMMIT;' && started && !committed && batch.length === 0) { committed = true; continue; }
        if (line.startsWith('-- DSPS_ARCHIVE_V2_END ')) {
            const value = decodeBase64Json(line.slice('-- DSPS_ARCHIVE_V2_END '.length));
            const expectedTerms = [...terms.values()].sort((a, b) => a.id - b.id);
            if (!committed || !object(value) || value.format !== 'dsps-attendance-archive' || value.version !== 2 ||
                !isoDate(value.exportedAt) || !integer(value.count) || value.count !== count ||
                typeof value.digest !== 'string' || value.digest !== await sha256(chunks) ||
                value.chunks !== chunks.length || !chunks.length ||
                typeof value.receipt !== 'string' || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value.receipt) ||
                JSON.stringify(value.terms) !== JSON.stringify(expectedTerms)) throw new Error('ข้อมูลสำรองไม่ครบหรือรหัสตรวจสอบไม่ตรงกัน');
            manifest = value as unknown as ArchiveSummary;
            continue;
        }
        if (committed) throw new Error('ส่วนท้ายไฟล์ SQL ไม่ถูกต้อง');
        const marker = line.match(/^-- DSPS_ARCHIVE_BATCH ([1-9]\d{0,3}) ([a-f0-9]{64})$/);
        if (marker) {
            if (!started || !batch.length || Number(marker[1]) !== batch.length || marker[2] !== await sha256(batch)) throw new Error('ข้อมูลในไฟล์ไม่ตรงกับรหัสตรวจสอบ');
            chunks.push({ count: batch.length, digest: marker[2] });
            count += batch.length;
            shortBatch = batch.length < 1000;
            batch = [];
            continue;
        }
        const row = line.match(/^INSERT INTO `DSPSAttendanceArchive_v1` \(`id`, `recordJson`\) VALUES \(CONVERT\(X'([a-f0-9]+)' USING utf8mb4\), CONVERT\(X'([a-f0-9]+)' USING utf8mb4\)\);$/);
        if (row) {
            if (!started || shortBatch || batch.length >= 1000) throw new Error('ลำดับข้อมูลสำรองไม่ถูกต้อง');
            const record: unknown = JSON.parse(decodeHex(row[2]));
            if (!isRecord(record) || record.id !== decodeHex(row[1]) || ids.has(record.id)) throw new Error('โครงสร้างข้อมูลสำรองไม่ถูกต้องหรือมีรายการซ้ำ');
            ids.add(record.id);
            const previousTerm = terms.get(record.termId);
            if (previousTerm && JSON.stringify(previousTerm) !== JSON.stringify(record.term)) throw new Error('ข้อมูลภาคเรียนในไฟล์ไม่ตรงกัน');
            terms.set(record.termId, record.term);
            batch.push(record);
            if (!options.summaryOnly) records.push(record);
            continue;
        }
        // Only the fixed, harmless preamble is accepted; SQL is never executed.
        if (!started && (line === '-- Historical snapshots only. Does not modify live attendance or scores.' ||
            line === 'SET NAMES utf8mb4;' || line === 'CREATE TABLE IF NOT EXISTS `DSPSAttendanceArchive_v1` (`id` VARCHAR(191) NOT NULL PRIMARY KEY, `recordJson` LONGTEXT NOT NULL) CHARACTER SET utf8mb4;')) continue;
        throw new Error('รูปแบบไฟล์ SQL ไม่ถูกต้อง');
    }
    if (!manifest || batch.length) throw new Error('ไฟล์สำรองไม่ครบ ดาวน์โหลดอาจถูกขัดจังหวะ กรุณาส่งออกใหม่');
    if (!receiptMatches(manifest)) throw new Error('หลักฐานการส่งออกไม่ตรงกับข้อมูลในไฟล์สำรอง');
    return { ...manifest, records };
}

export function readAttendanceArchive(file: File, options: ReadOptions & { summaryOnly: true }): Promise<ArchiveSummary>;
export function readAttendanceArchive(file: File, options?: ReadOptions & { summaryOnly?: false }): Promise<AttendanceArchive>;
export async function readAttendanceArchive(file: File, options: ReadOptions = {}): Promise<AttendanceArchive | ArchiveSummary> {
    if (!/\.sql(?:\.gz)?$/i.test(file.name)) throw new Error('กรุณาเลือกไฟล์ .sql หรือ .sql.gz');
    const signature = new Uint8Array(await file.slice(0, 2).arrayBuffer());
    const gzip = signature[0] === 0x1f && signature[1] === 0x8b;
    if (/\.gz$/i.test(file.name) && !gzip) throw new Error('ไฟล์ .sql.gz ไม่ใช่ข้อมูล gzip ที่สมบูรณ์');
    let readBytes = 0;
    let lastPercent = -1;
    let stream = file.stream().pipeThrough(new TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>({
        transform(value, controller) {
            readBytes += value.byteLength;
            const percent = Math.floor(readBytes / Math.max(1, file.size) * 100);
            if (percent !== lastPercent) { lastPercent = percent; options.onProgress?.(percent); }
            controller.enqueue(value);
        }
    }));
    if (gzip) {
        if (typeof DecompressionStream === 'undefined') throw new Error('เบราว์เซอร์นี้ยังไม่รองรับไฟล์บีบอัด กรุณาอัปเดตเบราว์เซอร์หรือแตกไฟล์ .gz ก่อนเลือกไฟล์ .sql');
        stream = stream.pipeThrough(new DecompressionStream('gzip'));
    }
    const lines = sqlLines(stream);
    const first = await lines.next();
    try {
        let archive: AttendanceArchive;
        if (first.value === '-- DSPS CARE attendance archive v2 (MySQL / MariaDB, UTF-8)') {
            archive = await readV2(lines, options);
        } else {
            // Legacy v1 files remain readable. New exports use streaming v2.
            const legacy = [first.value ?? ''];
            for await (const line of lines) legacy.push(line);
            archive = await parseAttendanceArchive(legacy.join('\n'));
        }
        options.onProgress?.(100);
        if (options.summaryOnly) {
            return { format: archive.format, version: archive.version, exportedAt: archive.exportedAt, count: archive.count, digest: archive.digest, receipt: archive.receipt, terms: archive.terms };
        }
        return archive;
    } finally { await lines.return(undefined); }
}

export const archiveDownloadErrorMessage = async (error: unknown, fallback: string) => {
    if (object(error) && object(error.response) && error.response.data instanceof Blob && error.response.data.size < 1024 * 1024) {
        return archiveErrorMessage({ response: { data: await error.response.data.text() } }, fallback);
    }
    return archiveErrorMessage(error, fallback);
};

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
