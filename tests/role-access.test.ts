import assert from "node:assert/strict";
import test from "node:test";

// Fake Keystone context: one store, users keyed by id with their current role.
function contextFor(userId: string | null, users: Record<string, any>) {
  const prisma = {
    $queryRaw: async () => [],
    user: {
      findUnique: async ({ where }: any) => users[where.id] ?? null,
      count: async ({ where }: any) => Object.values(users).filter((u: any) => u.roleId === where.roleId).length,
    },
  };
  const sudo = () => ({ query: { User: { findOne: async ({ where }: any) => users[where.id] ?? null } } });
  const context: any = { session: userId ? { itemId: userId } : undefined, prisma, sudo };
  return { session: context.session, context, ...context };
}

const store = { id: "s1", isActive: true };
const admin = { id: "a", roleId: "r-admin", store, role: { canManageUsers: true, canAccessDashboard: true, canManageProducts: true } };
const clerk = { id: "c", roleId: "r-clerk", store, role: { canManageUsers: false, canAccessDashboard: true } };

test("Role CRUD: current staff administrators only; customers and stale sessions are refused", async () => {
  const { Role } = await import("../features/keystone/models/Role");
  const op = (Role as any).access.operation;
  const users = { a: admin, c: clerk };
  for (const action of ["create", "update", "delete"]) {
    assert.equal(await op[action](contextFor("a", users) as any), true, `${action} admin`);
    assert.equal(await op[action](contextFor("c", users) as any), false, `${action} clerk`);
    assert.equal(await op[action](contextFor(null, users) as any), false, `${action} anonymous`);
  }
  // Revoked since sign-in: the fresh read wins over any session snapshot.
  const revoked = { a: { ...admin, role: { ...admin.role, canManageUsers: false } } };
  assert.equal(await op.create(contextFor("a", revoked) as any), false);
});

test("Role filters: admins see the store, others only their own role; held roles are not generically editable", async () => {
  const { Role } = await import("../features/keystone/models/Role");
  const filter = (Role as any).access.filter;
  const users = { a: admin, c: clerk };
  assert.deepEqual(await filter.query(contextFor("a", users) as any), { store: { id: { equals: "s1" } } });
  assert.deepEqual(await filter.query(contextFor("c", users) as any), { assignedTo: { some: { id: { equals: "c" } } } });
  assert.deepEqual(await filter.update(contextFor("a", users) as any), { AND: [{ store: { id: { equals: "s1" } } }, { assignedTo: { none: {} } }] });
});

test("Role validation: no granting capabilities you lack; no deleting a role people hold", async () => {
  const { Role } = await import("../features/keystone/models/Role");
  const v = (Role as any).hooks.validate;
  const users = { a: admin, c: clerk, x: { id: "x", roleId: "r-held", store, role: null } };
  const run = async (fn: any, args: any) => { const errors: string[] = []; await fn({ ...args, addValidationError: (m: string) => errors.push(m) }); return errors; };
  assert.deepEqual(await run(v.create, { resolvedData: { canManageProducts: true }, context: contextFor("a", users) }), []);
  assert.match((await run(v.create, { resolvedData: { canManagePayments: true }, context: contextFor("a", users) }))[0], /canManagePayments/);
  assert.match((await run(v.delete, { item: { id: "r-held" }, context: contextFor("a", users) }))[0], /before deleting/);
  assert.deepEqual(await run(v.delete, { item: { id: "r-empty" }, context: contextFor("a", users) }), []);
});
