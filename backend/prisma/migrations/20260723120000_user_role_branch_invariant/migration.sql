-- CR-03: enforce role<->branchId at the database level, not just app code.
-- SUPERADMIN must have branchId IS NULL (global scope); every other role
-- must have a branchId. This closes the gap where an application bug could
-- leave a promoted/demoted user in an inconsistent state that several
-- services would silently treat as "global" (branchId === null) regardless
-- of actual role.
ALTER TABLE "User" ADD CONSTRAINT "user_role_branch_chk" CHECK (
  ("role" = 'SUPERADMIN' AND "branchId" IS NULL) OR
  ("role" <> 'SUPERADMIN' AND "branchId" IS NOT NULL)
);

-- Was ON DELETE SET NULL — deleting a Branch would silently turn every
-- non-SUPERADMIN user who belonged to it into a branchId-less row, which
-- the CHECK above now forbids outright (and which several services would
-- have treated as global scope even without the CHECK). RESTRICT makes a
-- branch with existing users fail to delete with a clear FK error instead.
ALTER TABLE "User" DROP CONSTRAINT "User_branchId_fkey";
ALTER TABLE "User" ADD CONSTRAINT "User_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
