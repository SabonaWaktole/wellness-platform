import { Request, Response } from 'express';
import { PermissionDeniedError } from '../../../../access/domain/errors';
import { requireTenantId } from "@main/interfaces/http/tenantContext";
import { CreateAppointmentUseCase } from '../../../application/use-cases/CreateAppointmentUseCase';
import { RescheduleAppointmentUseCase } from '../../../application/use-cases/RescheduleAppointmentUseCase';
import { CancelAppointmentUseCase } from '../../../application/use-cases/CancelAppointmentUseCase';
import { UpdateAppointmentStatusUseCase } from '../../../application/use-cases/UpdateAppointmentStatusUseCase';
import { SearchAppointmentsUseCase } from '../../../application/use-cases/SearchAppointmentsUseCase';
import { GetUpcomingAppointmentsUseCase } from '../../../application/use-cases/GetUpcomingAppointmentsUseCase';
import { GetAppointmentHistoryUseCase } from '../../../application/use-cases/GetAppointmentHistoryUseCase';
import { DomainError } from '../../../../shared/domain/errors/DomainError';
import {
  createAppointmentSchema,
  rescheduleAppointmentSchema,
  cancelAppointmentSchema,
  updateAppointmentStatusSchema,
  searchAppointmentsSchema,
  getUpcomingAppointmentsSchema,
  updateAppointmentSchema,
} from '../schemas/appointmentSchemas';
import { Appointment } from '../../../domain/entities/Appointment';
import { UpdateAppointmentUseCase } from '../../../application/use-cases/UpdateAppointmentUseCase';

const mapToDTO = (appointment: Appointment) => ({
  id: appointment.id,
  tenantId: appointment.tenantId,
  clientId: appointment.clientId,
  clientName: appointment.clientName,
  clientEmail: appointment.clientEmail,
  assignedUserId: appointment.assignedUserId,
  staffName: appointment.staffName,
  scheduledAt: appointment.scheduledAt,
  endAt: appointment.endAt,
  status: appointment.status,
  kind: appointment.kind,
  type: appointment.type,
  dealId: appointment.dealId,
  contactPersonId: appointment.contactPersonId,
  place: appointment.place,
  notes: appointment.notes,
  history: appointment.history,
  createdAt: appointment.createdAt,
  updatedAt: appointment.updatedAt,
});

export class AppointmentController {
  constructor(
    private createAppointmentUseCase: CreateAppointmentUseCase,
    private updateAppointmentUseCase: UpdateAppointmentUseCase,
    private rescheduleAppointmentUseCase: RescheduleAppointmentUseCase,
    private cancelAppointmentUseCase: CancelAppointmentUseCase,
    private updateAppointmentStatusUseCase: UpdateAppointmentStatusUseCase,
    private searchAppointmentsUseCase: SearchAppointmentsUseCase,
    private getUpcomingAppointmentsUseCase: GetUpcomingAppointmentsUseCase,
    private getAppointmentHistoryUseCase: GetAppointmentHistoryUseCase
  ) {}

