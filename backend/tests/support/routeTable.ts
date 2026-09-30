import express from 'express';
import { PermissionScope } from '../../src/access/domain/PermissionScope';

export type RouteGate =
  | { kind: 'permission'; key: string; minScope: PermissionScope | null }
  | { kind: 'roles'; roles: string[] }
  | { kind: 'none' };

export interface RouteEntry {
  method: string;
  /** The full path, e.g. `/api/:tenantSlug/clients/:clientId`. */
  path: string;
  gate: RouteGate;
}

interface Layer {
  name?: string;
  handle: any;
  route?: { path: string; methods: Record<string, boolean>; stack: Layer[] };
  regexp: RegExp & { fast_slash?: boolean };
  keys: Array<{ name: string | number }>;
}

/**
 * Turns an Express 4 mount-point regexp (path-to-regexp 0.1.x) back into the
 * path it was built from, e.g. `^\/api(?:\/([^\/]+?))\/clients\/?(?=\/|$)`
 * → `/api/:tenantSlug/clients`.
 */
function mountPath(layer: Layer): string {
  if (layer.regexp.fast_slash) return '';
  let keyIndex = 0;
  return layer.regexp.source
    .replace(/^\^/, '')
    .replace(/\\\/\?\(\?=\\\/\|\$\)$/, '')
    .replace(/\\\//g, '/')
    .split('(?:/([^/]+?))')
    .reduce((path, part, i) => (i === 0 ? part : `${path}/:${layer.keys[keyIndex++]?.name ?? 'param'}${part}`), '');
}

function gateOf(handles: any[]): RouteGate {
  for (const handle of handles) {
    if (typeof handle?.permissionKey === 'string') {
      return { kind: 'permission', key: handle.permissionKey, minScope: handle.minScope ?? null };
    }
  }
  for (const handle of handles) {
    if (Array.isArray(handle?.authorizedRoles)) return { kind: 'roles', roles: handle.authorizedRoles };
  }
  return { kind: 'none' };
}

function walk(stack: Layer[], prefix: string, inherited: any[], out: RouteEntry[]): void {
  // Gate middleware mounted with `router.use(requirePermission(...))` applies
  // to every route registered after it in the same router.
  const routerWide = [...inherited];
  for (const layer of stack) {
    if (layer.route) {
      const handles = layer.route.stack.map((l) => l.handle);
      const gate = gateOf([...handles, ...routerWide]);
      const path = `${prefix}${layer.route.path === '/' ? '' : layer.route.path}` || '/';
      for (const method of Object.keys(layer.route.methods).filter((m) => layer.route!.methods[m] && m !== '_all')) {
        out.push({ method: method.toUpperCase(), path, gate });
      }
    } else if (layer.name === 'router' && layer.handle?.stack) {
      walk(layer.handle.stack, `${prefix}${mountPath(layer)}`, routerWide, out);
    } else if (layer.handle?.permissionKey || layer.handle?.authorizedRoles) {
      routerWide.push(layer.handle);
    }
  }
}

/** Every route the app serves, with the permission gate each one declares. */
export function routeTable(app: express.Express): RouteEntry[] {
  const out: RouteEntry[] = [];
  walk((app as any)._router.stack, '', [], out);
  return out;
}

export const routeId = (route: Pick<RouteEntry, 'method' | 'path'>) => `${route.method} ${route.path}`;
