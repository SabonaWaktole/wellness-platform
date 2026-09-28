import { Request, Response } from 'express';
import { PermissionDeniedError } from '../../../../access/domain/errors';
import { requireTenantId } from '@main/interfaces/http/tenantContext';
import { GetClientFormUseCase, ClientFormView } from '../../../application/use-cases/GetClientFormUseCase';
import { GetClientFormsUseCase } from '../../../application/use-cases/GetClientFormsUseCase';
import { CreateClientFormUseCase } from '../../../application/use-cases/CreateClientFormUseCase';
import { UpdateClientFormSettingsUseCase } from '../../../application/use-cases/UpdateClientFormSettingsUseCase';
import { DuplicateClientFormUseCase } from '../../../application/use-cases/DuplicateClientFormUseCase';
import { SaveAsTemplateUseCase } from '../../../application/use-cases/SaveAsTemplateUseCase';
import { CreateFormFromTemplateUseCase } from '../../../application/use-cases/CreateFormFromTemplateUseCase';
import { DeleteClientFormUseCase } from '../../../application/use-cases/DeleteClientFormUseCase';
import { StoreFormAssetUseCase } from '../../../application/use-cases/StoreFormAssetUseCase';
import {
  UpdateClientFormLayoutUseCase,
  FormVersionConflictError,
} from '../../../application/use-cases/UpdateClientFormLayoutUseCase';
import { PublishFormUseCase } from '../../../application/use-cases/PublishFormUseCase';
import { ListFormVersionsUseCase } from '../../../application/use-cases/ListFormVersionsUseCase';
import { GetFormVersionUseCase } from '../../../application/use-cases/GetFormVersionUseCase';
import { ListSubmissionsUseCase } from '../../../application/use-cases/ListSubmissionsUseCase';
import { GetSubmissionUseCase, SubmissionDetail } from '../../../application/use-cases/GetSubmissionUseCase';
import { ClientForm } from '../../../domain/entities/ClientForm';
import { FormVersion } from '../../../domain/entities/FormVersion';
import { FormSubmission } from '../../../domain/entities/FormSubmission';
import { FormStatus } from '../../../domain/enums/FormStatus';
import {
  updateFormLayoutSchema,
  createClientFormSchema,
  updateClientFormSettingsSchema,
  duplicateClientFormSchema,
  saveAsTemplateSchema,
  createFormFromTemplateSchema,
  publishFormSchema,
} from '../schemas/formSchemas';

/**
 * Wire shape for a form.
 *
 * The layout is sent already reconciled against the tenant's live definitions
 * (orphans dropped, unplaced fields appended) together with those definitions,
 * so the builder and the renderer can draw every field from one response
 * instead of cross-referencing two.
 */
const toJson = (view: ClientFormView) => ({
  id: view.form.id,
  name: view.form.name,
  description: view.form.description,
  isDefault: view.form.isDefault,
  isTemplate: view.form.isTemplate,
  status: view.form.status,
  version: view.form.version,
  layout: view.layout,
  definitions: view.definitions,
  unplacedFieldIds: view.unplacedFieldIds,
  updatedAt: view.form.updatedAt,
  shareToken: view.form.shareToken,
  publishedVersionId: view.form.publishedVersionId,
  hasUnpublishedChanges: view.form.hasUnpublishedChanges(),
});

/** The list view — no layout/definitions payload, this is just the picker. */
const toSummaryJson = (form: ClientForm) => ({
  id: form.id,
  name: form.name,
  description: form.description,
  isDefault: form.isDefault,
  isTemplate: form.isTemplate,
  status: form.status,
  version: form.version,
  updatedAt: form.updatedAt,
  shareToken: form.shareToken,
  publishedVersionId: form.publishedVersionId,
  hasUnpublishedChanges: form.hasUnpublishedChanges(),
});

const toVersionSummaryJson = (version: FormVersion) => ({
  id: version.id,
  versionNumber: version.versionNumber,
  publishedAt: version.publishedAt,
  publishedByUserId: version.publishedByUserId,
});

const toVersionJson = (version: FormVersion) => ({
  ...toVersionSummaryJson(version),
  document: version.document,
});

const toSubmissionSummaryJson = (submission: FormSubmission) => ({
  id: submission.id,
  submittedAt: submission.submittedAt,
  clientId: submission.clientId,
  source: submission.source,
});

