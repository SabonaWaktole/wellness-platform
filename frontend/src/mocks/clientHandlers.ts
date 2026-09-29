import { http, HttpResponse } from 'msw';
import { ClientStatus } from '../types/client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const mockClients = [
  {
    id: 'c1',
    name: 'Acme Corp',
    contactInfo: { email: 'contact@acme.com', phone: '123-456-7890' },
    status: ClientStatus.CLIENT,
    assignedUserId: 'u1',
    customFieldValues: { industry: 'Tech' },
    lastUpdatedByUserId: 'u1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'c2',
    name: 'Globex Inc',
    contactInfo: { email: 'hello@globex.com' },
    status: ClientStatus.PROSPECT,
    assignedUserId: null,
    customFieldValues: {},
    lastUpdatedByUserId: 'u1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
];

/** Slice 12 contacts (FR-CMP-04), keyed by clientId. */
const mockContacts: Record<string, any[]> = {
  c1: [
    { id: 'ct1', clientId: 'c1', name: 'Jane Doe', position: 'Owner', phone: '+1 555 0100', email: 'jane@acme.com', isPrimary: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  ],
  c2: [],
};

export const clientHandlers = [
  http.get(`${API_URL}/:tenantSlug/clients/search`, ({ request }) => {
    const url = new URL(request.url);
    const name = url.searchParams.get('name');
    
    let items = [...mockClients];
    if (name) {
      items = items.filter(c => c.name.toLowerCase().includes(name.toLowerCase()));
    }

    return HttpResponse.json({ items, total: items.length });
  }),

  http.get(`${API_URL}/:tenantSlug/clients/:clientId`, ({ params }) => {
    const client = mockClients.find(c => c.id === params.clientId);
    if (!client) {
      return new HttpResponse(null, { status: 404 });
    }
    return HttpResponse.json({ ...client, contacts: mockContacts[client.id] ?? [] });
  }),

  http.post(`${API_URL}/:tenantSlug/clients`, async ({ request }) => {
    const body = await request.json() as any;
    const newClient = {
      id: `c${Date.now()}`,
      name: body.name,
      contactInfo: { email: body.email, phone: body.phone },
      status: body.status || ClientStatus.PROSPECT,
      assignedUserId: body.assignedUserId || null,
      customFieldValues: body.customFieldValues || {},
      lastUpdatedByUserId: 'u1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mockClients.push(newClient);
    mockContacts[newClient.id] = (body.contacts || []).map((c: any, i: number) => ({
      id: `ct${Date.now()}${i}`,
      clientId: newClient.id,
      name: c.name,
      position: c.position ?? null,
      phone: c.phone ?? null,
      email: c.email ?? null,
      isPrimary: i === 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    return HttpResponse.json({ ...newClient, contacts: mockContacts[newClient.id] }, { status: 201 });
  }),

  http.put(`${API_URL}/:tenantSlug/clients/:clientId`, async ({ params, request }) => {
    const clientIndex = mockClients.findIndex(c => c.id === params.clientId);
    if (clientIndex === -1) return new HttpResponse(null, { status: 404 });
    
    const body = await request.json() as any;
    const existingClient = mockClients[clientIndex];
    
    const updatedClient = {
      ...existingClient,
      ...body,
      contactInfo: {
        email: body.email !== undefined ? body.email : existingClient.contactInfo.email,
        phone: body.phone !== undefined ? body.phone : existingClient.contactInfo.phone,
      },
      customFieldValues: { ...existingClient.customFieldValues, ...body.customFieldValues },
      updatedAt: new Date().toISOString()
    };
    
    mockClients[clientIndex] = updatedClient;
    return HttpResponse.json(updatedClient);
  }),

  http.get(`${API_URL}/:tenantSlug/clients/settings/custom-fields`, () => {
    return HttpResponse.json([
      { id: 'cf1', tenantId: 't1', fieldName: 'industry', fieldType: 'TEXT', isRequired: false },
      { id: 'cf2', tenantId: 't1', fieldName: 'employeeCount', fieldType: 'NUMBER', isRequired: false }
    ]);
  }),

  http.get(`${API_URL}/:tenantSlug/clients/settings/outcome-categories`, () => {
    return HttpResponse.json([
      { id: 'oc1', tenantId: 't1', label: 'Positive' },
      { id: 'oc2', tenantId: 't1', label: 'Neutral' },
      { id: 'oc3', tenantId: 't1', label: 'Negative' }
    ]);
  }),

  http.get(`${API_URL}/:tenantSlug/clients/:clientId/history`, () => {
    return HttpResponse.json({
      timeline: [
        {
          id: 'i1',
          timestamp: new Date().toISOString(),
          type: 'INTERACTION_ADDED',
          description: 'Added an interaction',
          actor: 'User 1',
          details: { channel: 'EMAIL', content: 'Sent initial proposal' }
        },
        {
          id: 'h1',
          timestamp: new Date(Date.now() - 86400000).toISOString(),
          type: 'CLIENT_CREATED',
          description: 'Created client record',
          actor: 'User 1'
        }
      ]
    });
  }),
  
  http.post(`${API_URL}/:tenantSlug/clients/:clientId/contacts`, async ({ params, request }) => {
    const clientId = params.clientId as string;
    const body = await request.json() as any;
    const list = mockContacts[clientId] ?? (mockContacts[clientId] = []);
    const contact = {
      id: `ct${Date.now()}`,
      clientId,
      name: body.name,
      position: body.position ?? null,
      phone: body.phone ?? null,
      email: body.email ?? null,
      isPrimary: list.length === 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    list.push(contact);
    return HttpResponse.json(contact, { status: 201 });
  }),

  http.patch(`${API_URL}/:tenantSlug/clients/:clientId/contacts/:contactId`, async ({ params, request }) => {
    const list = mockContacts[params.clientId as string] ?? [];
    const contact = list.find((c) => c.id === params.contactId);
    if (!contact) return new HttpResponse(null, { status: 404 });
    const body = await request.json() as any;
    Object.assign(contact, body, { updatedAt: new Date().toISOString() });
    return HttpResponse.json(contact);
  }),

  http.delete(`${API_URL}/:tenantSlug/clients/:clientId/contacts/:contactId`, ({ params, request }) => {
    const list = mockContacts[params.clientId as string] ?? [];
    const index = list.findIndex((c) => c.id === params.contactId);
    if (index === -1) return new HttpResponse(null, { status: 404 });
    const removed = list[index];
    if (list.length === 1) return HttpResponse.json({ error: 'Last contact', code: 'PRIMARY_CONTACT_REQUIRED' }, { status: 400 });
    if (removed.isPrimary) {
      const newPrimaryId = new URL(request.url).searchParams.get('newPrimaryContactId');
      const successor = list.find((c) => c.id === newPrimaryId);
      if (!successor) return HttpResponse.json({ error: 'Choose a new primary', code: 'PRIMARY_CONTACT_REQUIRED' }, { status: 400 });
      successor.isPrimary = true;
    }
    list.splice(index, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${API_URL}/:tenantSlug/clients/:clientId/contacts/:contactId/primary`, ({ params }) => {
    const list = mockContacts[params.clientId as string] ?? [];
    const contact = list.find((c) => c.id === params.contactId);
    if (!contact) return new HttpResponse(null, { status: 404 });
    list.forEach((c) => { c.isPrimary = c.id === contact.id; });
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${API_URL}/:tenantSlug/clients/:clientId/interactions`, async ({ request }) => {
    const body = await request.json() as any;
    return HttpResponse.json({
      id: `i${Date.now()}`,
      clientId: 'c1', // mock
      type: 'NOTE',
      channel: body.channel || 'NOTE',
      content: body.content,
      outcomeCategoryId: body.outcomeCategoryId || null,
      authorUserId: 'u1',
      createdAt: new Date().toISOString()
    }, { status: 201 });
  }),
];
