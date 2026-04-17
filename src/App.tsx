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
  const {
    route,
    form,
    bookingDraftUi,
    services,
    windows,
    clients,
    photos,
    requests,
    appointments,
    selectedService,
    estimatedMinutes,
    estimatedPriceFrom,
    availableBookingWindows,
    adminOverviewCounts,
    lastRequestInfo,
    lastSubmittedRequestId,
    hasClientRequest,
    isLoading,
    apiError,
    adminAccessDenied,
    isTelegramMiniApp,
    telegramInitData,
    telegramUser,
    startParam,
    locationPath,
    locationHash,
    uploading,
    uploadError,
    setForm,
    setBookingDraftStep,
    setBookingDraftFormatQuestion,
    openClientSection,
    openAdminSection,
    openBookingFlow,
    submitRequest,
    confirmClientWindow,
    refreshLastRequest,
    uploadPhoto,
    confirmRequest,
    updateStatus,
    updateWindow,
    updateService,
    createService,
    deleteService,
    addTimeWindow,
    updateWindowStatus,
    moveAppointment,
    updateAppointmentStatus,
    deleteAppointment,
    updateClientNotes,
    deleteClient,
  } = useAppController();

  return (
    <main className="app-shell" aria-busy={isLoading}>
      {apiError ? (
        <div className="panel error-panel" role="alert">
          API недоступен или вернул ошибку: {apiError}
        </div>
      ) : null}

      {isLoading ? (
        <div aria-live="polite" className="panel notice-panel loading-panel" role="status">
          Загружаю данные из PostgreSQL...
        </div>
      ) : null}

      {route.portal === "client" ? (
        <section className="client-portal">
          {route.section === "home" ? (
            <ClientHomeScreen
              hasRequest={hasClientRequest}
              lastRequestInfo={lastRequestInfo}
              lastSubmittedRequestId={lastSubmittedRequestId}
              confirmClientWindow={confirmClientWindow}
              openRequests={() => openClientSection("requests")}
              openBookingFlow={() => openBookingFlow()}
            />
          ) : null}

          {route.section === "booking" ? (
            <>
              <ClientScreenHeader
                eyebrow="запись"
                title="Новая запись"
                actionLabel={hasClientRequest ? "Мои записи" : undefined}
                onAction={hasClientRequest ? () => openClientSection("requests") : undefined}
              />
              <ClientRequestForm
                form={form}
                estimatedMinutes={estimatedMinutes}
                estimatedPriceFrom={estimatedPriceFrom}
                requiresHandPhoto={form.isNewClient || selectedService.requiresHandPhoto}
                requiresReference={selectedService.requiresReference}
                services={services}
                selectedService={selectedService}
                availableWindows={availableBookingWindows}
                currentStep={bookingDraftUi.currentStep}
                formatQuestion={bookingDraftUi.formatQuestion}
                setForm={setForm}
                setCurrentStep={setBookingDraftStep}
                setFormatQuestion={setBookingDraftFormatQuestion}
                submitRequest={submitRequest}
                uploadPhoto={uploadPhoto}
                uploading={uploading}
                uploadError={uploadError}
              />
            </>
          ) : null}

          {route.section === "requests" ? (
            <ClientRequestsScreen
              lastRequestInfo={lastRequestInfo}
              lastSubmittedRequestId={lastSubmittedRequestId}
              confirmClientWindow={confirmClientWindow}
              refreshLastRequest={refreshLastRequest}
              openBookingFlow={() => openBookingFlow()}
            />
          ) : null}

          {route.section === "profile" ? (
            <ClientProfileScreen
              form={form}
              telegramUser={telegramUser}
              openBookingFlow={() => openBookingFlow()}
              openRequests={() => openClientSection("requests")}
            />
          ) : null}

          <ClientBottomNav
            currentSection={route.section}
            hasRequest={hasClientRequest}
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
              <div className="notice-details">
                <div>Telegram WebApp: {isTelegramMiniApp ? "yes" : "no"}</div>
                <div>InitData length: {telegramInitData.length}</div>
                <div>User ID: {telegramUser?.id ?? "n/a"}</div>
                <div>Start param: {startParam || "n/a"}</div>
                <div>Path: {locationPath || "/"}</div>
                <div>Hash: {locationHash || "n/a"}</div>
              </div>
              <div className="action-row">
                <button className="secondary-button" onClick={() => navigateTo("/")} type="button">
                  Перейти к клиентской части
                </button>
              </div>
            </div>
          ) : (
            <>
              {route.section === "dashboard" ? <AdminHeader counts={adminOverviewCounts} /> : null}

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
                  confirmRequest={confirmRequest}
                  updateStatus={updateStatus}
                  updateWindow={updateWindow}
                  updateWindowStatus={updateWindowStatus}
                  moveAppointment={moveAppointment}
                  updateAppointmentStatus={updateAppointmentStatus}
                  deleteAppointment={deleteAppointment}
                  addTimeWindow={addTimeWindow}
                />
              ) : null}

              {route.section === "clients" ? (
                <ClientsWorkspace
                  appointments={appointments}
                  clients={clients}
                  photos={photos}
                  requests={requests}
                  services={services}
                  deleteClient={deleteClient}
                  deleteAppointment={deleteAppointment}
                  updateClientNotes={updateClientNotes}
                />
              ) : null}

              {route.section === "settings" ? (
                <SettingsWorkspace
                  services={services}
                  windows={windows}
                  addTimeWindow={addTimeWindow}
                  createService={createService}
                  updateService={updateService}
                  deleteService={deleteService}
                  updateWindowStatus={updateWindowStatus}
                />
              ) : null}

              <AdminBottomNav
                currentSection={route.section}
                newRequestsCount={adminOverviewCounts.newRequests}
                onNavigate={openAdminSection}
              />
            </>
          )}
        </section>
      ) : null}
    </main>
  );
}
