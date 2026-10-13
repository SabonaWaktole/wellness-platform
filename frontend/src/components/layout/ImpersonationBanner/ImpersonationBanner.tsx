import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { ShieldAlert, LogOut, ChevronDown, ChevronUp } from "lucide-react";
import { useAuthStore } from "../../../store/useAuthStore";
import { useWorkspaceSession } from "../../../hooks/useWorkspaceSession";
import styles from "./ImpersonationBanner.module.css";

/**
 * Shown while a platform administrator is operating inside a client's
 * workspace, having entered it from the admin console.
 *
 * Rendered by AppLayout rather than by a shell, so it appears on EVERY page of
 * the entered workspace. A banner that only covered the dashboard would vanish
 * the moment the administrator navigated to Clients — which is precisely where
 * knowing whose data is on screen matters most.
 *
 * Renders nothing for an ordinary session, so mounting it unconditionally is
 * free.
 */
export const ImpersonationBanner: React.FC = () => {
  const { t } = useTranslation("dashboard");
  const impersonating = useAuthStore((state) => state.impersonating);
  const { exitWorkspace, isSwitching } = useWorkspaceSession();

  // Collapsing only hides the strip; the arrow tab stays so the warning is one click away.
  const [collapsed, setCollapsed] = useState(false);

  if (!impersonating) return null;

  const toggleLabel = collapsed
    ? t("superAdmin.showNotice", { defaultValue: "Show workspace notice" })
    : t("superAdmin.hideNotice", { defaultValue: "Hide workspace notice" });

  return (
    <div className={styles.root}>
      <button
        type="button"
        className={styles.toggle}
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        aria-label={toggleLabel}
        title={toggleLabel}
      >
        {collapsed ? (
          <ChevronUp size={16} aria-hidden="true" />
        ) : (
          <ChevronDown size={16} aria-hidden="true" />
        )}
      </button>
      {!collapsed && (
        <div className={styles.banner} role="status">
          <span className={styles.message}>
            <ShieldAlert size={16} aria-hidden="true" />
            <span>
              {t("superAdmin.impersonationNotice")}{" "}
              <span className={styles.workspace}>
                {impersonating.tenantName ?? impersonating.tenantSlug}
              </span>
            </span>
          </span>
          <button
            type="button"
            className={styles.exitButton}
            onClick={() => exitWorkspace()}
            disabled={isSwitching}
          >
            <LogOut size={14} aria-hidden="true" />
            {t("superAdmin.exitWorkspace")}
          </button>
        </div>
      )}
    </div>
  );
};
