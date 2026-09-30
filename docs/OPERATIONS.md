# Operations guide

A short playbook for the REAP team. Every screen mentioned is under `/admin` unless stated otherwise.

## Daily routine

1. **Open the Dashboard.** The row of chips at the top is today's to-do list: orders to confirm, orders to prepare, deliveries without a driver, payments to verify, booking requests, unread messages and low-stock items. Tap a chip to go straight to that list.
2. **Confirm new orders** (Orders → *Pending*). Confirming sends the customer a WhatsApp/SMS automatically.
3. **Verify mobile money** (Payments → *To verify*). Match each transaction ID against your Orange Money / MoMo statement, then tap **Confirm** or **Reject**.
4. **Dispatch deliveries** (Deliveries). Assign a driver on each card. Drivers see their list at `/driver` on their phone.
5. **Answer messages** (Inbox). Customer replies from WhatsApp and SMS land here and on each customer's profile.

## Taking a phone, WhatsApp or walk-in order

**New order (POS)** → tap products → search the customer by name or phone (or type a new one) → choose pickup or delivery → optionally record the payment → **Create order**. Choose *Sold & handed over* for walk-in sales that are already complete.

## Meat and fish sold by weight

Customers order an *estimated* weight. When the order is cut or harvested, open it and use **Set actual weight** on each weighed item. The total, stock and balance update automatically. Then use the *Weight / total* quick reply to tell the customer the final amount.

## Livestock → stock

- **List for sale** on a pig adds one to the linked product's stock (for example *Finisher Pig*).
- **Slaughter** records the carcass weight into a meat product (for example *Whole Dressed Pig*, per lb).
- **Harvest** on a fish pond adds kg to *Live Tilapia* or *Live Catfish* and reduces the fish count.
- **Died / loss** records mortality and removes the animal from stock if it was listed.

Other stock changes (feed delivered, eggs received, spoilage, a stock count) go in **Inventory → Update stock**. Every change is kept in the stock history.

## Drivers (`/driver`)

1. Tap **Picked up — start delivery**. The customer is notified, and you can share your live location so they can see you on their tracking page.
2. At the door, tap **Delivered**, enter the cash collected and who received it, then confirm. The payment is recorded and the order completes.
3. If something goes wrong, tap **Problem** and choose a reason. The office sees it on the dispatch board.

## Wholesale customers and invoices

Set a **standing discount %** and tags (for example `restaurant`) on the customer profile. For credit sales, open the order and click **Create invoice**, then **Send to customer** (they get a link that can be printed or saved as PDF). Record payments on the invoice as they come in. **Invoices** shows what's overdue, and **Financial reports** shows receivables by age.

## Marketing

- **Promotions:** create a code such as `FISHFRIDAY` and link it to a campaign so orders using it are credited to that campaign (useful for radio and flyers).
- **Ad campaigns:** create the campaign, copy its tracking links into ads and posts, and enter daily spend and results. The page shows orders, revenue, ROAS and cost per order.
- **Broadcasts:** choose the channel and audience, check the recipient count, then send or schedule. Only customers who opted in receive broadcasts, and STOP replies unsubscribe them automatically.
- **Social media:** write the post once and pick the platforms. Connected accounts publish automatically. Otherwise use the WhatsApp, Facebook or X share buttons.

## Month end

**Financial reports** → *Last month*: profit & loss, cash flow, receivables and stock value. Use **Print** for a paper copy, or **Reports & exports** for CSV files for your accountant. Enter all expenses during the month so the net profit is right, and keep product **cost prices** up to date so gross margin is accurate.

## Staff and security

- Give each person the smallest role that fits their job (**Staff & access** shows exactly what each role can do).
- Everyone with admin access should turn on **two-factor** under **My security**.
- When someone leaves, untick **Active**. They are signed out everywhere immediately.
- **Audit log** shows who changed prices, gave refunds, adjusted stock or exported data.

## Backups

Everything, including product photos, lives in PostgreSQL. Back up daily:

```bash
pg_dump "$DATABASE_URL" --format=custom --file=reap-$(date +%F).dump
# restore: pg_restore --clean --if-exists --dbname="$DATABASE_URL" reap-YYYY-MM-DD.dump
```

With Docker Compose: `docker compose exec db pg_dump -U reap -Fc reap > reap-$(date +%F).dump`. Keep copies off the server, for example in cloud storage.
