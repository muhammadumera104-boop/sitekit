// Order emails to the customer (and a heads-up to the store). Uses SMTP when configured, otherwise prints to the console.
const env = require('../config/env');
const { User } = require('../models');
const { sendMail } = require('./email');

const rs = (n) => `Rs. ${Number(n || 0).toLocaleString()}`;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const withTimeout = (p, ms = 5000) => Promise.race([p, new Promise((r) => setTimeout(r, ms))]);

const COPY = {
  placed: ['Order received', 'Thank you! We have received your order and sent it to the kitchen.'],
  confirmed: ['Order confirmed', 'Your order is confirmed and will be prepared shortly.'],
  preparing: ['Being prepared', 'The kitchen is preparing your order.'],
  ready: ['Order ready', 'Your order is ready.'],
  out_for_delivery: ['On the way', 'Your order is out for delivery. Our rider will reach you soon.'],
  delivered: ['Delivered', 'Your order has been delivered. Enjoy! You can rate it from the tracking page.'],
  completed: ['Order completed', 'Your order is complete. Thank you!'],
  cancelled: ['Order cancelled', 'Your order has been cancelled. Please contact us if this is a surprise.'],
};

function body(tenant, order, event) {
  const [title, line] = COPY[event];
  const link = `${env.clientUrl}/${tenant.slug}/track?number=${order.number}&phone=${encodeURIComponent(order.customer?.phone || '')}`;
  const items = order.items.map((i) => `${i.qty} × ${i.name}${i.options?.length ? ` (${i.options.map((o) => o.name).join(', ')})` : ''}`).join('\n');
  const text = `${line}\n\nOrder #${order.number}\n${items}\nTotal: ${rs(order.total)}\n\nTrack your order: ${link}\n\n— ${tenant.name}`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto"><h2 style="color:${esc(tenant.theme?.primary || '#c0392b')}">${esc(title)}</h2><p>${esc(line)}</p>
<p><strong>Order #${esc(order.number)}</strong></p><ul>${order.items.map((i) => `<li>${i.qty} × ${esc(i.name)}</li>`).join('')}</ul><p><strong>Total: ${esc(rs(order.total))}</strong></p>
<p><a href="${link}" style="background:${esc(tenant.theme?.primary || '#c0392b')};color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none">Track your order</a></p><p style="color:#888">${esc(tenant.name)}</p></div>`;
  return { subject: `${title} — Order #${order.number} · ${tenant.name}`, text, html };
}

// event: placed | confirmed | preparing | ready | out_for_delivery | delivered | completed | cancelled
async function notifyOrder(tenant, order, event) {
  try {
    if (!COPY[event] || order.source === 'pos') return;
    const jobs = [];
    if (order.customer?.email) jobs.push(sendMail({ to: order.customer.email, ...body(tenant, order, event) }));
    if (event === 'placed') {
      const owners = await User.find({ tenantId: tenant._id, role: 'tenant_owner', status: 'active' }).select('email').lean();
      const to = tenant.contact?.email || owners[0]?.email;
      if (to) jobs.push(sendMail({ to, subject: `New order #${order.number} — ${rs(order.total)}`, text: `${order.customer?.name} (${order.customer?.phone})\n${order.items.map((i) => `${i.qty} × ${i.name}`).join('\n')}\nTotal ${rs(order.total)} · ${order.orderType}${order.area ? ` · ${order.area}` : ''}` }));
    }
    await withTimeout(Promise.all(jobs));
  } catch (e) { console.error('notify failed:', e.message); }
}

module.exports = { notifyOrder };
