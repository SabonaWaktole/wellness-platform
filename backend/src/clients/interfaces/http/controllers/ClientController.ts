import { Request, Response } from 'express';
import { PermissionDeniedError } from '../../../../access/domain/errors';
import { requireTenantId } from "@main/interfaces/http/tenantContext";
import { CreateClientUseCase } from '../../../application/use-cases/CreateClientUseCase';
import { UpdateClientUseCase } from '../../../application/use-cases/UpdateClientUseCase';
import { SearchClientsUseCase } from '../../../application/use-cases/SearchClientsUseCase';
import { GetClientHistoryUseCase } from '../../../application/use-cases/GetClientHistoryUseCase';
import { AddInteractionUseCase } from '../../../application/use-cases/AddInteractionUseCase';
import { DefineCustomFieldUseCase } from '../../../application/use-cases/DefineCustomFieldUseCase';
import { UpdateCustomFieldUseCase } from '../../../application/use-cases/UpdateCustomFieldUseCase';
import { DeleteCustomFieldUseCase } from '../../../application/use-cases/DeleteCustomFieldUseCase';
import { ReorderCustomFieldsUseCase } from '../../../application/use-cases/ReorderCustomFieldsUseCase';
import { DefineOutcomeCategoryUseCase } from '../../../application/use-cases/DefineOutcomeCategoryUseCase';
import { GetClientUseCase } from '../../../application/use-cases/GetClientUseCase';
import { ArchiveClientUseCase } from '../../../application/use-cases/ArchiveClientUseCase';
import { RestoreClientUseCase } from '../../../application/use-cases/RestoreClientUseCase';
import { GetClientRelatedCountsUseCase } from '../../../application/use-cases/GetClientRelatedCountsUseCase';
import { GetCustomFieldsUseCase } from '../../../application/use-cases/GetCustomFieldsUseCase';
import { GetOutcomeCategoriesUseCase } from '../../../application/use-cases/GetOutcomeCategoriesUseCase';
import {
  ImportCustomFieldsUseCase,
  CUSTOM_FIELD_TEMPLATE_HEADERS,
} from '../../../application/use-cases/ImportCustomFieldsUseCase';
import {
  ImportClientsUseCase,
  CLIENT_TEMPLATE_HEADERS,
} from '../../../application/use-cases/ImportClientsUseCase';
import { parseSheet, buildTemplate } from '../../../infrastructure/excel/sheet';
import { FieldType } from '../../../domain/enums/FieldType';
import { ClientStatus } from '../../../domain/enums/ClientStatus';
import { DomainError } from '../../../../shared/domain/errors/DomainError';
import { CompanyReadModel } from '../../../application/CompanyReadModel';
import { sendClientError } from './sendClientError';
import { Client } from '../../../domain/entities/Client';
import {
  createClientHttpSchema,
  updateClientSchema,
  searchClientsSchema,
  addInteractionSchema,
  defineCustomFieldSchema,
  updateCustomFieldSchema,
  reorderCustomFieldsSchema,
  defineOutcomeCategorySchema
} from '../schemas/clientSchemas';

export class ClientController {
  constructor(
    private createClientUseCase: CreateClientUseCase,
    private updateClientUseCase: UpdateClientUseCase,
    private searchClientsUseCase: SearchClientsUseCase,
    private getClientHistoryUseCase: GetClientHistoryUseCase,
    private addInteractionUseCase: AddInteractionUseCase,
    private defineCustomFieldUseCase: DefineCustomFieldUseCase,
    private updateCustomFieldUseCase: UpdateCustomFieldUseCase,
    private deleteCustomFieldUseCase: DeleteCustomFieldUseCase,
    private reorderCustomFieldsUseCase: ReorderCustomFieldsUseCase,
    private defineOutcomeCategoryUseCase: DefineOutcomeCategoryUseCase,
    private getClientUseCase: GetClientUseCase,
    private getCustomFieldsUseCase: GetCustomFieldsUseCase,
    private getOutcomeCategoriesUseCase: GetOutcomeCategoriesUseCase,
    private importCustomFieldsUseCase: ImportCustomFieldsUseCase,
    private importClientsUseCase: ImportClientsUseCase,
    private archiveClientUseCase: ArchiveClientUseCase,
    private restoreClientUseCase: RestoreClientUseCase,
    private getClientRelatedCountsUseCase: GetClientRelatedCountsUseCase,
    private companyReadModel: CompanyReadModel
  ) {}

