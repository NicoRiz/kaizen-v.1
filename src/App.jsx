import { useEffect, useMemo, useState } from "react";
import AuthScreen from "./components/AuthScreen.jsx";
import JournalPage from "./components/JournalPage.jsx";
import SyncStatus from "./components/SyncStatus.jsx";
import SystemPage from "./components/SystemPage.jsx";
import TodayPage from "./components/TodayPage.jsx";
import { useKaizenLoopMutations } from "./hooks/useKaizenLoopMutations.js";
import { useKaizenSync } from "./hooks/useKaizenSync.js";
import { COLLECTIONS, STORAGE_KEYS } from "./lib/kaizenData.js";
import { migrateKaizenLoopData } from "./lib/kaizenLoop.js";
import { createCachedKaizenData, createId, nowIso } from "./lib/syncCore.js";
import { dateKey } from "./utils/date.js";
import { readStorage, writeStorage } from "./utils/storage.js";

function initialData() { return createCachedKaizenData(); }

export default function App() {
  const [data, setData] = useState(initialData);
  const [activeSection, setActiveSection] = useState("today");
  const [subsections, setSubsections] = useState({ system: "inbox", journal: "today" });
  const [migration, setMigration] = useState(() => readStorage(STORAGE_KEYS.migration, {}));
  const sync = useKaizenSync({ data, onReplaceData: setData });
  const actions = useKaizenLoopMutations(setData);
  const today = useMemo(() => dateKey(), []);

  useEffect(() => {
    for (const collection of COLLECTIONS) sync.trackCollectionChange(collection.name, data[collection.name]);
  }, [data, sync.trackCollectionChange]);

  useEffect(() => { writeStorage(STORAGE_KEYS.migration, migration); }, [migration]);

  useEffect(() => {
    const result = migrateKaizenLoopData(data);
    if (!result.changed) return;
    setData(result.data);
    setMigration((current) => ({
      ...current,
      kaizenLoopV2: nowIso(),
      kaizenLoopCounts: result.counts,
      legacyPreserved: result.legacyPreserved,
    }));
  }, [data]);

  function navigate(section, subsection) {
    setActiveSection(section);
    if (subsection && (section === "system" || section === "journal")) {
      setSubsections((current) => ({ ...current, [section]: subsection }));
    }
  }

  async function clarifyInboxItem(itemId, result) {
    if (!result.actionable && result.nonActionableDestination === "archive" && result.attachments?.length) {
      const archiveItemId = createId();
      const uploadedAttachments = await sync.uploadArchiveAttachments(archiveItemId, result.attachments);
      actions.clarifyInboxItem(itemId, { ...result, archiveItemId, uploadedAttachments });
      return;
    }
    actions.clarifyInboxItem(itemId, result);
  }

  async function deleteArchiveItem(itemId) {
    const item = data.archiveItems.find((archiveItem) => archiveItem.id === itemId);
    await sync.deleteArchiveAttachments(item?.attachments);
    actions.deleteArchiveItem(itemId);
  }

  if (!sync.authReady) {
    return <div className="auth-shell"><main className="auth-panel"><p className="eyebrow">Kaizen Loop</p><h1>KAIZEN</h1><p className="empty-state">Recupero sessione…</p></main></div>;
  }

  if (!sync.isAuthenticated && sync.config.isConfigured) {
    return <AuthScreen error={sync.authError} isConfigured={sync.config.isConfigured} onSubmit={sync.signIn} />;
  }

  let page;
  if (activeSection === "system") {
    page = <SystemPage activeSection={activeSection} activeSubsection={subsections.system} data={data} date={today} onActionDelete={actions.deleteAction} onActionOrder={actions.moveActionOrder} onActionSave={actions.saveAction} onAddInboxItem={actions.addInboxItem} onClarifyInboxItem={clarifyInboxItem} onDeleteArchiveItem={deleteArchiveItem} onDeleteCalendarItem={actions.deleteCalendarItem} onDeleteProject={actions.deleteProject} onDeleteSomedayMaybe={actions.deleteSomedayMaybe} onDeleteWaitingFor={actions.deleteWaitingFor} onDownloadArchiveAttachment={sync.downloadArchiveAttachment} onNavigate={navigate} onSaveAgentInsight={actions.saveAgentInsight} onSaveArchiveItem={actions.saveArchiveItem} onSaveCalendarItem={actions.saveCalendarItem} onSaveProject={actions.saveProject} onSaveSomedayMaybe={actions.saveSomedayMaybe} onSaveWaitingFor={actions.saveWaitingFor} onSaveWeeklyReview={actions.saveWeeklyReview} onToggleAction={actions.toggleAction} />;
  } else if (activeSection === "journal") {
    page = <JournalPage activeSection={activeSection} activeSubsection={subsections.journal} data={data} date={today} onAcceptSuggestion={actions.acceptSuggestion} onDeleteExperiment={actions.deleteExperiment} onDeleteJournalEntry={actions.deleteJournalEntry} onNavigate={navigate} onSaveAgentInsight={actions.saveAgentInsight} onSaveDailyPlan={actions.saveDailyPlan} onSaveExperiment={actions.saveExperiment} onSaveJournalEntry={actions.saveJournalEntry} onSetPatternStatus={actions.setPatternStatus} onUpdateAgentFeedback={actions.updateAgentFeedback} />;
  } else {
    page = <TodayPage activeSection="today" data={data} date={today} onActionDelete={actions.deleteAction} onActionOrder={actions.moveActionOrder} onActionSave={actions.saveAction} onAddInboxItem={actions.addInboxItem} onClarifyInboxItem={clarifyInboxItem} onDeleteCalendarItem={actions.deleteCalendarItem} onNavigate={navigate} onSaveAgentInsight={actions.saveAgentInsight} onSaveCalendarItem={actions.saveCalendarItem} onSaveDailyPlan={actions.saveDailyPlan} onToggleAction={actions.toggleAction} />;
  }

  return <><SyncStatus sync={sync} />{page}</>;
}
