# Security Specification for GigMate Workspace

## Data Invariants
1. A **ShiftSlot** must have a `teamId` that matches the user's `teamId`.
2. An **EarningEntry** must have a `teamId` that matches the user's `teamId`.
3. A **Team** can only be modified by its **Leader**.
4. A **ChatMessage** can only be sent by a member of the team.
5. Users cannot change their own `role` or `teamId` arbitrarily after joining.

## The Dirty Dozen Payloads (Rejection Tests)
1. **The Identity Spoof**: Create a shift for someone else's `teamId`. (RESULT: PERMISSION_DENIED)
2. **The Role Escalation**: Update my own profile from 'member' to 'leader' directly. (RESULT: PERMISSION_DENIED)
3. **The Shadow Field**: Add `isAdmin: true` to a user profile. (RESULT: PERMISSION_DENIED)
4. **The Giant ID**: Use a 2MB string as a `shiftId`. (RESULT: PERMISSION_DENIED)
5. **The Chat Spam**: Send a message with 1MB of text. (RESULT: PERMISSION_DENIED)
6. **The Orphaned earning**: Create earning without a `teamId`. (RESULT: PERMISSION_DENIED)
7. **The Negative Pay**: Input a negative amount for earnings. (RESULT: PERMISSION_DENIED)
8. **The Leader Hijack**: Update a Team's `leaderId` to yourself when you aren't the leader. (RESULT: PERMISSION_DENIED)
9. **The Cross-Team Peek**: Try to list messages where `teamId == "other_team"`. (RESULT: PERMISSION_DENIED)
10. **The PII Leak**: Read another user's email if they aren't on my team. (RESULT: PERMISSION_DENIED)
11. **The Ghost Shift**: Create a shift with an hour like 25. (RESULT: PERMISSION_DENIED)
12. **The Overwrite**: Overwrite someone else's shift document directly. (RESULT: PERMISSION_DENIED)

## Implementation Plan
I will implement `isValidShiftSlot`, `isValidEarningEntry`, and use `affectedKeys().hasOnly()` for updates.
Relational sync: `get(/databases/$(database)/documents/users/$(request.auth.uid)).data.teamId == incoming().teamId`.
