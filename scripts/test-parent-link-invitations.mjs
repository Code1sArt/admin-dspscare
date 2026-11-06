import assert from 'node:assert/strict';
import test from 'node:test';
import { issueClassroomInvitations } from '../src/utils/parentLinkInvitations.ts';

const row = id => ({ id, citizenId: `student-${id}`, firstName: id, lastName: 'Test' });
const invitation = id => ({ invitationCode: `code-${id}`, expiresAt: '2026-11-07T10:00:00.000Z' });

test('issues without parent IDs, preserves successful codes and retries only failed students', async () => {
    let rows = [row('1'), row('2'), row('3')];
    const requests = [];
    const update = result => { rows = rows.map(item => item.id === result.id ? result : item); };
    await issueClassroomInvitations(rows, async payload => {
        requests.push(payload);
        if (payload.studentCitizenId === 'student-2') throw new Error('temporary failure');
        return invitation(payload.studentCitizenId);
    }, update, error => error.message);

    assert.equal(rows.filter(item => item.invitation).length, 2);
    assert.equal(rows[1].error, 'temporary failure');
    assert.deepEqual(requests, ['1', '2', '3'].map(id => ({ studentCitizenId: `student-${id}` })));
    const originalCodes = [rows[0].invitation, rows[2].invitation];

    await issueClassroomInvitations(rows, async payload => {
        requests.push(payload);
        return invitation('retry-2');
    }, update, error => error.message);

    assert.equal(requests.length, 4);
    assert.deepEqual(requests[3], { studentCitizenId: 'student-2' });
    assert.deepEqual([rows[0].invitation, rows[2].invitation], originalCodes);
    assert.equal(rows[1].error, undefined);
    assert.equal(rows[1].invitation.invitationCode, 'code-retry-2');
});

test('malformed responses never become exportable codes and do not stop subsequent students', async () => {
    const results = [];
    const responses = [null, { invitationCode: 'bad-expiry', expiresAt: 'invalid' }, { expiresAt: invitation('valid').expiresAt }, invitation('valid')];
    await issueClassroomInvitations(['1', '2', '3', '4'].map(row), async () => responses.shift(), result => results.push(result), () => 'invalid response');
    assert.equal(results.length, 4);
    assert.ok(results.slice(0, 3).every(result => !result.invitation && result.error === 'invalid response'));
    assert.deepEqual(results[3].invitation, invitation('valid'));
});

test('processes one request at a time and publishes progress before the next request', async () => {
    const events = [];
    await issueClassroomInvitations([row('1'), row('2')], async payload => {
        events.push(`request:${payload.studentCitizenId}`);
        await new Promise(resolve => setImmediate(resolve));
        return invitation(payload.studentCitizenId);
    }, result => events.push(`result:${result.citizenId}`), () => 'error');
    assert.deepEqual(events, ['request:student-1', 'result:student-1', 'request:student-2', 'result:student-2']);
});