  public createAppointment = async (req: Request, res: Response) => {
    try {
      const validatedData = createAppointmentSchema.parse(req.body);
      const tenantId = requireTenantId(req);

      const appointment = await this.createAppointmentUseCase.execute({
        tenantId,        access: req.access!,
        ...validatedData,
        // From the token, never the body: the actor is who is calling, and a
        // client must not be able to attribute an appointment to someone else.
        actingUserId: req.user!.userId,
      });

      res.status(201).json(mapToDTO(appointment));
    } catch (error: any) {
      if (error instanceof PermissionDeniedError) {
        res.status(403).json({ error: error.message });
      } else if (error.message.includes('not found')) {
        res.status(404).json({ error: error.message });
      } else if (error instanceof DomainError) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(400).json({ error: error.message });
      }
    }
  };

  public updateAppointment = async (req: Request, res: Response) => {
    try {
      const validatedData = updateAppointmentSchema.parse(req.body);
      const tenantId = requireTenantId(req);
      const id = req.params.appointmentId as string;

      const appointment = await this.updateAppointmentUseCase.execute({
        id,
        tenantId,        access: req.access!,
        ...validatedData,
      });

      res.status(200).json(mapToDTO(appointment));
    } catch (error: any) {
      if (error instanceof PermissionDeniedError) {
        res.status(403).json({ error: error.message });
      } else if (error.message.includes('not found')) {
        res.status(404).json({ error: error.message });
      } else if (error instanceof DomainError) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(400).json({ error: error.message });
      }
    }
  };

  public rescheduleAppointment = async (req: Request, res: Response) => {
    try {
      const validatedData = rescheduleAppointmentSchema.parse(req.body);
      const tenantId = requireTenantId(req);
      const id = req.params.appointmentId as string;
      const changedByUserId = req.user!.userId;

      const appointment = await this.rescheduleAppointmentUseCase.execute({
        id,
        tenantId,        access: req.access!,
        newDate: validatedData.newDate,
        newEnd: validatedData.newEnd,
        reason: validatedData.reason,
        changedByUserId,
      });

      res.status(200).json(mapToDTO(appointment));
    } catch (error: any) {
      if (error instanceof PermissionDeniedError) {
        res.status(403).json({ error: error.message });
      } else if (error.message.includes('not found')) {
        res.status(404).json({ error: error.message });
      } else if (error instanceof DomainError) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(400).json({ error: error.message });
      }
    }
  };

  public cancelAppointment = async (req: Request, res: Response) => {
    try {
      const validatedData = cancelAppointmentSchema.parse(req.body);
      const tenantId = requireTenantId(req);
      const id = req.params.appointmentId as string;
      const changedByUserId = req.user!.userId;

      const appointment = await this.cancelAppointmentUseCase.execute({
        id,
        tenantId,        access: req.access!,
        reason: validatedData.reason,
        changedByUserId,
      });

      res.status(200).json(mapToDTO(appointment));
    } catch (error: any) {
      if (error instanceof PermissionDeniedError) {
        res.status(403).json({ error: error.message });
      } else if (error.message.includes('not found')) {
        res.status(404).json({ error: error.message });
      } else if (error instanceof DomainError) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(400).json({ error: error.message });
      }
    }
  };

  public updateAppointmentStatus = async (req: Request, res: Response) => {
    try {
      const validatedData = updateAppointmentStatusSchema.parse(req.body);
      const tenantId = requireTenantId(req);
      const id = req.params.appointmentId as string;

      const appointment = await this.updateAppointmentStatusUseCase.execute({
        id,
        tenantId,        access: req.access!,
        status: validatedData.status,
      });

      res.status(200).json(mapToDTO(appointment));
    } catch (error: any) {
      if (error instanceof PermissionDeniedError) {
        res.status(403).json({ error: error.message });
      } else if (error.message.includes('not found')) {
        res.status(404).json({ error: error.message });
      } else if (error instanceof DomainError) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(400).json({ error: error.message });
      }
    }
  };

  public searchAppointments = async (req: Request, res: Response) => {
    try {
      const validatedData = searchAppointmentsSchema.parse(req.query);
      const tenantId = requireTenantId(req);

      const results = await this.searchAppointmentsUseCase.execute({
        tenantId,        access: req.access!,
        startDate: validatedData.startDate,
        endDate: validatedData.endDate,
        filters: {
          clientId: validatedData.clientId,
          assignedUserId: validatedData.assignedUserId,
          status: validatedData.status,
        },
      });

      res.status(200).json(results);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  };

  public getUpcomingAppointments = async (req: Request, res: Response) => {
    try {
      const validatedData = getUpcomingAppointmentsSchema.parse(req.query);
      const tenantId = requireTenantId(req);
      const userId = req.user!.userId;

      const results = await this.getUpcomingAppointmentsUseCase.execute({
        tenantId,        access: req.access!,
        limit: validatedData.limit,
      });

      res.status(200).json(results);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  };

  public getAppointmentHistory = async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenantId(req);
      const id = req.params.appointmentId as string;

      const history = await this.getAppointmentHistoryUseCase.execute({
        id,
        tenantId,        access: req.access!,
      });

      res.status(200).json(history);
    } catch (error: any) {
      if (error instanceof PermissionDeniedError) {
        res.status(403).json({ error: error.message });
      } else if (error.message.includes('not found')) {
        res.status(404).json({ error: error.message });
      } else if (error instanceof DomainError) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(400).json({ error: error.message });
      }
    }
  };
}
