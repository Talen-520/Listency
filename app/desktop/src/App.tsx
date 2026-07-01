import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/app/app-shell";
import { navItems, type View } from "@/app/navigation";
import { AgentView } from "@/features/agent/agent-view";
import { BusinessView } from "@/features/business/business-view";
import { DashboardView } from "@/features/dashboard/dashboard-view";
import { EvaluationsView } from "@/features/evaluations/evaluations-view";
import { InboxView } from "@/features/inbox/inbox-view";
import { LogsView } from "@/features/logs/logs-view";
import { SettingsView } from "@/features/settings/settings-view";
import { TestCallView } from "@/features/test-call/test-call-view";
import { ToolsView } from "@/features/tools/tools-view";
import { VoiceView } from "@/features/voice/voice-view";
import { useAppData } from "@/hooks/use-app-data";
import { useRealtimeTest } from "@/hooks/use-realtime-test";
import { useSessionDetail } from "@/hooks/use-session-detail";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

export function App() {
  const { t } = useI18n();
  const [view, setView] = useState<View>("dashboard");
  const data = useAppData();
  const realtime = useRealtimeTest({
    activeSession: data.activeSession,
    providerChoice: data.providerChoice,
    loadAll: data.loadAll,
    setTranscripts: data.setTranscripts,
    setToolCalls: data.setToolCalls,
    setAppLogs: data.setAppLogs,
  });
  const sessionDetail = useSessionDetail(data.selectedSessionDetailId);

  const currentNav = useMemo(() => navItems.find((item) => item.id === view) ?? navItems[0], [view]);

  useEffect(() => {
    if (!data.activeSession) {
      realtime.cleanupLocalStream();
    }
  }, [data.activeSession, realtime.cleanupLocalStream]);

  function renderView() {
    switch (view) {
      case "dashboard":
        return (
          <DashboardView
            status={data.status}
            backendHealth={data.backendHealth}
            activeSession={data.activeSession}
            providers={data.providers}
            sessions={data.sessions}
            readinessChecks={data.readinessChecks}
          />
        );
      case "inbox":
        return (
          <InboxView
            phoneCalls={data.phoneCalls}
            sessions={data.sessions}
            tasks={data.followUpTasks}
            toolCalls={data.toolCalls}
            transcripts={data.transcripts}
            onComplete={(taskId) => void data.runAction(() => data.updateFollowUpTaskStatus(taskId, "done"), t("inbox.taskCompleted", "Task completed"))}
            onDelete={(taskId) => void data.runAction(() => data.deleteFollowUpTask(taskId), t("inbox.taskDeleted", "Task deleted"))}
            onDismiss={(taskId) => void data.runAction(() => data.updateFollowUpTaskStatus(taskId, "dismissed"), t("inbox.taskDismissed", "Task dismissed"))}
            onInProgress={(taskId) => void data.runAction(() => data.updateFollowUpTaskStatus(taskId, "in_progress"), t("inbox.taskUpdated", "Task updated"))}
            onOpenSession={(sessionId) => {
              data.setSelectedSessionId(sessionId);
              setView("logs");
            }}
          />
        );
      case "settings":
        return (
          <SettingsView
            config={data.config}
            phoneStatus={data.phoneStatus}
            twilioDebuggerAlerts={data.twilioDebuggerAlerts}
            twilioDebuggerError={data.twilioDebuggerError}
            twilioDebuggerLoading={data.twilioDebuggerLoading}
            desktopNotificationsEnabled={data.desktopNotificationsEnabled}
            desktopNotificationPermission={data.desktopNotificationPermission}
            openAiKey={data.openAiKey}
            geminiKey={data.geminiKey}
            providerChoice={data.providerChoice}
            openAiModel={data.openAiModel}
            geminiModel={data.geminiModel}
            openAiMock={data.openAiMock}
            openAiVoice={data.openAiVoice}
            geminiVoice={data.geminiVoice}
            calendarAvailability={data.calendarAvailability}
            phoneProvider={data.phoneProvider}
            phoneConnectionMode={data.phoneConnectionMode}
            phonePublicBaseUrl={data.phonePublicBaseUrl}
            phoneRealtimeProvider={data.phoneRealtimeProvider}
            phoneTransferTarget={data.phoneTransferTarget}
            cloudflaredBin={data.cloudflaredBin}
            twilioAccountSid={data.twilioAccountSid}
            twilioAuthToken={data.twilioAuthToken}
            twilioPhoneNumber={data.twilioPhoneNumber}
            twilioPhoneNumberSid={data.twilioPhoneNumberSid}
            telnyxApiKey={data.telnyxApiKey}
            telnyxCallControlAppId={data.telnyxCallControlAppId}
            telnyxApplicationName={data.telnyxApplicationName}
            telnyxPhoneNumber={data.telnyxPhoneNumber}
            voicePreviewCache={data.voicePreviewCache}
            onOpenAiKeyChange={data.setOpenAiKey}
            onGeminiKeyChange={data.setGeminiKey}
            onProviderChoiceChange={data.setProviderChoice}
            onOpenAiModelChange={data.setOpenAiModel}
            onGeminiModelChange={data.setGeminiModel}
            onOpenAiMockChange={data.setOpenAiMock}
            onOpenAiVoiceChange={data.setOpenAiVoice}
            onGeminiVoiceChange={data.setGeminiVoice}
            onCalendarAvailabilityChange={data.setCalendarAvailability}
            onPhoneProviderChange={data.setPhoneProvider}
            onPhoneConnectionModeChange={data.setPhoneConnectionMode}
            onPhonePublicBaseUrlChange={data.setPhonePublicBaseUrl}
            onPhoneRealtimeProviderChange={data.setPhoneRealtimeProvider}
            onPhoneTransferTargetChange={data.setPhoneTransferTarget}
            onCloudflaredBinChange={data.setCloudflaredBin}
            onTwilioAccountSidChange={data.setTwilioAccountSid}
            onTwilioAuthTokenChange={data.setTwilioAuthToken}
            onTwilioPhoneNumberChange={data.setTwilioPhoneNumber}
            onTwilioPhoneNumberSidChange={data.setTwilioPhoneNumberSid}
            onTelnyxApiKeyChange={data.setTelnyxApiKey}
            onTelnyxCallControlAppIdChange={data.setTelnyxCallControlAppId}
            onTelnyxApplicationNameChange={data.setTelnyxApplicationName}
            onTelnyxPhoneNumberChange={data.setTelnyxPhoneNumber}
            onPreviewVoice={data.previewVoice}
            onRefreshTwilioDebugger={data.refreshTwilioDebugger}
            onDesktopNotificationsEnabledChange={data.setDesktopNotificationsEnabled}
            onConnectPhone={() => data.runAction(data.connectPhone, t("toast.phoneConnected"))}
            onStopPhoneConnection={() => data.runAction(data.stopPhoneConnection, t("toast.phoneConnectionStopped"))}
            onSaveCalendarAvailability={() => void data.runAction(data.saveCalendarAvailability, t("calendar.saved"))}
            onSave={() => void data.runAction(data.saveSettings, t("toast.envSaved"))}
            onPruneLogs={() => void data.runAction(data.pruneOldLogs, t("toast.oldLogsCleaned"))}
            onClearLogs={() => void data.runAction(data.clearLogs, t("toast.logsCleared"))}
            onDownloadDiagnostics={() => void data.runAction(data.downloadDiagnostics, t("toast.diagnosticsDownloaded", "Diagnostics downloaded"))}
            hasActiveSession={Boolean(data.activeSession)}
          />
        );
      case "agent":
        return (
          <AgentView
            agents={data.agents}
            activeAgentId={data.activeAgentId}
            agent={data.agent}
            onAgentChange={data.setAgent}
            onAddAgent={() => void data.runAction(data.createAgent, t("toast.agentAdded"))}
            onSelectAgent={(agentId) => void data.runAction(() => data.selectAgent(agentId), t("toast.agentSelected"))}
            onDeleteAgent={(agentId) => void data.runAction(() => data.deleteAgent(agentId), t("toast.agentDeleted"))}
            onSave={() => void data.runAction(data.saveAgent, t("toast.agentSaved"))}
          />
        );
      case "voice":
        return <VoiceView providers={data.providers} />;
      case "business":
        return (
          <BusinessView
            business={data.business}
            businessHours={data.businessHours}
            businessHoursStatus={data.businessHoursStatus}
            businessInfoSections={data.businessInfoSections}
            onBusinessChange={data.setBusiness}
            onBusinessHoursChange={data.setBusinessHours}
            onBusinessInfoSectionsChange={data.setBusinessInfoSections}
            onSave={() => void data.runAction(data.saveBusinessInfo, t("toast.businessProfileSaved"))}
            onSaveBusinessHours={() => void data.runAction(data.saveBusinessHours, t("businessHours.saved", "Business hours saved"))}
          />
        );
      case "tools":
        return (
          <ToolsView
            tools={data.tools}
            onToolEnabledChange={(toolName, enabled) =>
              void data.runAction(() => api.setToolEnabled(toolName, enabled), t("toast.toolUpdated"))
            }
          />
        );
      case "test":
        return (
          <TestCallView
            micReady={realtime.micReady}
            providerChoice={data.providerChoice}
            streamStatus={realtime.streamStatus}
            remainingSeconds={data.remainingSeconds}
            activeSession={data.activeSession}
            selectedProviderReady={data.selectedProviderReady}
            liveEvents={realtime.liveEvents}
            transcripts={data.transcripts}
            onRequestMic={() => void realtime.requestMic()}
            onStartTest={() => void data.runAction(realtime.startLiveTest, t("toast.sessionStarted"))}
            onStopSession={() => {
              if (data.activeSession) {
                void data.runAction(realtime.stopLiveTest, t("toast.sessionStopped"));
              }
            }}
          />
        );
      case "evaluations":
        return (
          <EvaluationsView
            evaluationRunning={data.evaluationRunning}
            latestRun={data.evaluationRuns[0]}
            runs={data.evaluationRuns}
            scenarios={data.evaluationScenarios}
            selectedRun={data.selectedEvaluationRun}
            onInspectRun={(runId) => void data.runAction(() => data.loadEvaluationRun(runId), t("evaluations.runLoaded"))}
            onRunEvaluations={() => void data.runAction(data.runEvaluations, t("evaluations.runComplete"))}
          />
        );
      case "logs":
        return (
          <LogsView
            sessions={data.sessions}
            selectedSessionId={data.selectedSessionDetailId}
            onSelectSession={data.setSelectedSessionId}
            logWindow={data.logWindow}
            onLogWindowChange={data.setLogWindow}
            sessionTranscripts={sessionDetail.transcripts}
            sessionToolCalls={sessionDetail.toolCalls}
            sessionAppLogs={sessionDetail.appLogs}
            sessionPhoneCalls={sessionDetail.phoneCalls}
            sessionDetailLoading={sessionDetail.loading}
            transcripts={data.transcripts}
            toolCalls={data.toolCalls}
            appLogs={data.appLogs}
            phoneCalls={data.phoneCalls}
            onDownloadLogs={() => void data.runAction(data.downloadLogs, t("toast.logsDownloaded"))}
          />
        );
      default:
        return null;
    }
  }

  return (
    <AppShell
      view={view}
      navItems={navItems}
      currentNav={currentNav}
      status={data.status}
      backendHealth={data.backendHealth}
      activeSession={data.activeSession}
      remainingSeconds={data.remainingSeconds}
      onViewChange={setView}
      onStartRuntime={() => void data.runAction(api.startRuntime, t("toast.runtimeStarted"))}
      onStopRuntime={() => void data.runAction(api.stopRuntime, t("toast.runtimeStopped"))}
    >
      {renderView()}
    </AppShell>
  );
}
