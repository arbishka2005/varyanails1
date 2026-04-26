import { navigateTo } from "./app/navigation";
import { useAppController } from "./app/useAppController";
import { ClientRequestForm } from "./features/booking/ClientRequestForm";
import {
  ClientBottomNav,
  ClientHomeScreen,
  ClientProfileScreen,
  ClientRequestsScreen,
  ClientScreenHeader,
} from "./features/client/ClientScreens";
import { AdminBottomNav, AdminHeader } from "./features/admin/AdminNavigation";
import { ClientsWorkspace } from "./features/admin/ClientsWorkspace";
import { MasterWorkspace } from "./features/admin/MasterWorkspace";
import { SettingsWorkspace } from "./features/admin/SettingsWorkspace";
import { SurveyPage } from "./features/survey/SurveyPage";

export function App() {
  const { shell, status, data, client, admin } = useAppController();
  const { route, telegram, openClientSection, openAdminSection } = shell;
  const { isLoading, apiError, adminAccessDenied } = status;
  const { services, windows, clients, photos, requests, appointments } = data;
  const adminActions = admin.actions;

  return (
    <main className="app-shell" aria-busy={isLoading}>
      {apiError ? (
        <div className="panel error-panel" role="alert">
          API недоступен или вернул ошибку: {apiError}
        </div>
      ) : null}

      {isLoading ? (
        <div aria-live="polite" className="panel notice-panel loading-panel" role="status">
          Загружаю данные...
        </div>
      ) : null}

      {route.portal === "client" ? (
        <section className="client-portal">
          {route.section === "home" ? (
            <ClientHomeScreen
              hasRequest={client.hasClientRequest}
              lastRequestInfo={client.lastRequestInfo}
              lastSubmittedRequestId={client.lastSubmittedRequestId}
              lastRequestLookupStatus={client.lastRequestLookupStatus}
              confirmClientWindow={client.confirmClientWindow}
              openRequests={() => openClientSection("requests")}
              openBookingFlow={() => client.openBookingFlow()}
            />
          ) : null}

          {route.section === "booking" ? (
            <>
              <ClientScreenHeader
                eyebrow="запись"
                title="Новая запись"
                actionLabel={client.hasClientRequest ? "Мои записи" : undefined}
                onAction={client.hasClientRequest ? () => openClientSection("requests") : undefined}
              />
              <ClientRequestForm
                form={client.form}
                estimatedMinutes={client.estimatedMinutes}
                estimatedPriceFrom={client.estimatedPriceFrom}
                requiresHandPhoto={client.form.isNewClient || client.selectedService.requiresHandPhoto}
                requiresReference={client.selectedService.requiresReference}
                services={services}
                selectedService={client.selectedService}
                availableWindows={client.availableBookingWindows}
                currentStep={client.bookingDraftUi.currentStep}
                formatQuestion={client.bookingDraftUi.formatQuestion}
                setForm={client.setForm}
                setCurrentStep={client.setBookingDraftStep}
                setFormatQuestion={client.setBookingDraftFormatQuestion}
                submitRequest={client.submitRequest}
                uploadPhoto={client.uploadPhoto}
                removePhoto={client.removePhoto}
                uploading={client.uploading}
                uploadError={client.uploadError}
                isSubmitting={client.isSubmittingRequest}
              />
            </>
          ) : null}

          {route.section === "requests" ? (
            <ClientRequestsScreen
              lastRequestInfo={client.lastRequestInfo}
              lastSubmittedRequestId={client.lastSubmittedRequestId}
              lastRequestLookupStatus={client.lastRequestLookupStatus}
              confirmClientWindow={client.confirmClientWindow}
              openBookingFlow={() => client.openBookingFlow()}
              refreshLastRequest={client.refreshLastRequest}
            />
          ) : null}

          {route.section === "profile" ? (
            <ClientProfileScreen
              form={client.form}
              telegramUser={telegram.telegramUser}
              openBookingFlow={() => client.openBookingFlow()}
              openRequests={() => openClientSection("requests")}
            />
          ) : null}

          <ClientBottomNav
            currentSection={route.section}
            hasRequest={client.hasClientRequest}
            onNavigate={openClientSection}
          />
        </section>
      ) : null}

      {route.portal === "survey" ? <SurveyPage appointmentToken={route.appointmentToken} /> : null}

      {route.portal === "admin" ? (
        <section className="admin-portal">
          {adminAccessDenied ? (
            <div className="panel notice-panel">
              Админ-панель доступна только в Telegram Mini App для аккаунта мастера. Откройте приложение через кнопку в боте или проверьте, что ваш Telegram ID добавлен в список мастеров.
              <details className="notice-details">
                <summary>Детали для настройки доступа</summary>
                <div>Telegram WebApp: {telegram.isTelegramMiniApp ? "yes" : "no"}</div>
                <div>InitData length: {telegram.telegramInitData.length}</div>
                <div>User ID: {telegram.telegramUser?.id ?? "n/a"}</div>
                <div>Start param: {telegram.startParam || "n/a"}</div>
                <div>Path: {telegram.locationPath || "/"}</div>
                <div>Hash: {telegram.locationHash || "n/a"}</div>
              </details>
              <div className="action-row">
                <button className="secondary-button" onClick={() => navigateTo("/")} type="button">
                  Перейти к клиентской части
                </button>
              </div>
            </div>
          ) : (
            <>
              {route.section === "dashboard" ? <AdminHeader counts={admin.overviewCounts} /> : null}

              {route.section === "dashboard" || route.section === "requests" || route.section === "schedule" ? (
                <MasterWorkspace
                  view={route.section}
                  onNavigate={openAdminSection}
                  appointments={appointments}
                  clients={clients}
                  photos={photos}
                  requests={requests}
                  services={services}
                  windows={windows}
                  confirmRequest={adminActions.confirmRequest}
                  updateStatus={adminActions.updateStatus}
                  updateWindow={adminActions.updateWindow}
                  updateWindowStatus={adminActions.updateWindowStatus}
                  deleteTimeWindow={adminActions.deleteTimeWindow}
                  moveAppointment={adminActions.moveAppointment}
                  updateAppointmentStatus={adminActions.updateAppointmentStatus}
                  addTimeWindow={adminActions.addTimeWindow}
                />
              ) : null}

              {route.section === "clients" ? (
                <ClientsWorkspace
                  appointments={appointments}
                  clients={clients}
                  photos={photos}
                  requests={requests}
                  services={services}
                  deleteClient={adminActions.deleteClient}
                  updateClientNotes={adminActions.updateClientNotes}
                />
              ) : null}

              {route.section === "settings" ? (
                <SettingsWorkspace
                  appointments={appointments}
                  requests={requests}
                  services={services}
                  createService={adminActions.createService}
                  updateService={adminActions.updateService}
                  deleteService={adminActions.deleteService}
                />
              ) : null}

              <AdminBottomNav
                currentSection={route.section}
                newRequestsCount={admin.overviewCounts.newRequests}
                onNavigate={openAdminSection}
              />
            </>
          )}
        </section>
      ) : null}
    </main>
  );
}
