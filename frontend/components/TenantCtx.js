'use client';
import { createContext, useContext } from 'react';

const Ctx = createContext(null);
export const TenantProvider = Ctx.Provider;
// { slug, tenant: {name, status, ...}, impersonating, reload }
export const useTenant = () => useContext(Ctx);
