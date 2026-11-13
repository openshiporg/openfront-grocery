// Needs a scratch Postgres with migrations applied: FILTER_TEST_DATABASE_URL (falls back to DATABASE_URL).
import assert from 'node:assert/strict'
import test from 'node:test'
import { getContext } from '@keystone-6/core/context'
import * as PrismaModule from '@prisma/client'
import config from '../index'

const STORE = 'store_juniper'
const RUN = Date.now().toString(36)
const ctx: any = getContext(config as any, PrismaModule)
const prisma = ctx.prisma
const WINDOW = Object.values((PrismaModule as any).$Enums.OrderDeliveryTimeWindowType)[0] as any
const role = (name: string, caps: Record<string, boolean>) => ({ name, storeId: STORE, ...caps })

async function seed() {
  await prisma.store.upsert({ where: { id: STORE }, update: {}, create: { id: STORE, code: 'flt', name: 'Filter Test' } })
  const mk = async (name: string, caps: Record<string, boolean>) => (await prisma.role.create({ data: role(name, caps) })).id
  const admin = await mk(`FltAdmin${RUN}`, { canManageProducts: true, canManageOrders: true, canManageInventory: true, canManageSuppliers: true, canManageDelivery: true, canManageUsers: true, canManagePayments: true, canManageOnboarding: true, canAccessDashboard: true })
  const desk = await mk(`FltDesk${RUN}`, { canManageOrders: true, canAccessDashboard: true })
  const inv = await mk(`FltInv${RUN}`, { canManageInventory: true, canAccessDashboard: true })
  const user = (email: string, name: string, roleId: string | null) => prisma.user.create({ data: { email, name, password: 'x', storeId: STORE, roleId } })
  const a = await user(`flt-admin-${RUN}@example.com`, 'Zed Admin', admin)
  const d = await user(`flt-desk-${RUN}@example.com`, 'Zed Desk', desk)
  const i = await user(`flt-inv-${RUN}@example.com`, 'Zed Inv', inv)
  const c = await user(`flt-cust-${RUN}@example.com`, 'Zed Cust', null)
  const other = await user(`amy-secret-${RUN}@example.com`, 'Amy Secret', null)
  const sup = await prisma.supplier.create({ data: { name: `AcmeSecret${RUN}`, storeId: STORE, email: 'acme-sec@example.com' } })
  const prod = await prisma.product.create({ data: { title: 'Fltapple', handle: `fltapple-${RUN}`, status: 'published', storeId: STORE, supplierId: sup.id, costPriceCents: 4242 } })
  const order = await prisma.order.create({ data: { displayId: 900000 + Math.floor(Math.random() * 99999), email: `amy-secret-${RUN}@example.com`, storeId: STORE, userId: other.id, deliveryDate: new Date(), deliveryTimeWindow: WINDOW } })
  const pay = await prisma.payment.create({ data: { amount: '1.00', amountCents: 100, storeId: STORE, orderId: order.id, providerPaymentId: `flt_pay_${RUN}`, notes: 'secret-note' } })
  await prisma.paymentRefund.create({ data: { idempotencyKey: `flt-${RUN}`, amount: '1.00', amountCents: 100, paymentId: pay.id, requestedById: a.id, requestedAt: new Date(), failureMessage: 'secret-fail' } })
  return { admin: a, desk: d, inv: i, cust: c, other, prod }
}

const sessionFor = (u: any, roleName: string) => ctx.withSession({ itemId: u.id, listKey: 'User', data: { name: u.name, store: { id: STORE }, role: { id: 'x', name: roleName } } })

