// Release gate: load every dashboard section and storefront route as each staff role and print PASS/FAIL per page.
// Usage: CRAWL_BASE=https://grocery.openship.org CRAWL_LOGINS=/path/logins.json node scripts/r6-crawl.mjs [roles...]
// CRAWL_LOGINS is a JSON file { "<role>": { "email": "...", "password": "..." } } kept outside the repo.
import fs from 'node:fs'
import { chromium } from '/Users/junaid/Code/vibeghost/vibeghost/node_modules/playwright/index.mjs'

const BASE = process.env.CRAWL_BASE
const people = JSON.parse(fs.readFileSync(process.env.CRAWL_LOGINS, 'utf8'))
const roles = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(people)
const OUT = process.env.CRAWL_OUT
const first = people.owner ?? Object.values(people)[0]

async function gql(query, cookie, variables) {
  const r = await fetch(BASE + '/api/graphql', { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify({ query, variables }) })
  return r.json()
}
async function token(p) {
  const r = await gql('mutation($e:String!,$p:String!){authenticateUserWithPassword(email:$e,password:$p){... on UserAuthenticationWithPasswordSuccess{sessionToken}}}', null, { e: p.email, p: p.password })
  return r.data?.authenticateUserWithPassword?.sessionToken
}
const cookie = 'keystonejs-session=' + (await token(first))
const dr = await gql('{products(take:1,orderBy:{id:asc}){id handle} departments(take:1,orderBy:{id:asc}){id handle} users(take:3,orderBy:{id:asc}){id} orders(take:1,orderBy:{id:asc}){id}}', cookie)
if (!dr.data) { console.log('CHECK crawl id lookup: FAIL', JSON.stringify(dr.errors?.[0]?.message)); process.exit(1) }
const d = dr.data

const sections = ['', 'orders', 'fulfillment', 'delivery', 'pickup', 'inventory', 'products', 'purchasing', 'suppliers', 'merchandising', 'subscriptions', 'customers', 'payments', 'messages', 'reports', 'staff', 'settings']
const staff = sections.map(s => '/dashboard/platform' + (s ? '/' + s : ''))
if (d.products[0]) staff.push('/dashboard/platform/products/' + d.products[0].id)
if (d.users[0]) staff.push('/dashboard/platform/customers/' + d.users[0].id)
staff.push('/dashboard/Product', '/dashboard/Order')
const expect404 = ['/dashboard/platform/products/nope123', '/dashboard/platform/customers/nope123']
const store = ['/', '/products', '/departments', '/deals', '/lists', '/policies', '/support', '/cart', '/checkout', '/fulfillment', '/subscriptions', '/favorites', '/order-access', '/account/sign-in', '/account/register', '/staff/accept']
if (d.products[0]) store.push('/products/' + d.products[0].handle)
if (d.departments[0]) store.push('/departments/' + d.departments[0].handle)
if (d.orders[0]) staff.push('/dashboard/Order/' + d.orders[0].id)
expect404.push('/products/nope123', '/departments/nope123', '/order/nope123', '/nope123')
if (OUT) fs.writeFileSync(OUT + '-ids.json', JSON.stringify({ products: d.products, departments: d.departments, users: d.users.length, orders: d.orders.length }, null, 1))

const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-mac-arm64/chrome-headless-shell' })
const BROKEN = /this page could not be loaded|something went wrong|application error|QUERY_TOO_BROAD|too broad|internal server error/i
const res = {}
let bad = 0
let x500 = 0
for (const role of roles) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true })
  const p = await ctx.newPage()
  await p.goto(BASE + '/dashboard/signin')
  await p.fill('input[name=email]', people[role].email)
  await p.fill('input[name=password]', people[role].password)
  await Promise.all([p.waitForURL(u => !u.pathname.includes('signin'), { timeout: 30000 }), p.click('button[type=submit]')])
  const only = process.env.CRAWL_ONLY ? process.env.CRAWL_ONLY.split(',') : null
  const paths = [...staff, ...store, ...expect404].filter(x => !only || only.includes(x))
  for (const path of paths) {
    const r = await p.goto(BASE + path, { waitUntil: 'networkidle', timeout: 120000 }).catch(() => null)
    const txt = await p.evaluate(() => document.body.innerText).catch(() => '')
    const http = r?.status() ?? 0
    const want404 = expect404.includes(path)
    const broken = BROKEN.test(txt)
    // A role without a capability may be sent to no-access (200) or told 403/404 by design; only 5xx and wrong 404s fail.
    // Staff detail routes stream the shop's 404 page under HTTP 200; the body is the proof there.
    const ok = want404 ? (http === 404 || (path.startsWith('/dashboard/') && http === 200 && (/\b404\b/.test(txt) || (role !== 'owner' && /could not load/.test(txt))))) : http < 500 && http !== 0 && !broken && (http === 200 || http === 403 || http === 404 && staff.includes(path))
    if (http >= 500) x500++
    res[`${role} ${path}`] = { http, broken, want404 }
    if (!ok) bad++
    console.log(`CHECK ${role} ${path}: ${ok ? 'PASS' : 'FAIL'} (${http}${want404 ? ' expected 404' : ''})`)
  }
  await ctx.close()
}
await b.close()
if (OUT) fs.writeFileSync(OUT + '.json', JSON.stringify(res, null, 1))
console.log(`CHECK all pages: ${bad ? 'FAIL' : 'PASS'} (${Object.keys(res).length} loads, ${bad} failed, ${x500} x 500)`)