const toSubmissionDetailJson = (detail: SubmissionDetail) => ({
  id: detail.submission.id,
  submittedAt: detail.submission.submittedAt,
  clientId: detail.submission.clientId,
  source: detail.submission.source,
  data: detail.submission.data,
  version: toVersionSummaryJson(detail.version),
  document: detail.version.document,
});

/** Maps a use-case error to a status code: by type where the error has one,
 *  otherwise by message, because DomainError carries no code of its own. */
const statusFor = (error: any): number => {
  if (error instanceof FormVersionConflictError) return 409;
  if (error instanceof PermissionDeniedError) return 403;
  if (error.message?.includes('not found')) return 404;
  return 400;
};

export class FormController {
  constructor(
    private getClientFormUseCase: GetClientFormUseCase,
    private updateClientFormLayoutUseCase: UpdateClientFormLayoutUseCase,
    private getClientFormsUseCase: GetClientFormsUseCase,
    private createClientFormUseCase: CreateClientFormUseCase,
    private updateClientFormSettingsUseCase: UpdateClientFormSettingsUseCase,
    private duplicateClientFormUseCase: DuplicateClientFormUseCase,
    private saveAsTemplateUseCase: SaveAsTemplateUseCase,
    private createFormFromTemplateUseCase: CreateFormFromTemplateUseCase,
    private deleteClientFormUseCase: DeleteClientFormUseCase,
    private storeFormAssetUseCase: StoreFormAssetUseCase,
    private publishFormUseCase: PublishFormUseCase,
    private listFormVersionsUseCase: ListFormVersionsUseCase,
    private getFormVersionUseCase: GetFormVersionUseCase,
    private listSubmissionsUseCase: ListSubmissionsUseCase,
    private getSubmissionUseCase: GetSubmissionUseCase
  ) {}