  /**
   * Multer buffers the upload in memory; an absent file means the client sent
   * the form without picking one.
   */
  private readUpload = (req: Request): Buffer => {
    const file = (req as any).file as { buffer: Buffer } | undefined;
    if (!file) throw new DomainError('No file was uploaded.');
    return file.buffer;
  };

  private sendWorkbook = (res: Response, filename: string, buffer: Buffer) => {
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(buffer);
  };

  public importCustomFields = async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenantId(req);
      const sheet = await parseSheet(this.readUpload(req));

      const result = await this.importCustomFieldsUseCase.execute({
        tenantId,
        access: req.access!,
        sheet,
      });

      res.status(200).json(result);
    } catch (error: any) {
      if (error instanceof PermissionDeniedError) {
        res.status(403).json({ error: error.message });
      } else {
        res.status(400).json({ error: error.message });
      }
    }
  };

  public downloadCustomFieldTemplate = async (_req: Request, res: Response) => {
    try {
      const buffer = await buildTemplate('Custom Fields', CUSTOM_FIELD_TEMPLATE_HEADERS, [
        ['Company Size', FieldType.ALPHANUMERIC, ''],
        ['Industry', FieldType.SINGLE_SELECT, 'Retail; Services; Manufacturing'],
        ['Services Used', FieldType.MULTI_SELECT, 'Consulting; Support; Training'],
      ]);
      this.sendWorkbook(res, 'custom-fields-template.xlsx', buffer);
    } catch (error: any) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  public importClients = async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenantId(req);
      const sheet = await parseSheet(this.readUpload(req));

      const result = await this.importClientsUseCase.execute({
        tenantId,
        authorUserId: req.user!.userId,
        access: req.access!,
        sheet,
      });

      res.status(200).json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  };

  public downloadClientTemplate = async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenantId(req);
      // Built from the tenant's current definitions so the header row already
      // names every custom field the importer will accept.
      const fields = await this.getCustomFieldsUseCase.execute(tenantId);
      const headers = [...CLIENT_TEMPLATE_HEADERS, ...fields.map(f => f.fieldName)];
      const sample = ['Acme Ltd', 'contact@acme.com', '+1234567890', ClientStatus.PROSPECT];

      const buffer = await buildTemplate('Clients', headers, [
        [...sample, ...fields.map(() => '')],
      ]);
      this.sendWorkbook(res, 'clients-template.xlsx', buffer);
    } catch (error: any) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  /** The wire shape for one client: its own fields plus the enriched Slice 11 profile. */
  private async presentClient(tenantId: string, client: Client) {
    const profile = await this.companyReadModel.enrichOne(tenantId, client);
    return {
      id: client.id,
      name: client.name,
      contactInfo: client.contactInfo,
      status: client.status,
      assignedUserId: client.assignedUserId,
      customFieldValues: client.customFieldValues,
      notes: client.notes,
      profile,
      lastUpdatedByUserId: client.lastUpdatedByUserId,
      createdAt: client.createdAt,
      updatedAt: client.updatedAt,
    };
  }

  public createClient = async (req: Request, res: Response) => {
    try {
      const validatedData = createClientHttpSchema.parse(req.body);
      const tenantId = requireTenantId(req);
      const authorUserId = req.user!.userId;

      const { client, warnings } = await this.createClientUseCase.execute({
        ...validatedData,
        tenantId,
        authorUserId,
        access: req.access!,
      });

      res.status(201).json({ ...(await this.presentClient(tenantId, client)), warnings });
    } catch (error) {
      sendClientError(res, error);
    }
  };

  public getClient = async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenantId(req);
      const clientId = req.params.clientId as string;
      const client = await this.getClientUseCase.execute(tenantId, clientId, req.access!);
      res.status(200).json(await this.presentClient(tenantId, client));
    } catch (error: any) {
      if (error instanceof DomainError) {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  };

  public updateClient = async (req: Request, res: Response) => {
    try {
      const validatedData = updateClientSchema.parse(req.body);
      const tenantId = requireTenantId(req);
      const updatingUserId = req.user!.userId;
      const clientId = req.params.clientId as string;

      const { client, warnings } = await this.updateClientUseCase.execute({
        tenantId,
        clientId,
        updatingUserId,
        access: req.access!,
        ...validatedData
      });

      res.status(200).json({ ...(await this.presentClient(tenantId, client)), warnings });
    } catch (error) {
      sendClientError(res, error);
    }
  };

  public searchClients = async (req: Request, res: Response) => {
    try {
      const validatedData = searchClientsSchema.parse(req.query);
      const tenantId = requireTenantId(req);

      const result = await this.searchClientsUseCase.execute({
        tenantId,
        access: req.access!,
        reach: validatedData.reach,
        filters: {
          search: validatedData.search,
          name: validatedData.name,
          email: validatedData.email,
          phone: validatedData.phone,
          status: validatedData.status,
          assignedUserId: validatedData.assignedUserId,
          archived: validatedData.archived,
          customFields: validatedData.customFields,
          businessTypeId: validatedData.businessTypeId,
          riskLevelId: validatedData.riskLevelId,
          areaId: validatedData.areaId,
          cityId: validatedData.cityId,
        },
        skip: validatedData.skip,
        take: validatedData.take,
      });

      const profiles = await this.companyReadModel.enrichMany(tenantId, result.items);
      res.status(200).json({
        total: result.total,
        items: result.items.map((client, index) => ({
          id: client.id,
          name: client.name,
          contactInfo: client.contactInfo,
          status: client.status,
          assignedUserId: client.assignedUserId,
          customFieldValues: client.customFieldValues,
          notes: client.notes,
          profile: profiles[index],
          lastUpdatedByUserId: client.lastUpdatedByUserId,
          createdAt: client.createdAt,
          updatedAt: client.updatedAt,
        })),
      });
    } catch (error) {
      sendClientError(res, error);
    }
  };

  public getHistory = async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenantId(req);
      const clientId = req.params.clientId as string;

      const result = await this.getClientHistoryUseCase.execute({ tenantId, clientId, access: req.access! });
      res.status(200).json(result);
    } catch (error: any) {
      res.status(404).json({ error: error.message });
    }
  };

  public addInteraction = async (req: Request, res: Response) => {
    try {
      const validatedData = addInteractionSchema.parse(req.body);
      const tenantId = requireTenantId(req);
      const clientId = req.params.clientId as string;
      const authorUserId = req.user!.userId;

      const interaction = await this.addInteractionUseCase.execute({
        tenantId,
        clientId,
        authorUserId,
        access: req.access!,
        ...validatedData
      });

      res.status(201).json(interaction);
    } catch (error: any) {
      if (error.message.includes('not found')) {
        res.status(404).json({ error: error.message });
      } else {
        res.status(400).json({ error: error.message });
      }
    }
  };

  public defineCustomField = async (req: Request, res: Response) => {
    try {
      const validatedData = defineCustomFieldSchema.parse(req.body);
      const tenantId = requireTenantId(req);

      const definition = await this.defineCustomFieldUseCase.execute({
        tenantId,
        access: req.access!,
        ...validatedData
      });

      res.status(201).json(definition);
    } catch (error: any) {
      if (error instanceof PermissionDeniedError) {
        res.status(403).json({ error: error.message });
      } else {
        res.status(400).json({ error: error.message });
      }
    }
  };

  public updateCustomField = async (req: Request, res: Response) => {
    try {
      const validatedData = updateCustomFieldSchema.parse(req.body);
      const tenantId = requireTenantId(req);
      const fieldId = req.params.fieldId as string;

      const definition = await this.updateCustomFieldUseCase.execute({
        tenantId,
        access: req.access!,
        fieldId,
        ...validatedData
      });

      res.status(200).json(definition);
    } catch (error: any) {
      if (error instanceof PermissionDeniedError) {
        res.status(403).json({ error: error.message });
      } else if (error.message.includes('not found')) {
        res.status(404).json({ error: error.message });
      } else {
        res.status(400).json({ error: error.message });
      }
    }
  };

  public deleteCustomField = async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenantId(req);
      const fieldId = req.params.fieldId as string;

      const result = await this.deleteCustomFieldUseCase.execute({
        tenantId,
        access: req.access!,
        fieldId,
      });

      res.status(200).json(result);
    } catch (error: any) {
      if (error instanceof PermissionDeniedError) {
        res.status(403).json({ error: error.message });
      } else if (error.message.includes('not found')) {
        res.status(404).json({ error: error.message });
      } else {
        res.status(400).json({ error: error.message });
      }
    }
  };

  public reorderCustomFields = async (req: Request, res: Response) => {
    try {
      const validatedData = reorderCustomFieldsSchema.parse(req.body);
      const tenantId = requireTenantId(req);

      await this.reorderCustomFieldsUseCase.execute({
        tenantId,
        access: req.access!,
        orderedFieldIds: validatedData.orderedFieldIds,
      });

      res.status(204).send();
    } catch (error: any) {
      if (error instanceof PermissionDeniedError) {
        res.status(403).json({ error: error.message });
      } else {
        res.status(400).json({ error: error.message });
      }
    }
  };

  public defineOutcomeCategory = async (req: Request, res: Response) => {
    try {
      const validatedData = defineOutcomeCategorySchema.parse(req.body);
      const tenantId = requireTenantId(req);

      const category = await this.defineOutcomeCategoryUseCase.execute({
        tenantId,
        access: req.access!,
        ...validatedData
      });

      res.status(201).json(category);
    } catch (error: any) {
      if (error instanceof PermissionDeniedError) {
        res.status(403).json({ error: error.message });
      } else {
        res.status(400).json({ error: error.message });
      }
    }
  };

  getCustomFields = async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenantId(req);
      const fields = await this.getCustomFieldsUseCase.execute(tenantId);
      res.status(200).json(fields);
    } catch (error: any) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  getOutcomeCategories = async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenantId(req);
      const categories = await this.getOutcomeCategoriesUseCase.execute(tenantId);
      res.status(200).json(categories);
    } catch (error: any) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };


  /**
   * Archives a client. DELETE rather than POST because that is what the verb
   * means to the caller — the soft/hard distinction is an implementation
   * detail of how the row survives, not of the client's intent.
   */
  public archiveClient = async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenantId(req);
      const result = await this.archiveClientUseCase.execute({
        tenantId,
        access: req.access!,
        requestingUserId: req.user!.userId,
        clientId: req.params.clientId as string,
      });
      res.status(200).json(result);
    } catch (error: any) {
      if (error instanceof PermissionDeniedError) {
        res.status(403).json({ error: error.message });
      } else if (error.message.includes('not found')) {
        res.status(404).json({ error: error.message });
      } else {
        res.status(400).json({ error: error.message });
      }
    }
  };

  public restoreClient = async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenantId(req);
      const result = await this.restoreClientUseCase.execute({
        tenantId,
        access: req.access!,
        requestingUserId: req.user!.userId,
        clientId: req.params.clientId as string,
      });
      res.status(200).json(result);
    } catch (error: any) {
      if (error instanceof PermissionDeniedError) {
        res.status(403).json({ error: error.message });
      } else if (error.message.includes('not found')) {
        res.status(404).json({ error: error.message });
      } else {
        res.status(400).json({ error: error.message });
      }
    }
  };

  /** Powers the archive confirmation dialog. */
  public getClientRelatedCounts = async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenantId(req);
      const counts = await this.getClientRelatedCountsUseCase.execute(
        tenantId,
        req.params.clientId as string,
        req.access!
      );
      res.status(200).json(counts);
    } catch (error: any) {
      res.status(error.message.includes('not found') ? 404 : 400).json({ error: error.message });
    }
  };
}
