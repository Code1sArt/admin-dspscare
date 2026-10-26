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
const receipt = value => `${Buffer.from(JSON.stringify({ version: value.version, termIds: (value.terms ?? [...new Map(value.records.map(item => [item.termId, item.term])).values()]).map(term => term.id).sort((a, b) => a - b), digest: value.digest, count: value.count })).toString('base64url')}.dGVzdHNpZ25hdHVyZQ`;
const payload = () => {
    const value = {
        format: 'dsps-attendance-archive', version: 1, exportedAt: '2026-10-26T00:00:00.000Z',
        count: 1, digest: createHash('sha256').update(JSON.stringify([record])).digest('hex'),
        records: [structuredClone(record)]
    };
    return { ...value, receipt: receipt(value) };
};
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
        data.receipt = receipt(data);
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
test('checks file type and reads legacy SQL files', async () => {
    await assert.rejects(readAttendanceArchive({ name: 'backup.txt', size: 10 }), /\.sql/);
    const file = new File([sql(payload())], 'backup.sql');
    assert.equal((await readAttendanceArchive(file)).count, 1);
    const summary = await readAttendanceArchive(file, { summaryOnly: true });
    assert.deepEqual(summary.terms, [record.term]);
    assert.equal('records' in summary, false);
});

const v2Sql = records => {
    const chunks = [];
    const lines = ['-- DSPS CARE attendance archive v2 (MySQL / MariaDB, UTF-8)', 'SET NAMES utf8mb4;', 'START TRANSACTION;'];
    for (let offset = 0; offset < records.length; offset += 1000) {
        const batch = records.slice(offset, offset + 1000);
        for (const item of batch) {
            lines.push(`INSERT INTO \`DSPSAttendanceArchive_v1\` (\`id\`, \`recordJson\`) VALUES (CONVERT(X'${Buffer.from(item.id).toString('hex')}' USING utf8mb4), CONVERT(X'${Buffer.from(JSON.stringify(item)).toString('hex')}' USING utf8mb4));`);
        }
        const chunk = { count: batch.length, digest: createHash('sha256').update(JSON.stringify(batch)).digest('hex') };
        chunks.push(chunk);
        lines.push(`-- DSPS_ARCHIVE_BATCH ${chunk.count} ${chunk.digest}`);
    }
    const manifest = { ...payload(), version: 2, count: records.length, digest: createHash('sha256').update(JSON.stringify(chunks)).digest('hex'), terms: [...new Map(records.map(item => [item.termId, item.term])).values()].sort((a, b) => a.id - b.id), chunks: chunks.length };
    delete manifest.records;
    manifest.receipt = receipt(manifest);
    lines.push('COMMIT;', `-- DSPS_ARCHIVE_V2_END ${Buffer.from(JSON.stringify(manifest)).toString('base64')}`);
    return lines.join('\n') + '\n';
};

test('reads v2 SQL and gzip across the database batch boundary with the same receipt', async () => {
    const { gzipSync } = await import('node:zlib');
    const records = Array.from({ length: 1001 }, (_, index) => ({ ...record, id: `record-${index}` }));
    const sql = v2Sql(records);
    for (const file of [new File([sql], 'backup.sql'), new File([gzipSync(sql)], 'backup.sql.gz')]) {
        const progress = [];
        const archive = await readAttendanceArchive(file, { onProgress: percent => progress.push(percent) });
        assert.equal(archive.version, 2);
        assert.deepEqual(archive.records, records);
        assert.equal(progress.at(-1), 100);
        const summary = await readAttendanceArchive(file, { summaryOnly: true });
        assert.equal('records' in summary, false);
        assert.equal(summary.count, 1001);
        assert.equal(summary.receipt, archive.receipt);
    }
});
test('v2 rejects incomplete downloads, changed records, mismatched SQL IDs and duplicate rows', async () => {
    const original = v2Sql([record]);
    const changedRecord = { ...record, status: 'LATE' };
    const hex = value => Buffer.from(JSON.stringify(value)).toString('hex');
    const cases = [
        original.split('-- DSPS_ARCHIVE_V2_END')[0],
        original.replace(hex(record), hex(changedRecord)),
        original.replace(Buffer.from(record.id).toString('hex'), Buffer.from('wrong-id').toString('hex')),
        v2Sql([record, record]),
        original + 'DELETE FROM User;\n',
    ];
    for (const sql of cases) await assert.rejects(readAttendanceArchive(new File([sql], 'backup.sql')));
});
test('rejects damaged gzip data and supports compressed legacy backups', async () => {
    const { gzipSync } = await import('node:zlib');
    await assert.rejects(readAttendanceArchive(new File(['not gzip'], 'backup.sql.gz')), /gzip/);
    const compressed = gzipSync(v2Sql([record]));
    await assert.rejects(readAttendanceArchive(new File([compressed.subarray(0, compressed.length - 8)], 'backup.sql.gz')));
    assert.equal((await readAttendanceArchive(new File([gzipSync(sql(payload()))], 'legacy.sql.gz'))).version, 1);
});
test('handles streaming lines split across arbitrary byte boundaries', async () => {
    class TinyChunksFile extends File {
        stream() {
            const bytes = Buffer.from(v2Sql([record]));
            let offset = 0;
            return new ReadableStream({ pull(controller) {
                if (offset >= bytes.length) { controller.close(); return; }
                controller.enqueue(new Uint8Array(bytes.subarray(offset, offset + 17)));
                offset += 17;
            } });
        }
    }
    const archive = await readAttendanceArchive(new TinyChunksFile([v2Sql([record])], 'tiny.sql'));
    assert.deepEqual(archive.records, [record]);
});


test('rejects a rewritten archive whose checksums no longer match its signed receipt', async () => {
    const legacy = payload();
    legacy.records[0].status = 'LATE';
    legacy.digest = createHash('sha256').update(JSON.stringify(legacy.records)).digest('hex');
    await assert.rejects(parseAttendanceArchive(sql(legacy)), /หลักฐาน/);
    const original = v2Sql([record]);
    const metadata = JSON.parse(Buffer.from(original.trim().split('-- DSPS_ARCHIVE_V2_END ')[1], 'base64').toString());
    const changed = v2Sql([{ ...record, status: 'LATE' }]);
    const changedMetadata = JSON.parse(Buffer.from(changed.trim().split('-- DSPS_ARCHIVE_V2_END ')[1], 'base64').toString());
    changedMetadata.receipt = metadata.receipt;
    const rewritten = changed.split('-- DSPS_ARCHIVE_V2_END ')[0] + '-- DSPS_ARCHIVE_V2_END ' + Buffer.from(JSON.stringify(changedMetadata)).toString('base64') + '\n';
    await assert.rejects(readAttendanceArchive(new File([rewritten], 'rewritten.sql')), /หลักฐาน/);
});


test('keeps every term in the streamed archive summary and the purge receipt', async () => {
    const records = [record, { ...record, id: 'record-2', termId: 2, term: { id: 2, term: 2, year: 2569 } }];
    const summary = await readAttendanceArchive(new File([v2Sql(records)], 'all.sql'), { summaryOnly: true });
    assert.deepEqual(summary.terms.map(term => term.id), [1, 2]);
    assert.equal(summary.count, 2);
});
