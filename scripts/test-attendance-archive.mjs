import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { parseAttendanceArchive, readAttendanceArchive, archiveDay } from '../src/utils/attendanceArchive.ts';

const record = {
    id: 'record-1', type: 'ASSEMBLY', status: 'ABSENT', date: '2026-10-25T18:00:00.000Z',
    studentId: 'student-1', recorderId: 'teacher-1', termId: 1, classroomId: 10,
    student: { id: 'student-1', citizenId: '00123', firstName: "ทดสอบ ' ; <script>😄</script>", lastName: 'นามสกุล\\\nใหม่' },
    recorder: { id: 'teacher-1', firstName: 'ครู', lastName: 'ทดสอบ' },
    classroom: { id: 10, name: 'ม.1/1' }, term: { id: 1, term: 1, year: 2569 },
};
const payload = () => ({
    format: 'dsps-attendance-archive', version: 1, exportedAt: '2026-10-26T00:00:00.000Z',
    count: 1, digest: createHash('sha256').update(JSON.stringify([record])).digest('hex'),
    receipt: 'cGF5bG9hZA.c2lnbmF0dXJl', records: [structuredClone(record)]
});
const sql = value => `-- DSPS_ARCHIVE_BEGIN\n${Buffer.from(JSON.stringify(value)).toString('base64').match(/.{1,120}/g).map(line => `-- ${line}`).join('\n')}\n-- DSPS_ARCHIVE_END\nCREATE TABLE test (id INT);`;

test('reads exported Unicode snapshots and preserves leading zero identifiers', async () => {
    const result = await parseAttendanceArchive(sql(payload()));
    assert.deepEqual(result.records[0], record);
    assert.equal(result.records[0].student.citizenId, '00123');
    assert.equal(archiveDay(record.date), '2026-10-26');
});
test('supports both attendance types, all statuses, missing historical rooms and CRLF files', async () => {
    for (const type of ['ASSEMBLY', 'AREA']) for (const status of ['PRESENT', 'ABSENT', 'LATE', 'LEAVE', 'ACTIVITY']) {
        const data = payload();
        Object.assign(data.records[0], { type, status, classroom: null, classroomId: null });
        data.digest = createHash('sha256').update(JSON.stringify(data.records)).digest('hex');
        assert.equal((await parseAttendanceArchive(sql(data).replaceAll('\n', '\r\n'))).records[0].status, status);
    }
});
test('rejects changed records even when file structure remains valid', async () => {
    const data = payload(); data.records[0].status = 'PRESENT';
    await assert.rejects(parseAttendanceArchive(sql(data)), /รหัสตรวจสอบ/);
});
test('rejects unknown SQL dumps, malformed base64 and duplicate metadata sections', async () => {
    await assert.rejects(parseAttendanceArchive('DROP TABLE AttendanceRecord;'), /ไม่ใช่ SQL/);
    await assert.rejects(parseAttendanceArchive('-- DSPS_ARCHIVE_BEGIN\n-- !!!\n-- DSPS_ARCHIVE_END'), /ไม่สมบูรณ์/);
    await assert.rejects(parseAttendanceArchive(sql(payload()) + sql(payload())), /ไม่ใช่ SQL/);
});
test('rejects malformed counts, versions, dates, enums and duplicate IDs', async () => {
    for (const mutate of [
        data => data.version = 2,
        data => data.count = 2,
        data => data.records[0].status = '__proto__',
        data => data.records[0].date = 'invalid',
        data => data.records[0].student = null,
        data => data.records[0].termId = 2,
        data => { data.count = 2; data.records.push(structuredClone(record)); },
    ]) {
        const data = payload(); mutate(data);
        await assert.rejects(parseAttendanceArchive(sql(data)), /โครงสร้าง/);
    }
});
test('checks file type and size before loading file content', async () => {
    await assert.rejects(readAttendanceArchive({ name: 'backup.txt', size: 10 }), /\.sql/);
    await assert.rejects(readAttendanceArchive({ name: 'backup.sql', size: 201 * 1024 * 1024 }), /200 MB/);
    const file = new File([sql(payload())], 'backup.sql');
    assert.equal((await readAttendanceArchive(file)).count, 1);
});
