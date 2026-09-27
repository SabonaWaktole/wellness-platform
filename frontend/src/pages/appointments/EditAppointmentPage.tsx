import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { AppLayout } from '../../components/layout/AppLayout/AppLayout';
import { Sidebar } from '../../components/layout/Sidebar/Sidebar';
import { Button } from '../../components/ui/Button/Button';
import { TextInput } from '../../components/ui/TextInput/TextInput';
import { SelectInput } from '../../components/ui/SelectInput/SelectInput';
import { TextareaInput } from '../../components/ui/TextareaInput/TextareaInput';
import { useAuthStore } from '../../store/useAuthStore';
import { useLogout } from '../../hooks/useLogout';
import { useNavigation } from '../../hooks/useNavigation';
import { useClients } from '../../hooks/useClients';
import { useStaff } from '../../hooks/useStaff';
import { useUpdateAppointment } from '../../hooks/useAppointments';
import { appointmentService } from '../../services/appointmentService';
import styles from './CreateAppointmentPage.module.css';
import { getUserDisplayName } from '../../utils/userUtils';

const EditAppointmentContent: React.FC = () => {
  const { t } = useTranslation('appointments');
  const navigate = useNavigate();
  const { tenantSlug, appointmentId } = useParams();

  const { clients, isLoading: clientsLoading, fetchClients } = useClients();
  const { staff, isLoading: staffLoading, fetchStaff } = useStaff();
  const { updateAppointment, isLoading: submitting, error: submitError } = useUpdateAppointment();

  const [clientId, setClientId] = useState('');
  const [assignedUserId, setAssignedUserId] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [notes, setNotes] = useState('');
  const [loadingAppt, setLoadingAppt] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetchClients();
    fetchStaff();
  }, [fetchClients, fetchStaff]);

  useEffect(() => {
    const fetchAppt = async () => {
      if (!tenantSlug || !appointmentId) return;
      setFetchError(null);
      setNotFound(false);
      try {
        const results = await appointmentService.searchAppointments(tenantSlug, { startDate: '1970-01-01', endDate: '2100-01-01' });
        const appt = results.find(a => a.id === appointmentId);
        if (!appt) {
          setNotFound(true);
          return;
        }

        setClientId(appt.clientId);
        setAssignedUserId(appt.assignedUserId);

        // Format Date for datetime-local (YYYY-MM-DDThh:mm)
        const date = new Date(appt.scheduledAt);
        date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
        setScheduledAt(date.toISOString().slice(0, 16));

        setNotes(appt.notes || '');
      } catch (e) {
        console.error('Failed to fetch appointment', e);
        setFetchError('Something went wrong while loading this appointment. Please try again.');
      } finally {
        setLoadingAppt(false);
      }
    };
    fetchAppt();
  }, [tenantSlug, appointmentId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId || !assignedUserId || !scheduledAt || !appointmentId) return;

    try {
      await updateAppointment(appointmentId, {
        clientId,
        assignedUserId,
        scheduledAt: new Date(scheduledAt).toISOString(),
        notes: notes || undefined,
      });
      navigate(`/${tenantSlug}/appointments`);
    } catch {
      // Error handled by hook
    }
  };

  const isDataLoading = clientsLoading || staffLoading || loadingAppt;

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{t('form.editTitle')}</h1>
        <button
          className={styles.backButton}
          onClick={() => navigate(`/${tenantSlug}/appointments`)}
        >
          <ArrowLeft size={16} />
          {t('form.backToCalendar')}
        </button>
      </div>

      {submitError && (
        <div className={styles.errorBanner}>{submitError}</div>
      )}

      {isDataLoading ? (
        <div className={styles.loadingState}>Loading appointment details...</div>
      ) : notFound ? (
        <div className={styles.formCard} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)', alignItems: 'flex-start' }}>
          <p className={styles.errorBanner}>
            We couldn't find this appointment. It may have been deleted or the link may be incorrect.
          </p>
          <Button variant="outline" onClick={() => navigate(`/${tenantSlug}/appointments`)}>
            {t('form.backToCalendar')}
          </Button>
        </div>
      ) : fetchError ? (
        <div className={styles.formCard} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)', alignItems: 'flex-start' }}>
          <p className={styles.errorBanner}>{fetchError}</p>
          <Button variant="outline" onClick={() => navigate(`/${tenantSlug}/appointments`)}>
            {t('form.backToCalendar')}
          </Button>
        </div>
      ) : (
        <div className={styles.formCard}>
          <form onSubmit={handleSubmit}>
            <div className={styles.formGrid}>
              <SelectInput
                label="Client"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                required
              >
                <option value="">Select a client...</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </SelectInput>

              <SelectInput
                label="Assigned Staff"
                value={assignedUserId}
                onChange={(e) => setAssignedUserId(e.target.value)}
                required
              >
                <option value="">Select staff member...</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.email} ({s.role})
                  </option>
                ))}
              </SelectInput>

              <TextInput
                label="Date & Time"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                required
              />

              <TextareaInput
                label="Notes"
                placeholder="Add any notes about this appointment..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
              />
            </div>

            <div className={styles.formActions}>
              <Button
                variant="outline"
                type="button"
                onClick={() => navigate(`/${tenantSlug}/appointments`)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                type="submit"
                disabled={submitting || !clientId || !assignedUserId || !scheduledAt}
              >
                {submitting ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export const EditAppointmentPage: React.FC = () => {
  const navigate = useNavigate();
  const { tenantSlug } = useParams();
  const { user } = useAuthStore();
  const { logout } = useLogout();
  const location = useLocation();
  const navItems = useNavigation(user, location.pathname);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const userName = getUserDisplayName(user, 'Business Owner');

  return (
    <AppLayout
      userName={userName}
      onLogout={handleLogout}
      onSettingsClick={() => navigate(`/${tenantSlug}/settings/profile`)}
      sidebar={
        <Sidebar 
          navItems={navItems} 
          onLogoutClick={handleLogout}
          onNavItemClick={(id) => navigate(`/${tenantSlug || ''}/${id === 'dashboard' ? '' : id}`)}
        />
      }
    >
      <EditAppointmentContent />
    </AppLayout>
  );
};
