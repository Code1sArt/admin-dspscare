// Contract/load regression: build the adjacent behavior-service first.
// All database reads below are synthetic. No database or API is contacted.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createReadStream, createWriteStream, openAsBlob } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import { readAttendanceArchive } from '../src/utils/attendanceArchive.ts';

const require = createRequire(new URL('../../behavior-service/package.json', import.meta.url));
const { AttendanceArchiveService } = require('./dist/src/attendance/attendance-archive.service.js');
const count = 140000;
let queries = 0;
const mockPrisma = { attendanceRecord: { async findMany(args) {
    assert.equal(args.take, 1000);
    queries++;
    const start = args.cursor ? Number(args.cursor.id.slice(0, 8)) + 1 : 0;
    return Array.from({ length: Math.min(args.take, count - start) }, (_, offset) => {
        const index = start + offset;
        const id = `${String(index).padStart(8, '0')}-1111-4111-8111-111111111111`;
        const studentId = `student-${index % 3000}`;
        const recorderId = `teacher-${index % 50}`;
        return {
            id, type: index % 2 ? 'ASSEMBLY' : 'AREA', status: ['PRESENT', 'ABSENT', 'LATE', 'LEAVE', 'ACTIVITY'][index % 5],
            date: new Date('2026-01-05T01:00:00.000Z'), studentId, recorderId, termId: 1, classroomId: 10,
            student: { id: studentId, citizenId: `000${index % 3000}`, firstName: 'นักเรียนภาษาไทย'.repeat(5), lastName: 'นามสกุลทดสอบ'.repeat(4) },
            recorder: { id: recorderId, firstName: 'ครู', lastName: 'ทดสอบ' },
            classroom: { id: 10, name: 'ม.1/1' }, term: { id: 1, term: 1, year: 2569 },
        };
    });
} } };
const previousSecret = process.env.JWT_SECRET;
process.env.JWT_SECRET = 'synthetic-load-regression-only';
const directory = await mkdtemp(join(tmpdir(), 'dsps-archive-load-'));
try {
    const path = join(directory, 'large.sql.gz');
    const plainPath = join(directory, 'large.sql');
    const service = new AttendanceArchiveService(mockPrisma);
    await pipeline(await service.exportGzip(1), createWriteStream(path));
    assert.equal(queries, Math.ceil(count / 1000) + 1);
    await pipeline(createReadStream(path), createGunzip(), createWriteStream(plainPath));
    const sqlBytes = (await stat(plainPath)).size;
    assert.ok(sqlBytes > 200 * 1024 * 1024, `Fixture must exceed 200 MiB: ${sqlBytes}`);
    const file = new File([await openAsBlob(path)], 'large.sql.gz');
    const summary = await readAttendanceArchive(file, { summaryOnly: true });
    assert.equal(summary.count, count);
    assert.equal('records' in summary, false);
    assert.deepEqual(summary.terms, [{ id: 1, term: 1, year: 2569 }]);
    const plainSummary = await readAttendanceArchive(new File([await openAsBlob(plainPath)], 'large.sql'), { summaryOnly: true });
    assert.equal(plainSummary.receipt, summary.receipt);
    const archive = await readAttendanceArchive(file);
    assert.equal(archive.records.length, count);
    assert.equal(archive.receipt, summary.receipt);
    assert.equal(archive.records.at(-1).id, '00139999-1111-4111-8111-111111111111');
    console.log(JSON.stringify({ records: count, sqlMiB: +(sqlBytes / 1024 / 1024).toFixed(1), gzipMiB: +((await stat(path)).size / 1024 / 1024).toFixed(1), summaryVerified: true, plainSqlOver200MiBVerified: true, fullReaderVerified: true }));
} finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
    await rm(directory, { recursive: true, force: true });
}