// [list count query, hidden-value probe where, absent-value probe where]
const probes = (e: { sec: string; nope: string }) => {
  const p = (q: string, mk: (v: string) => string): [string, string, string] => [q, mk(e.sec), mk(e.nope)]
  return [
    p('products', v => `{ supplier: { name: { startsWith: "${v}" } } }`),
    p('products', v => `{ supplier: { email: { startsWith: "${v}" } } }`),
    p('products', v => `{ costPriceCents: { equals: ${v === 'A' ? 4242 : 1} } }`),
    p('products', v => `{ store: { users: { some: { email: { startsWith: "${v === 'A' ? 'amy' : 'qqq'}" } } } } }`),
    p('products', v => `{ favoriteProducts: { some: { user: { email: { startsWith: "${v === 'A' ? 'amy' : 'qqq'}" } } } } }`),
    p('departments', v => `{ manager: { name: { startsWith: "${v}" } } }`),
    p('orders', v => `{ user: { email: { startsWith: "${v === 'A' ? 'amy' : 'qqq'}" } } }`),
    p('orders', v => `{ payments: { some: { refunds: { some: { failureMessage: { startsWith: "${v === 'A' ? 'secret' : 'qqq'}" } } } } } }`),
    p('payments', v => `{ order: { user: { email: { startsWith: "${v === 'A' ? 'amy' : 'qqq'}" } } } }`),
    p('payments', v => `{ refunds: { some: { failureMessage: { startsWith: "${v === 'A' ? 'secret' : 'qqq'}" } } } }`),
    p('users', v => `{ orders: { some: { email: { startsWith: "${v === 'A' ? 'amy' : 'qqq'}" } } } }`),
    p('users', v => `{ role: { canManageUsers: { equals: ${v === 'A'} } } }`),
    p('users', v => `{ email: { startsWith: "${v === 'A' ? 'amy' : 'qqq'}" } }`),
    p('stores', v => `{ users: { some: { email: { startsWith: "${v === 'A' ? 'amy' : 'qqq'}" } } } }`),
    p('stores', v => `{ suppliers: { some: { name: { startsWith: "${v === 'A' ? 'Acme' : 'qqq'}" } } } }`),
    p('roles', v => `{ assignedTo: { some: { email: { startsWith: "${v === 'A' ? 'amy' : 'qqq'}" } } } }`),
    p('inventoryLots', v => `{ supplier: { name: { startsWith: "${v === 'A' ? 'Acme' : 'qqq'}" } } }`),
    p('suppliers', v => `{ name: { startsWith: "${v === 'A' ? 'Acme' : 'qqq'}" } }`),
  ] as [string, string, string][]
}

async function count(c: any, list: string, where: string): Promise<string> {
  const plural = list.charAt(0).toUpperCase() + list.slice(1)
  const res = await c.graphql.raw({ query: `query { ${list}Count(where: ${where}) }` })
  if (res.errors?.length) return 'ERR'
  return String(res.data[`${list}Count`])
}

test('relation and field where-filters are not an oracle', async () => {
  const s = await seed()
  const e = { sec: 'A', nope: 'B' }
  const roles: Array<[string, any]> = [
    ['anonymous', ctx.withSession(undefined as any)],
    ['customer', sessionFor(s.cust, 'none')],
    ['order-desk', sessionFor(s.desk, 'FltDesk')],
    ['inventory', sessionFor(s.inv, 'FltInv')],
  ]
  const failures: string[] = []
  for (const [who, c] of roles) {
    for (const [list, hit, miss] of probes(e)) {
      const [x, y] = [await count(c, list, hit), await count(c, list, miss)]
      console.log(`${who.padEnd(10)} ${list}.${hit.slice(0, 60).padEnd(60)} hit=${x} miss=${y}`)
      if (x !== y) failures.push(`${who} ${list} ${hit}: ${x} vs ${y}`)
    }
  }
  assert.deepEqual(failures, [])
  // Admin keeps the real filters.
  const adminCtx = sessionFor(s.admin, 'FltAdmin')
  assert.equal(await count(adminCtx, 'users', '{ email: { startsWith: "flt-" } }') !== 'ERR', true)
  assert.equal(await count(adminCtx, 'suppliers', `{ name: { startsWith: "AcmeSecret${RUN}" } }`), '1')
  assert.equal(await count(adminCtx, 'suppliers', '{ name: { startsWith: "qqq" } }'), '0')
  assert.equal(await count(adminCtx, 'products', `{ supplier: { name: { startsWith: "AcmeSecret${RUN}" } } }`), '1')
})
