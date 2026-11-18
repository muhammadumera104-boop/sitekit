// Receipt / kitchen ticket printing: opens a small window with 80mm thermal-printer styling and calls print().
const rs = (n) => `Rs. ${Number(n || 0).toLocaleString()}`;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function printOrder(order, store = {}, { kitchen = false } = {}) {
  const when = new Date(order.createdAt || Date.now()).toLocaleString();
  const lines = (order.items || []).map((i) => `
    <tr><td class="q">${i.qty}×</td><td>${esc(i.name)}${(i.options || []).length ? `<div class="s">${esc(i.options.map((o) => o.name).join(', '))}</div>` : ''}${i.note ? `<div class="s">“${esc(i.note)}”</div>` : ''}</td>${kitchen ? '' : `<td class="r">${rs(i.unitPrice * i.qty)}</td>`}</tr>`).join('');
  const c = order.customer || {};
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Order #${esc(order.number)}</title><style>
    @page { margin: 4mm; } * { box-sizing: border-box; }
    body { font: 13px/1.35 'Courier New', monospace; width: 72mm; margin: 0 auto; color: #000; }
    h1 { font-size: 16px; text-align: center; margin: 4px 0 0; } .c { text-align: center; } .s { font-size: 11px; color: #333; }
    hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; } table { width: 100%; border-collapse: collapse; } td { vertical-align: top; padding: 2px 0; }
    .q { width: 28px; font-weight: bold; } .r { text-align: right; white-space: nowrap; } .t td { font-size: 15px; font-weight: bold; }
    .big { font-size: 22px; font-weight: bold; text-align: center; letter-spacing: 1px; }
  </style></head><body>
    <h1>${esc(store.name || '')}</h1>
    <div class="c s">${kitchen ? 'KITCHEN ORDER' : 'RECEIPT'}${store.phone ? ` · ${esc(store.phone)}` : ''}</div>
    <hr><div class="big">#${esc(order.number)}</div>
    <div class="c s">${esc(when)}<br>${order.source === 'pos' ? 'POS sale' : order.orderType === 'pickup' ? 'PICKUP' : 'DELIVERY'}${order.area ? ` · ${esc(order.area)}` : ''}</div>
    ${c.name || c.phone ? `<hr><div>${esc(c.name || '')} ${esc(c.phone || '')}${c.altPhone ? `<br>Alt: ${esc(c.altPhone)}` : ''}${order.orderType === 'delivery' && c.address ? `<br>${esc(c.address)}${c.landmark ? ` (near ${esc(c.landmark)})` : ''}` : ''}</div>` : ''}
    <hr><table>${lines}</table>
    ${order.instructions ? `<hr><div class="s">Note: ${esc(order.instructions)}</div>` : ''}
    ${kitchen ? '' : `<hr><table>
      ${order.promoDiscount > 0 ? `<tr><td>Promo ${esc(order.promoCode || '')}</td><td class="r">− ${rs(order.promoDiscount)}</td></tr>` : ''}
      ${order.tax > 0 ? `<tr><td>Tax</td><td class="r">${rs(order.tax)}</td></tr>` : ''}
      ${order.deliveryFee > 0 ? `<tr><td>Delivery</td><td class="r">${rs(order.deliveryFee)}</td></tr>` : ''}
      <tr class="t"><td>TOTAL</td><td class="r">${rs(order.total)}</td></tr></table>
      <div class="c s">${esc(order.paymentMethod === 'cod' ? 'Cash on delivery' : order.paymentMethod || '')} · ${esc(order.paymentStatus || '')}${order.changeFor > 0 ? `<br>Customer pays ${rs(order.changeFor)} — change ${rs(Math.max(0, order.changeFor - order.total))}` : ''}</div>
      <hr><div class="c s">Thank you!</div>`}
    <script>window.onload=function(){window.print();setTimeout(function(){window.close()},300)}<\/script>
  </body></html>`;
  const w = window.open('', '_blank', 'width=380,height=640');
  if (!w) return false;
  w.document.write(html); w.document.close();
  return true;
}