  public listForms = async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenantId(req);
      const forms = await this.getClientFormsUseCase.execute(tenantId);
      res.json(forms.map(toSummaryJson));
    } catch (error: any) {
      res.status(statusFor(error)).json({ error: error.message });
    }
  };

  public createForm = async (req: Request, res: Response) => {
    try {
      const validated = createClientFormSchema.parse(req.body);
      const tenantId = requireTenantId(req);
      const form = await this.createClientFormUseCase.execute({
        tenantId,
        access: req.access!,
        name: validated.name,
        description: validated.description,
      });
      res.status(201).json(toSummaryJson(form));
    } catch (error: any) {
      res.status(statusFor(error)).json({ error: error.message });
    }
  };

  public updateSettings = async (req: Request, res: Response) => {
    try {
      const validated = updateClientFormSettingsSchema.parse(req.body);
      const tenantId = requireTenantId(req);
      const form = await this.updateClientFormSettingsUseCase.execute({
        tenantId,
        access: req.access!,
        formId: String(req.params.formId),
        ...validated,
        status: validated.status as FormStatus | undefined,
      });
      res.json(toSummaryJson(form));
    } catch (error: any) {
      res.status(statusFor(error)).json({ error: error.message });
    }
  };

  public duplicateForm = async (req: Request, res: Response) => {
    try {
      const validated = duplicateClientFormSchema.parse(req.body);
      const tenantId = requireTenantId(req);
      const form = await this.duplicateClientFormUseCase.execute(
        tenantId,
        req.access!,
        String(req.params.formId),
        validated.name
      );
      res.status(201).json(toSummaryJson(form));
    } catch (error: any) {
      res.status(statusFor(error)).json({ error: error.message });
    }
  };

  /** The "Create from template" picker's list — templates only. */
  public listTemplates = async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenantId(req);
      const templates = await this.getClientFormsUseCase.executeTemplates(tenantId);
      res.json(templates.map(toSummaryJson));
    } catch (error: any) {
      res.status(statusFor(error)).json({ error: error.message });
    }
  };

  public saveAsTemplate = async (req: Request, res: Response) => {
    try {
      const validated = saveAsTemplateSchema.parse(req.body);
      const tenantId = requireTenantId(req);
      const template = await this.saveAsTemplateUseCase.execute(
        tenantId,
        req.access!,
        String(req.params.formId),
        validated.name
      );
      res.status(201).json(toSummaryJson(template));
    } catch (error: any) {
      res.status(statusFor(error)).json({ error: error.message });
    }
  };

  public createFormFromTemplate = async (req: Request, res: Response) => {
    try {
      const validated = createFormFromTemplateSchema.parse(req.body);
      const tenantId = requireTenantId(req);
      const form = await this.createFormFromTemplateUseCase.execute(
        tenantId,
        req.access!,
        String(req.params.templateId),
        validated.name
      );
      res.status(201).json(toSummaryJson(form));
    } catch (error: any) {
      res.status(statusFor(error)).json({ error: error.message });
    }
  };

  public deleteForm = async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenantId(req);
      await this.deleteClientFormUseCase.execute(tenantId, req.access!, String(req.params.formId));
      res.status(204).end();
    } catch (error: any) {
      res.status(statusFor(error)).json({ error: error.message });
    }
  };

  public uploadAsset = async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenantId(req);
      const file = (req as any).file;
      if (!file) {
        res.status(400).json({ error: 'No image was uploaded.' });
        return;
      }
      const asset = await this.storeFormAssetUseCase.execute(tenantId, req.access!, file.buffer);
      res.status(201).json(asset);
    } catch (error: any) {
      res.status(statusFor(error)).json({ error: error.message });
    }
  };

  /** The form the internal client create/edit page renders. Seeds on first read. */
  public getDefaultForm = async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenantId(req);
      const view = await this.getClientFormUseCase.executeDefault(tenantId);
      if (!view) {
        res.status(404).json({ error: 'Form not found' });
        return;
      }
      res.json(toJson(view));
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  };

  public getForm = async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenantId(req);
      const view = await this.getClientFormUseCase.execute(tenantId, String(req.params.formId));
      if (!view) {
        res.status(404).json({ error: 'Form not found' });
        return;
      }
      res.json(toJson(view));
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  };

  public updateLayout = async (req: Request, res: Response) => {
    try {
      const validatedData = updateFormLayoutSchema.parse(req.body);
      const tenantId = requireTenantId(req);

      await this.updateClientFormLayoutUseCase.execute({
        tenantId,
        access: req.access!,
        formId: String(req.params.formId),
        layout: validatedData.layout,
        expectedVersion: validatedData.expectedVersion,
      });

      // Re-read rather than returning the entity: the response has to carry the
      // reconciled layout and live definitions the builder renders from, and
      // hand-assembling that here is how the two drift apart.
      const view = await this.getClientFormUseCase.execute(tenantId, String(req.params.formId));
      if (!view) {
        res.status(404).json({ error: 'Form not found' });
        return;
      }
      res.json(toJson(view));
    } catch (error: any) {
      res.status(statusFor(error)).json({ error: error.message });
    }
  };

  public publishForm = async (req: Request, res: Response) => {
    try {
      const validated = publishFormSchema.parse(req.body);
      const tenantId = requireTenantId(req);
      const { form, version } = await this.publishFormUseCase.execute({
        tenantId,
        access: req.access!,
        formId: String(req.params.formId),
        expectedVersion: validated.expectedVersion,
        publishedByUserId: req.user!.userId,
      });
      res.json({ form: toSummaryJson(form), version: toVersionSummaryJson(version) });
    } catch (error: any) {
      res.status(statusFor(error)).json({ error: error.message });
    }
  };

  public listVersions = async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenantId(req);
      const versions = await this.listFormVersionsUseCase.execute(tenantId, String(req.params.formId));
      res.json(versions.map(toVersionSummaryJson));
    } catch (error: any) {
      res.status(statusFor(error)).json({ error: error.message });
    }
  };

  public getVersion = async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenantId(req);
      const versionNumber = Number(req.params.versionNumber);
      if (!Number.isInteger(versionNumber) || versionNumber < 1) {
        res.status(400).json({ error: 'Invalid version number' });
        return;
      }
      const version = await this.getFormVersionUseCase.execute(tenantId, String(req.params.formId), versionNumber);
      if (!version) {
        res.status(404).json({ error: 'Version not found' });
        return;
      }
      res.json(toVersionJson(version));
    } catch (error: any) {
      res.status(statusFor(error)).json({ error: error.message });
    }
  };

  public listSubmissions = async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenantId(req);
      const submissions = await this.listSubmissionsUseCase.execute(tenantId, req.access!, String(req.params.formId));
      res.json(submissions.map(toSubmissionSummaryJson));
    } catch (error: any) {
      res.status(statusFor(error)).json({ error: error.message });
    }
  };

  public getSubmission = async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenantId(req);
      const detail = await this.getSubmissionUseCase.execute(
        tenantId,
        req.access!,
        String(req.params.formId),
        String(req.params.submissionId)
      );
      if (!detail) {
        res.status(404).json({ error: 'Submission not found' });
        return;
      }
      res.json(toSubmissionDetailJson(detail));
    } catch (error: any) {
      res.status(statusFor(error)).json({ error: error.message });
    }
  };
}
