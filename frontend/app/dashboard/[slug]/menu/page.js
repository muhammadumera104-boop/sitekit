'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { money, parseImport } from '@/lib/util';
import { useAuth } from '@/lib/auth';
import { useTenant } from '@/components/TenantCtx';
import { Protected } from '@/components/Shell';
import { Alert, Badge, Field, ImageField, Loading, Modal, useLoad } from '@/components/ui';

export default function MenuPage() {
  const { slug, tenant, features } = useTenant();
  const { user } = useAuth();
  const canContent = user.permissions.includes('content.manage');
  const isVendor = user.role === 'tenant_vendor';
  const noun = tenant.templateKey === 'store' ? 'Product' : 'Menu item';
  const { data, error, loading, reload } = useLoad(() => api('/tenant/menu', { tenant: slug }), [slug]);
  const branches = useLoad(() => (isVendor ? Promise.resolve({ branches: [] }) : api('/tenant/branches', { tenant: slug })), [slug]);
  const [item, setItem] = useState(null);
  const [catModal, setCatModal] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  async function act(fn, ok) {
    setErr(''); setMsg('');
    try { await fn(); if (ok) setMsg(ok); await reload(); } catch (e) { setErr(e.message); }
  }
  if (loading && !data) return <Loading />;
  const cats = data?.categories || [];

  return (
    <Protected area="tenant" slug={slug} perm="products.manage">
      <div className="page-head"><h1>{tenant.templateKey === 'store' ? 'Products' : 'Menu'}</h1>
        <div className="row">
          {canContent && <button className="btn" onClick={() => setImportOpen(true)}>Import CSV/JSON</button>}
          {canContent && <button className="btn" onClick={() => setCatModal({})}>＋ Category</button>}
          <button className="btn primary" disabled={!cats.length} onClick={() => setItem({ categoryId: cats[0]?._id })}>＋ {noun}</button>
        </div>
      </div>
      <Alert>{error || err}</Alert><Alert type="success">{msg}</Alert>
      {isVendor && <Alert type="info">You are managing the products of your own branch only.</Alert>}
      {cats.length === 0 && <div className="card center muted">No categories yet. {canContent ? 'Add a category first.' : 'Ask the store owner to add a category.'}</div>}
      {cats.map((c) => {
        const items = data.items.filter((i) => i.categoryId === c._id);
        return (
          <div className="card" key={c._id}>
            <div className="row between" style={{ marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>{c.name} {!c.isActive && <Badge>disabled</Badge>} <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>({items.length})</span></h3>
              {canContent && <div className="row">
                <button className="btn sm" onClick={() => setCatModal(c)}>Rename</button>
                <button className="btn sm" onClick={() => act(() => api(`/tenant/menu/categories/${c._id}`, { method: 'PUT', body: { isActive: !c.isActive }, tenant: slug }))}>{c.isActive ? 'Hide' : 'Show'}</button>
                <button className="btn sm danger" onClick={() => confirm(`Delete "${c.name}" and all its items?`) && act(() => api(`/tenant/menu/categories/${c._id}`, { method: 'DELETE', tenant: slug }), 'Category deleted.')}>Delete</button>
              </div>}
            </div>
            <div className="table-wrap"><table className="tbl"><tbody>
              {items.map((i) => (
                <tr key={i._id}>
                  <td style={{ width: 70 }}>{i.image ? <img className="thumb" src={i.image} alt="" /> : <div className="thumb" />}</td>
                  <td><strong>{i.name}</strong><div className="muted" style={{ fontSize: 13 }}>{i.description}</div></td>
                  <td>{i.discountPercent > 0 && features.discounts ? <><s className="muted">{money(i.price)}</s> <strong>{money(Math.round(i.price * (1 - i.discountPercent / 100)))}</strong> <Badge>{i.discountPercent}% off</Badge></> : money(i.price)}
                    {features.inventory && <div className="muted" style={{ fontSize: 12 }}>{i.stock === null || i.stock === undefined ? 'Stock not tracked' : i.stock === 0 ? 'Sold out' : `${i.stock} in stock`}</div>}
                    {i.branchId && <div className="muted" style={{ fontSize: 12 }}>{(branches.data?.branches.find((b) => b._id === i.branchId)?.name) || 'One branch'}</div>}</td>
                  <td><label><input type="checkbox" checked={i.isAvailable} onChange={(e) => act(() => api(`/tenant/menu/items/${i._id}`, { method: 'PUT', body: { isAvailable: e.target.checked }, tenant: slug }))} /> Available</label></td>
                  <td><div className="row" style={{ flexWrap: 'nowrap' }}><button className="btn sm" onClick={() => setItem(i)}>Edit</button><button className="btn sm danger" onClick={() => confirm(`Delete ${i.name}?`) && act(() => api(`/tenant/menu/items/${i._id}`, { method: 'DELETE', tenant: slug }))}>Delete</button></div></td>
                </tr>
              ))}
              {!items.length && <tr><td className="muted">No items in this category.</td></tr>}
            </tbody></table></div>
          </div>
        );
      })}
      {item && <ItemModal item={item} cats={cats} slug={slug} noun={noun} features={features} branches={branches.data?.branches || []} isVendor={isVendor} onClose={() => setItem(null)} onSaved={() => { setItem(null); setMsg('Saved.'); reload(); }} />}
      {catModal && <CatModal cat={catModal} slug={slug} onClose={() => setCatModal(null)} onSaved={() => { setCatModal(null); reload(); }} />}
      {importOpen && <ImportModal slug={slug} onClose={() => setImportOpen(false)} onDone={(n) => { setImportOpen(false); setMsg(`Imported ${n} items.`); reload(); }} />}
    </Protected>
  );
}

function CatModal({ cat, slug, onClose, onSaved }) {
  const [name, setName] = useState(cat.name || '');
  const [err, setErr] = useState('');
  async function save(e) {
    e.preventDefault();
    try { await api(cat._id ? `/tenant/menu/categories/${cat._id}` : '/tenant/menu/categories', { method: cat._id ? 'PUT' : 'POST', body: { name }, tenant: slug }); onSaved(); } catch (x) { setErr(x.message); }
  }
  return <Modal title={cat._id ? 'Rename category' : 'New category'} onClose={onClose}><form onSubmit={save}><Alert>{err}</Alert><Field label="Name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus /><button className="btn primary">Save</button></form></Modal>;
}

function ItemModal({ item, cats, slug, noun, features, branches, isVendor, onClose, onSaved }) {
  const [f, setF] = useState({ categoryId: item.categoryId, name: item.name || '', description: item.description || '', price: item.price ?? '', image: item.image || '', isAvailable: item.isAvailable !== false, discountPercent: item.discountPercent || 0, stock: item.stock ?? '', branchId: item.branchId || '', optionGroups: item.optionGroups || [] });
  const [err, setErr] = useState('');
  const [fe, setFe] = useState({});
  async function save(e) {
    e.preventDefault(); setErr(''); setFe({});
    try { await api(item._id ? `/tenant/menu/items/${item._id}` : '/tenant/menu/items', { method: item._id ? 'PUT' : 'POST', body: { ...f, price: Number(f.price), discountPercent: Number(f.discountPercent) || 0, stock: f.stock === '' ? null : Number(f.stock), ...(isVendor ? {} : { branchId: f.branchId || null }), optionGroups: f.optionGroups.map((g) => ({ ...g, min: Number(g.min) || 0, max: Number(g.max) || 0, options: g.options.filter((x) => x.name.trim()).map((x) => ({ ...x, price: Number(x.price) || 0 })) })).filter((g) => g.name.trim() && g.options.length) }, tenant: slug }); onSaved(); } catch (x) { setErr(x.message); setFe(x.errors || {}); }
  }
  return (
    <Modal title={item._id ? `Edit ${noun.toLowerCase()}` : `New ${noun.toLowerCase()}`} onClose={onClose}>
      <form onSubmit={save}>
        <Alert>{err}</Alert>
        <Field label="Category"><select value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>{cats.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</select></Field>
        <Field label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={fe.name} required />
        <Field label="Description"><textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Price" type="number" min="0" step="any" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} error={fe.price} required />
        {features.discounts && <Field label="Discount (%)" type="number" min="0" max="90" step="1" value={f.discountPercent} onChange={(e) => setF({ ...f, discountPercent: e.target.value })} error={fe.discountPercent} hint="Shown as a sale price on the website. 0 = no discount." />}
        {features.inventory && <Field label="Stock" type="number" min="0" step="1" value={f.stock} onChange={(e) => setF({ ...f, stock: e.target.value })} error={fe.stock} hint="Leave empty to not track stock. At 0 the item shows as sold out." />}
        {!isVendor && branches.length > 0 && <Field label="Branch"><select value={f.branchId} onChange={(e) => setF({ ...f, branchId: e.target.value })}><option value="">All branches</option>{branches.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}</select></Field>}
        <OptionEditor groups={f.optionGroups} onChange={(g) => setF({ ...f, optionGroups: g })} />
        <ImageField label="Image" value={f.image} onChange={(v) => setF({ ...f, image: v })} uploadPath="/tenant/media" tenant={slug} />
        <label><input type="checkbox" checked={f.isAvailable} onChange={(e) => setF({ ...f, isAvailable: e.target.checked })} /> Available</label>
        <div className="row" style={{ marginTop: 14 }}><button className="btn primary">Save</button><button type="button" className="btn" onClick={onClose}>Cancel</button></div>
      </form>
    </Modal>
  );
}

function ImportModal({ slug, onClose, onDone }) {
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  async function run() {
    setErr('');
    try {
      const rows = parseImport(text);
      if (!rows.length) return setErr('No valid rows. Columns needed: category, name, description, price, image.');
      const d = await api('/tenant/menu/import', { method: 'POST', body: { rows }, tenant: slug }); onDone(d.imported);
    } catch (x) { setErr(x.message.includes('JSON') ? 'Could not parse the data.' : x.message); }
  }
  return (
    <Modal title="Bulk import" onClose={onClose}>
      <p className="muted">Paste CSV (header: <code>category,name,description,price,image</code>) or a JSON array of objects with the same keys.</p>
      <Alert>{err}</Alert>
      <input type="file" accept=".csv,.json" onChange={async (e) => e.target.files[0] && setText(await e.target.files[0].text())} style={{ marginBottom: 8 }} />
      <textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} style={{ width: '100%', fontFamily: 'monospace', padding: 8, border: '1px solid #d0d5dd', borderRadius: 8 }} />
      <div className="row" style={{ marginTop: 10 }}><button className="btn primary" disabled={!text.trim()} onClick={run}>Import</button><button className="btn" onClick={onClose}>Cancel</button></div>
    </Modal>
  );
}

// Sizes, add-ons, spice levels... (shown as choices when a customer adds the item).
function OptionEditor({ groups, onChange }) {
  const upd = (i, patch) => onChange(groups.map((g, k) => (k === i ? { ...g, ...patch } : g)));
  const updOpt = (i, j, patch) => upd(i, { options: groups[i].options.map((o, k) => (k === j ? { ...o, ...patch } : o)) });
  return (
    <div className="opt-editor">
      <div className="row between"><strong>Options &amp; add-ons</strong><button type="button" className="btn sm" onClick={() => onChange([...groups, { name: '', required: false, multiple: false, min: 0, max: 0, options: [{ name: '', price: 0 }] }])}>＋ Add group</button></div>
      <small className="muted">e.g. &ldquo;Size&rdquo; (required, choose one) or &ldquo;Extras&rdquo; (optional, choose many) with a price for each choice.</small>
      {groups.map((g, i) => (
        <div className="opt-group-ed" key={g._id || i}>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input className="select-sm" style={{ flex: 1 }} placeholder="Group name (Size, Extras…)" value={g.name} onChange={(e) => upd(i, { name: e.target.value })} aria-label="Group name" />
            <button type="button" className="btn sm danger" onClick={() => onChange(groups.filter((_, k) => k !== i))}>Remove</button>
          </div>
          <div className="row" style={{ margin: '8px 0' }}>
            <label><input type="checkbox" checked={g.required} onChange={(e) => upd(i, { required: e.target.checked })} /> Required</label>
            <label><input type="checkbox" checked={g.multiple} onChange={(e) => upd(i, { multiple: e.target.checked })} /> Allow many</label>
            {g.multiple && <label>Max <input type="number" min="0" className="select-sm" style={{ width: 64 }} value={g.max} onChange={(e) => upd(i, { max: e.target.value })} /></label>}
          </div>
          {g.options.map((o, j) => (
            <div className="row" key={o._id || j} style={{ flexWrap: 'nowrap', marginBottom: 6 }}>
              <input className="select-sm" style={{ flex: 1 }} placeholder="Choice (Large, Extra cheese…)" value={o.name} onChange={(e) => updOpt(i, j, { name: e.target.value })} aria-label="Choice name" />
              <input className="select-sm" style={{ width: 90 }} type="number" min="0" placeholder="+ Rs." value={o.price} onChange={(e) => updOpt(i, j, { price: e.target.value })} aria-label="Extra price" />
              <button type="button" className="btn sm" onClick={() => upd(i, { options: g.options.filter((_, k) => k !== j) })} aria-label="Remove choice">✕</button>
            </div>
          ))}
          <button type="button" className="btn sm" onClick={() => upd(i, { options: [...g.options, { name: '', price: 0 }] })}>＋ Add choice</button>
        </div>
      ))}
    </div>
  );
}
