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
import { useCreateAppointment } from '../../hooks/useAppointments';
import styles from './CreateAppointmentPage.module.css';
import { getUserDisplayName } from '../../utils/userUtils';

const CreateAppointmentContent: React.FC = () => {
  const { t } = useTranslation('appointments');
  const navigate = useNavigate();
  const { tenantSlug } = useParams();
  const { user } = useAuthStore();

  // Data fetching
  const { clients, isLoading: clientsLoading, fetchClients } = useClients();
  const { staff, isLoading: staffLoading, fetchStaff } = useStaff();
  const { createAppointment, isLoading: submitting, error: submitError } = useCreateAppointment();

  // Form state
  const [clientId, setClientId] = useState('');
  const [assignedUserId, setAssignedUserId] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    fetchClients();
    fetchStaff();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Default assignedUserId to current user once staff loads
  useEffect(() => {
    if (staff.length > 0 && !assignedUserId && user?.userId) {
      const currentStaff = staff.find(s => s.id === user.userId);
      if (currentStaff) {
        setAssignedUserId(currentStaff.id);
      }
    }
  }, [staff, assignedUserId, user?.userId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId || !assignedUserId || !scheduledAt) return;

    try {
      await createAppointment({
        clientId,
        assignedUserId,
        scheduledAt: new Date(scheduledAt).toISOString(),
        notes: notes || undefined,
      });
      navigate(`/${tenantSlug}/appointments`);
    } catch {
      // Error is handled by the hook
    }
  };

  const isDataLoading = clientsLoading || staffLoading;

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{t('form.createTitle')}</h1>
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
        <div className={styles.loadingState}>Loading form data...</div>
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
                {submitting ? 'Creating...' : 'Create Appointment'}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export const CreateAppointmentPage: React.FC = () => {
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
      <CreateAppointmentContent />
    </AppLayout>
  );
};
