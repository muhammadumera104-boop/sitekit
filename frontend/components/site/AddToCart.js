'use client';
import { useState } from 'react';
import { ItemModal } from './StoreCatalog';

// Item page button: opens the same popup as the menu (options, instructions, quantity).
export default function AddToCart({ item, disabled, label = 'Add to cart' }) {
  const [open, setOpen] = useState(false);
  if (disabled) return <p className="sold">This item is currently unavailable.</p>;
  return (
    <>
      <button className="cta lg" onClick={() => setOpen(true)}>{label}</button>
      {open && <ItemModal item={item} onClose={() => setOpen(false)} />}
    </>
  );
}
