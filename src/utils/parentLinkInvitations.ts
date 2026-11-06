export interface ParentLinkInvitation {
    invitationCode: string;
    expiresAt: string;
}

export interface ClassroomInvitationRow {
    id: string;
    citizenId: string;
    firstName: string;
    lastName: string;
    invitation?: ParentLinkInvitation;
    error?: string;
}

// Keep successful codes in the current session and only retry unfinished rows.
export async function issueClassroomInvitations(
    rows: ClassroomInvitationRow[],
    issue: (payload: { studentCitizenId: string }) => Promise<ParentLinkInvitation>,
    onResult: (row: ClassroomInvitationRow) => void,
    getErrorMessage: (error: unknown) => string,
) {
    for (const row of rows) {
        if (row.invitation) continue;
        try {
            const invitation = await issue({
                studentCitizenId: row.citizenId,
            });
            if (!invitation.invitationCode || !Number.isFinite(Date.parse(invitation.expiresAt))) {
                throw new Error('Invalid invitation response');
            }
            onResult({ ...row, invitation, error: undefined });
        } catch (error: unknown) {
            onResult({ ...row, error: getErrorMessage(error) });
        }
    }
}
