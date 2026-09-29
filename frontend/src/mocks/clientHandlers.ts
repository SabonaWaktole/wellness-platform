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
    return HttpResponse.json(client);
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
    return HttpResponse.json(newClient, { status: 201 });
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
