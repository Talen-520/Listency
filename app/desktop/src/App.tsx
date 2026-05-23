import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/app/app-shell";
import { navItems, type View } from "@/app/navigation";
import { AgentView } from "@/features/agent/agent-view";
import { BusinessView } from "@/features/business/business-view";
import { DashboardView } from "@/features/dashboard/dashboard-view";
import { LogsView } from "@/features/logs/logs-view";
import { SettingsView } from "@/features/settings/settings-view";
import { TestCallView } from "@/features/test-call/test-call-view";
import { ToolsView } from "@/features/tools/tools-view";
import { VoiceView } from "@/features/voice/voice-view";
import { useAppData } from "@/hooks/use-app-data";
import { useRealtimeTest } from "@/hooks/use-realtime-test";
import { useSessionDetail } from "@/hooks/use-session-detail";
import { api } from "@/lib/api";

export function App() {
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
      case "settings":
        return (
          <SettingsView
            config={data.config}
            phoneStatus={data.phoneStatus}
            twilioDebuggerAlerts={data.twilioDebuggerAlerts}
            twilioDebuggerError={data.twilioDebuggerError}
            twilioDebuggerLoading={data.twilioDebuggerLoading}
            openAiKey={data.openAiKey}
            geminiKey={data.geminiKey}
            providerChoice={data.providerChoice}
            openAiModel={data.openAiModel}
            geminiModel={data.geminiModel}
            openAiMock={data.openAiMock}
            openAiVoice={data.openAiVoice}
            geminiVoice={data.geminiVoice}
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
            onConnectPhone={() => data.runAction(data.connectPhone, "Phone connected")}
            onStopPhoneConnection={() => data.runAction(data.stopPhoneConnection, "Phone connection stopped")}
            onSave={() => void data.runAction(data.saveSettings, ".env saved")}
            onPruneLogs={() => void data.runAction(data.pruneOldLogs, "Old logs cleaned")}
            onClearLogs={() => void data.runAction(data.clearLogs, "Logs cleared")}
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
            onAddAgent={() => void data.runAction(data.createAgent, "Agent added")}
            onSelectAgent={(agentId) => void data.runAction(() => data.selectAgent(agentId), "Agent selected")}
            onDeleteAgent={(agentId) => void data.runAction(() => data.deleteAgent(agentId), "Agent deleted")}
            onSave={() => void data.runAction(data.saveAgent, "Agent saved")}
          />
        );
      case "voice":
        return <VoiceView providers={data.providers} />;
      case "business":
        return (
          <BusinessView
            business={data.business}
            onBusinessChange={data.setBusiness}
            onSave={() =>
              void data.runAction(
                () => api.saveBusinessProfile({ name: data.business.name, content: data.business.content }),
                "Business profile saved",
              )
            }
          />
        );
      case "tools":
        return (
          <ToolsView
            tools={data.tools}
            onToolEnabledChange={(toolName, enabled) =>
              void data.runAction(() => api.setToolEnabled(toolName, enabled), "Tool updated")
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
            onStartTest={() => void data.runAction(realtime.startLiveTest, "Session started")}
            onStopSession={() => {
              if (data.activeSession) {
                void data.runAction(realtime.stopLiveTest, "Session stopped");
              }
            }}
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
            onDownloadLogs={() => void data.runAction(data.downloadLogs, "Logs downloaded")}
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
      onStartRuntime={() => void data.runAction(api.startRuntime, "Runtime started")}
      onStopRuntime={() => void data.runAction(api.stopRuntime, "Runtime stopped")}
    >
      {renderView()}
    </AppShell>
  );
}
