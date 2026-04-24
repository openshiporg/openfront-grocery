# AUTONOMOUS_CONTEXT.md

## Identity
- Project: Openfront Grocery
- Repo Path: /Users/junaid/code/openfront-grocery
- Target Competitor / Incumbent: Instacart Enterprise / Shopify Plus / Mercato
- Source-of-truth Checklist: /Users/junaid/.vibeghost/ghost/memory/checklists/openfront-grocery.md
- Build Status: in_development

## Mission
Build a merchant-owned open-source grocery system for browse/search, cart and checkout, pickup and delivery slots, substitutions, customer accounts, fulfillment operations, and open marketplace routing.

## Current Status
Grocery has strong model foundations, but still needs real storefront usability and operator-grade fulfillment tooling.

## User Story Lens
Use user stories to decide what features need to exist, how complete they are, and how robust they need to become.

### Shopper
- Shopper should be able to browse departments, search products, build a cart, choose pickup or delivery, set substitution preferences, and check out

### Returning customer
- Returning customer should be able to view account history, reorder, and manage saved lists

### Store associate
- Store associate should be able to pick orders efficiently and handle substitutions clearly

### Store operator
- Store operator should be able to manage slot capacity, order flow, delivery routing, and fulfillment state

## Major Parity Features
These are the major product capabilities the repo should grow toward if it is going to become a credible open-source alternative to the incumbent:

- browse/search by department
- cart and checkout
- pickup and delivery slot selection
- substitution preferences and operations
- customer account and order history
- order management
- picking workflow
- slot management
- delivery route operations
- grocery loyalty and replenishment patterns

## Autonomous Working Rules
- Work autonomously and keep making real product progress.
- Do not stop to ask for confirmation unless absolutely necessary.
- If you finish one obvious task, move to the next meaningful gap instead of stopping.
- If you feel lost, compacted, or unsure what to do next, reread this file first. Also reread the checklist at `/Users/junaid/.vibeghost/ghost/memory/checklists/openfront-grocery.md` if direction is unclear.
- Read the code before making assumptions.
- Verify what already exists before rebuilding it.
- Keep the product grounded, specific, and useful. Avoid generic AI-looking output.
- Do not mistake shallow scaffolding for parity.

## Important Non-Goals For Autonomous Mode
- Do not run migrations.
- Do not commit changes.
- Do not create fake completion theater or filler work.
- Do not stop after one narrow task if there are still obvious parity gaps to close.

## Owner Workflow Reminder
- Junaid will review the work.
- Junaid will run migrations manually if needed.
- Junaid will decide what to commit.

## Priority Directions
- Audit schema, totals, states, and relationship integrity.
- Bring onboarding to canonical seeded-demo parity.
- Make browse/search/cart/checkout/account flows real and believable.
- Build order management, picking, substitutions, slot management, and delivery-route slices.

## Autonomous Product-Parity Loop
Repeat this loop continuously instead of treating the work like a one-time task list:

1. Remember which incumbent or product category this repo is trying to replace.
2. Use the user stories in this file to identify what people in this product need to be able to do.
3. Translate those user stories into concrete product capabilities and features.
4. Check the codebase and determine which of those features already exist.
5. If a required feature is missing, build it.
6. If a feature exists but is shallow, incomplete, or generic, deepen it.
7. If a feature exists but is brittle, awkward, or underpowered, make it more robust and operator-grade.
8. After improving a feature, step back and ask how much closer the product is to being a credible open-source alternative.
9. Identify the next biggest parity gap and repeat.

## What To Do When You Think The Obvious Features Are Done
If the obvious features appear to exist already:

1. Check whether those features are actually implemented end to end.
2. Check whether they feel believable for real users and operators.
3. Check whether the workflows are robust, detailed, and specific to the vertical instead of generic CRUD.
4. Improve weak implementations until they feel like real product features.
5. Then go back to the incumbent comparison and ask what still needs to exist for parity.

## If You Get Lost
1. Reread this file.
2. Reread the checklist at `/Users/junaid/.vibeghost/ghost/memory/checklists/openfront-grocery.md`.
3. Re-read the user stories and ask what each actor still needs to be able to do.
4. Inspect the repo and identify what is already built.
5. Continue with the next highest-leverage parity gap, robustness improvement, or user-workflow improvement.
6. Prefer real implementation progress over asking for permission.
