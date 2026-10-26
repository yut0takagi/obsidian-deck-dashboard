import { moment } from "obsidian";

/** Why a Claude Code command was refused (see core/claudeCommand.ts). */
export type CommandRejectReason = "empty" | "control-chars" | "not-allowed" | "not-executable";

// UI strings added in 0.1.0 and later. English is the default; Japanese is
// picked when Obsidian runs in a ja locale. Older UI text that is still
// hard-coded in Japanese is migrated here gradually.
export interface Strings {
  doneLabel: string;
  nothingToSync: string;
  neverSynced: string;
  noneLabel: string;
  openSettings: string;
  folderNotSet: (label: string) => string;
  fileNotSet: (label: string) => string;
  setFirstNotice: (label: string) => string;
  inheritFolderHint: string;
  notSetPlaceholder: string;

  settingsHomeHeading: string;
  settingsHomeFileName: string;
  settingsHomeFileDesc: string;
  settingsOpenOnStartupName: string;
  settingsOpenOnStartupDesc: string;
  settingsDashboardFolderName: string;
  settingsDashboardFolderDesc: string;
  settingsFoldersHeading: string;
  settingsFoldersIntro: string;
  taskFolderName: string;
  taskFolderDesc: string;
  dailyFolderName: string;
  dailyFolderDesc: string;
  meetingFolderName: string;
  meetingFolderDesc: string;
  markwhenFileName: string;
  markwhenFileDesc: string;
  aiLogFolderName: string;
  aiLogFolderDesc: string;
  syncLogFolderName: string;
  syncLogFolderDesc: string;
  aiNotesFolderName: string;
  aiNotesFolderDesc: string;
  excludeFoldersName: string;
  excludeFoldersDesc: string;
  settingsAiHeading: string;
  claudeCommandName: string;
  claudeCommandDesc: string;
  claudeCommandRejected: (reason: CommandRejectReason) => string;
  dashboardCommandIgnored: (value: string) => string;
  settingsCalendarsHeading: string;
  settingsCalendarsDesc: string;
  calendarNameLabel: string;
  calendarUrlLabel: string;
  calendarAdd: string;
  calendarRemove: string;
  calendarNeedsNameAndUrl: string;
  calendarAllowPrivateName: string;
  calendarAllowPrivateDesc: string;
  calendarRefused: (reason: "invalid" | "scheme" | "private") => string;
  calendarUnknownName: (name: string) => string;
  calendarWidgetSourceName: string;
  calendarWidgetSourceDesc: string;
  calendarWidgetUrlDesc: string;

  basesLabel: string;
  basesDescription: string;
  basesFileName: string;
  basesFileDesc: string;
  basesViewName: string;
  basesViewDesc: string;
  basesUnavailable: string;
  basesFileMissing: (path: string) => string;

  homeTitle: string;
  tplToday: string;
  tplGreeting: string;
  tplOverdue: string;
  tplOverdueLabel: string;
  tplDueToday: string;
  tplDueTodayLabel: string;
  tplDueWeek: string;
  tplDueWeekLabel: string;
  tplMeetingsWeek: string;
  tplMeetingsWeekLabel: string;
  tplUnitTasks: string;
  tplUnitNotes: string;
  tplAiSearch: string;
  tplKanban: string;
  tplCalendar: string;
  tplTasksToday: string;
  tplTasksWeek: string;
  tplTasksByProject: string;
  tplRecentMeetings: string;
  tplRecentNotes: string;
  tplColumnDue: string;
  tplColumnPriority: string;
  tplColumnStatus: string;
  tplColumnCount: string;
  tplColumnUpdated: string;
  tplGuideTitle: string;
  tplGuideBody: string;

  // Text moved out of the code (was hard-coded Japanese).
  weekdaysShort: string[];
  addWidgetAdd: string;
  addWidgetAddWidget: string;
  addWidgetChangesSaveAutomaticallyAsYou: string;
  addWidgetClose: string;
  addWidgetDelete: string;
  addWidgetEdit: (type: unknown) => string;
  addWidgetTitle: string;
  addWidgetUnknownWidgetType: (type: unknown) => string;
  aiDelegationAccepteditsEditsAreApprovedAutomatically: string;
  aiDelegationAccepteditsRecommended: string;
  aiDelegationAiDelegation: (basename: unknown) => string;
  aiDelegationAiDelegationCompletedS: (taskBasename: unknown, value: unknown, tail: unknown) => string;
  aiDelegationAiDelegationContinuesLog: (path: unknown) => string;
  aiDelegationAiDelegationFailedCodeSee: (code: unknown) => string;
  aiDelegationAiDelegationStopped: (taskBasename: unknown) => string;
  aiDelegationAiSessionStopped: string;
  aiDelegationAlreadyRunning: string;
  aiDelegationAndTheLogIsWritten: (value: unknown) => string;
  aiDelegationBypasspermissionsFullyAutomatic: string;
  aiDelegationCannotRunAgain: string;
  aiDelegationClose: string;
  aiDelegationClosingThisWindowKeepsThe: string;
  aiDelegationComplete: string;
  aiDelegationCompletedS: (sec: unknown) => string;
  aiDelegationDelegateToAi: string;
  aiDelegationDoEveryPartOfThe: string;
  aiDelegationErrorCode: (value: unknown) => string;
  aiDelegationFailedToStart: (msg: unknown) => string;
  aiDelegationInstructionsAreEmpty: string;
  aiDelegationInstructionsForAi: string;
  aiDelegationLogFileNotFound: (path: unknown) => string;
  aiDelegationOpenLog: string;
  aiDelegationReopenItFromAiAt: string;
  aiDelegationRetry: string;
  aiDelegationRunAgain: string;
  aiDelegationRunning: string;
  aiDelegationRunningContinuesWhenClosed: string;
  aiDelegationStarting: string;
  aiDelegationStartingClaude: string;
  aiDelegationStatusUpdateFailed: (message: unknown) => string;
  aiDelegationStopped: string;
  aiDelegationStopped2: string;
  aiDelegationText: (value: unknown) => string;
  aiDelegationThisLetsTheAiEdit: string;
  aiDelegationWaiting: string;
  aiLogWriterAiDelegationLog: string;
  aiLogWriterError: (value: unknown) => string;
  aiLogWriterExecutionTrace: string;
  aiLogWriterFailed: string;
  aiLogWriterInstructions: string;
  aiLogWriterMode: (permissionMode: unknown) => string;
  aiLogWriterResult: (value: unknown) => string;
  aiLogWriterResultDurationSToolCalls: (tag: unknown, sec: unknown, toolCount: unknown, value: unknown) => string;
  aiLogWriterStopped: string;
  aiLogWriterSucceeded: string;
  aiLogWriterTask: (taskPath: unknown) => string;
  aiSearchAdd12SentencesOn: string;
  aiSearchAiSearchNaturalLanguage: string;
  aiSearchAnthropicApiKeyIsNot: string;
  aiSearchApiKeySaved: string;
  aiSearchAreAlwaysExcluded: (value: unknown) => string;
  aiSearchAskAQuestionEG: string;
  aiSearchAvoidGuessingSayClearlyWhen: string;
  aiSearchBackend: string;
  aiSearchCancel: string;
  aiSearchCandidateCountTopK: string;
  aiSearchCandidatesApiInputTokensOutput: (count: unknown, model: unknown, inputTokens: unknown, outputTokens: unknown) => string;
  aiSearchCandidatesClaudePMs: (count: unknown, cmd: unknown, ms: unknown) => string;
  aiSearchCandidatesQueryingClaude: (count: unknown) => string;
  aiSearchClaudeCodeThroughClaudeP: string;
  aiSearchClaudeHaiku4520251001: string;
  aiSearchDoNotInventNotesOutside: string;
  aiSearchEmptyTheWholeVaultMinus: string;
  aiSearchEndWithASourcesSection: string;
  aiSearchExcerptLength: string;
  aiSearchExcludedFoldersCommaSeparated: string;
  aiSearchExcludedFromSearchInAddition: string;
  aiSearchFailedToSave: (message: unknown) => string;
  aiSearchFindCandidateNotesByKeyword: string;
  aiSearchFindingCandidateNotes: string;
  aiSearchIfNothingMatchesSayNo: string;
  aiSearchKeepEachPointToA: string;
  aiSearchLinkEachNoteAsFile: string;
  aiSearchModelApiBackendOnly: string;
  aiSearchNoMatchesSearchTheWeb: string;
  aiSearchNumberOfCandidateNotesSent: string;
  aiSearchNumberOfCharactersSentFrom: string;
  aiSearchOrSwitchTheBackendTo: string;
  aiSearchPick35ReliableSources: string;
  aiSearchQuestion: (query: unknown) => string;
  aiSearchQuestionCandidateVaultNotes: (q: unknown, ctxBlock: unknown) => string;
  aiSearchSaveAsNote: (aiNotesFolder: unknown) => string;
  aiSearchSaveAsNote2: string;
  aiSearchSaved: (value: unknown) => string;
  aiSearchSearch: string;
  aiSearchSearchFoldersCommaSeparated: string;
  aiSearchSearchingTheWeb: string;
  aiSearchSearchTheWeb: string;
  aiSearchSetApiKey: string;
  aiSearchSkAnt: string;
  aiSearchUseTheWebsearchToolTo: string;
  aiSearchWebSearchCompleteClaudeP: (ms: unknown) => string;
  aiSearchWebSearchResults: string;
  aiSearchYouAreASearchAssistant: string;
  aiSessionListAiDelegationSessions: string;
  aiSessionListLog: string;
  aiSessionListLogFileNotFound: (path: unknown) => string;
  aiSessionListNoActiveAiDelegationSessions: string;
  aiSessionListOpen: string;
  aiSessionListRemoveFromList: string;
  aiSessionListStopped: string;
  aiSessionListStopped2: (taskBasename: unknown) => string;
  aiSessionListTaskFileNotFound: (taskPath: unknown) => string;
  aiSessionRegistryAiSessionIsAlreadyRunning: (id: unknown) => string;
  autoSyncWatcherAutoSyncError: (msg: unknown) => string;
  autoSyncWatcherAutoSyncFiles: (value: unknown, count: unknown) => string;
  autoSyncWatcherAutoSyncSheetsApiRate: string;
  autoSyncWatcherOrganizationPushPull: (pushed: unknown, pulled: unknown) => string;
  autoSyncWatcherPersonalPushPull: (pushed: unknown, pulled: unknown) => string;
  calendarAllDay: string;
  calendarDaysAheadToDisplay1: string;
  calendarDaysToDisplay: string;
  calendarGoogleCalendarSettingsSelectYour: string;
  calendarIcalUrlIsNotConfigured: string;
  calendarLoading: string;
  calendarMaximumEvents: string;
  calendarNoEvents: string;
  calendarRegisterTheUrlUnderA: string;
  calendarShowsEventsFromGoogleOutlook: string;
  calendarText: (value: unknown, value2: unknown, wd: unknown) => string;
  calendarToday: (label: unknown) => string;
  calendarTomorrow: (label: unknown) => string;
  calendarYesterday: (label: unknown) => string;
  chartsChartsProgress: string;
  chartsChartsToDisplayCommaSeparated: string;
  chartsCompletedTasksLast30Days: string;
  chartsNone: string;
  chartsNotesCreatedLast30Days: string;
  chartsProjectField: string;
  chartsSmallChartsShowingCompletedTasks: string;
  chartsStatusField: string;
  chartsTaskFolder: string;
  chartsTasksByProject: string;
  chartsTasksByStatus: string;
  claudeCodeClaudeExitedCodeStderrStdout: (code: unknown, value: unknown, value2: unknown) => string;
  claudeCodeClaudePIsOnlySupported: string;
  claudeCodeClaudePTimedOut120: string;
  claudeCodeFailedToStartProcess: (message: unknown) => string;
  claudeCodeStreamClaudeStreamingWorksOnlyOn: string;
  claudeCodeStreamCouldNotWriteToStdin: (message: unknown) => string;
  claudeCodeStreamFailedToStartProcess: (message: unknown) => string;
  claudeCodeStreamTimedOutMin: (value: unknown) => string;
  commandsAutoSync: (value: unknown) => string;
  commandsAutoSyncTakesEffectAfter: (value: unknown) => string;
  commandsCalendars: (count: unknown, value: unknown) => string;
  commandsCancel: string;
  commandsFailedToRetrieve: (message: unknown) => string;
  commandsOpenMailGmail: string;
  commandsOrganizationLastSync: (spreadsheetUrl: unknown, value: unknown) => string;
  commandsOrganizationNotConfigured: string;
  commandsOrganizationPushPull: (pushed: unknown, pulled: unknown) => string;
  commandsOrganizationSheetCreated: (spreadsheetUrl: unknown) => string;
  commandsOrganizationSyncCompletePushPull: (pushed: unknown, pulled: unknown) => string;
  commandsPersonalLastSync: (spreadsheetUrl: unknown, value: unknown) => string;
  commandsPersonalNotConfigured: string;
  commandsPersonalPushPull: (pushed: unknown, pulled: unknown) => string;
  commandsPersonalSheetCreated: (spreadsheetUrl: unknown) => string;
  commandsPersonalSyncCompletePushPull: (pushed: unknown, pulled: unknown) => string;
  commandsReset: string;
  commandsResetHomeDashboard: string;
  commandsSetupFailed: (message: unknown) => string;
  commandsSheetsSyncSetupOrganizationSheet: string;
  commandsSheetsSyncSetupPersonalSheet: string;
  commandsSheetsSyncSyncNowOrganization: string;
  commandsSheetsSyncSyncNowPersonal: string;
  commandsSignedOutOfGoogleCalendar: string;
  commandsStartingSheetsSync: string;
  commandsSyncComplete: (value: unknown) => string;
  commandsSyncFailed: (message: unknown) => string;
  commandsTheDashboardWillBeOverwritten: (homePath: unknown) => string;
  commandsWillBeCreatedFromThe: (homePath: unknown) => string;
  commandsYourName: (value: unknown) => string;
  counterCountsTheResultsExampleList: string;
  counterDataviewListQuery: string;
  counterDisplayTheNumberOfResults: string;
  counterItems: string;
  counterItemsPieces: string;
  counterLabel: string;
  counterOpenTasks: string;
  counterTheDataviewPluginIsRequired: string;
  counterUnit: string;
  dashboardAddWidget: string;
  dashboardChangeHeight2WrapsAfter: string;
  dashboardChangeWidth468: string;
  dashboardDragToReorder: string;
  dashboardEdit: string;
  dashboardEditMode: string;
  dashboardMoveDown: string;
  dashboardMoveUp: string;
  dashboardNoWidgetsYetClickAdd: string;
  dashboardRegenerateDefaults: string;
  dashboardReload: string;
  dashboardUnsupportedWidget: (type: unknown) => string;
  dashboardViewMode: string;
  dataviewDataviewDqlOrJsTaskfolder: string;
  dataviewDqlDataviewQueryLanguageJs: string;
  dataviewMode: string;
  dataviewQuery: string;
  dataviewRunADataviewDqlQuery: string;
  dataviewTheDataviewPluginIsRequired: string;
  ganttContainsNoEvents: (markwhenPath: unknown) => string;
  ganttDaysAfterToday: string;
  ganttDaysBeforeToday: string;
  ganttDaysPx: (value: unknown, value2: unknown, totalDays: unknown, dayWidth: unknown) => string;
  ganttDefaultZoomUseTheAnd: string;
  ganttDueDateField: string;
  ganttEffortField: string;
  ganttExampleProjectsPlanMwLeave: string;
  ganttFolderContainsNoTasksWith: (folder: unknown) => string;
  ganttGanttChartBuiltFromTask: string;
  ganttGroupByField: string;
  ganttHideCompletedTasks: string;
  ganttMarkwhenFilePath: string;
  ganttMarkwhenMwFile: string;
  ganttNext: string;
  ganttNoEventsInThisPeriod: (value: unknown, value2: unknown) => string;
  ganttPrevious: string;
  ganttReset: string;
  ganttRowHeightPx: string;
  ganttSource: string;
  ganttStartDateFieldOptional: string;
  ganttTaskPropertiesDueDateEffort: string;
  ganttTasks: string;
  ganttTaskSourceFolder: string;
  ganttToday: string;
  ganttWasNotFound: (markwhenPath: unknown) => string;
  ganttWidthPerDayPx: string;
  gmailNoSubject: string;
  googleAuth1CreateAnOauth2: string;
  googleAuth2AddTheCalendarApi: string;
  googleAuth3PasteItIntoThe: string;
  googleAuthAuthenticationFailed: (message: unknown) => string;
  googleAuthBothClientIdAndClient: string;
  googleAuthCredentialsJsonPaste: string;
  googleAuthCredentialsSaved: string;
  googleAuthGoogleCalendarAuthentication: string;
  googleAuthPasteTheCompleteDownloadedJson: string;
  googleAuthSaveCredentials: string;
  googleAuthSaveCredentialsFirst: string;
  googleAuthSignedOut: string;
  googleAuthSignOut: string;
  googleAuthStartAuthentication: string;
  googleAuthStatusAuthenticated: string;
  googleAuthStatusNotAuthenticated: string;
  googleCalendarAllDay: string;
  googleCalendarAuthenticationRequiredOpenTheCommand: string;
  googleCalendarCalendarId: string;
  googleCalendarDaysToDisplay: string;
  googleCalendarFetchEventsUsingTheGoogle: string;
  googleCalendarLoading: string;
  googleCalendarMaximumEvents: string;
  googleCalendarNoEvents: string;
  googleCalendarPrimaryYourMainCalendarA: string;
  googleCalendarText: (value: unknown, value2: unknown, wd: unknown) => string;
  googleCalendarToday: (label: unknown) => string;
  googleCalendarTomorrow: (label: unknown) => string;
  googleCalendarYesterday: (label: unknown) => string;
  googleOAuthAuthenticationTimedOut5Minutes: string;
  googleOAuthConfigureOauthCredentialsFirst: string;
  googleOAuthDoctypeHtmlHtmlHeadTitle: string;
  googleOAuthGoogleAuthenticationComplete: string;
  googleOAuthH1MissingAuthorizationCodeH1: string;
  googleOAuthH1OauthErrorH1P: (value: unknown) => string;
  googleOAuthH1StateMismatchH1: string;
  googleOAuthNoRefreshTokenReturnedAdd: string;
  googleOAuthNotAuthenticatedAuthenticateFromThe: string;
  googleOAuthOauthAuthenticationIsOnlySupported: string;
  googleOAuthOauthCredentialsAreNotConfigured: string;
  googleOAuthOpeningGoogleAuthenticationInYour: string;
  icalHttp401AuthenticationRequiredUse: string;
  icalHttp403ForbiddenThisUrl: string;
  icalHttp404UrlNotFound: string;
  icalNetworkError: (message: unknown) => string;
  kanbanCannotDelegateVaultPathUnavailable: string;
  kanbanCardFieldsCommaSeparated: string;
  kanbanColumnsCommaSeparated: string;
  kanbanEveryone: string;
  kanbanFileNotFound: (value: unknown) => string;
  kanbanFolderContainsNoNotesWith: (folder: unknown, statusField: unknown) => string;
  kanbanFolderHoldingNotesWithA: (inheritFolderHint: unknown) => string;
  kanbanHideCompletedColumn: string;
  kanbanKanbanTasks: string;
  kanbanPropertyNamesFromTaskFrontmatter: string;
  kanbanShowNotesAsKanbanCards: string;
  kanbanSourceFolder: string;
  kanbanStatusPropertyName: string;
  kanbanStatusValuesInTheOrder: string;
  kanbanUpdateFailed: (message: unknown) => string;
  mailAiReply: string;
  mailAiReplyFailed: (message: unknown) => string;
  mailAllLabels: string;
  mailArchive: string;
  mailArchived: string;
  mailAssistAnthropicApiKeyIsNot: string;
  mailAssistBaseTheReplyOnThe: string;
  mailAssistEmailThread: string;
  mailAssistNoRelevantBackgroundNotesFound: string;
  mailAssistOutputFormatSummaryBulletsReply: (DELIM: unknown) => string;
  mailAssistRelatedVaultNotes: string;
  mailAssistReplyDraft: string;
  mailAssistWrite1ASummaryOf: string;
  mailAssistYouAreABusinessEmail: string;
  mailAttachment: string;
  mailCompactGmailMessageListClick: string;
  mailCompose: string;
  mailCompose2: string;
  mailComposeAiSummaryAndSourcesNot: string;
  mailComposeCancel: string;
  mailComposeCompose: string;
  mailComposeCreatingDraft: string;
  mailComposeDraftCreatedOpenItIn: (url: unknown) => string;
  mailComposeEnterARecipientTo: string;
  mailComposeFailedToCreateDraft: (message: unknown) => string;
  mailComposeForward: string;
  mailComposeMessage: string;
  mailComposeMessageBodyIsEmpty: string;
  mailComposeOpenedTheGmailDraftReview: string;
  mailComposeReply: string;
  mailComposeReviewAndSendInGmail: string;
  mailComposeSubject: string;
  mailFailed: (message: unknown) => string;
  mailFailedToRetrieveAttachment: (message: unknown) => string;
  mailForward: string;
  mailGeneratingAiReplyThreadSummary: string;
  mailGmailAuthenticationRequiredGoTo: string;
  mailGmailAuthenticationRequiredSettingsDeck: string;
  mailGmailSearchSyntaxExamplesIn: string;
  mailLoading: string;
  mailMail: string;
  mailMailGmail: string;
  mailMessageLimit: string;
  mailMovedToTrash: string;
  mailNoMail: string;
  mailNoMail2: string;
  mailRefresh: string;
  mailReply: string;
  mailSearchPressEnter: string;
  mailSearchQuery: string;
  mailSources: (value: unknown) => string;
  mailSourcesNone: string;
  mailTrash: string;
  mainAiDelegationNoActiveSessions: string;
  mainAiDelegationRunningTotalItems: (count: unknown, total: unknown) => string;
  mainAiDelegationSessions: string;
  mainAiItems: (icon: unknown, total: unknown) => string;
  mainAiRunning: (icon: unknown, count: unknown) => string;
  mainOpenMail: string;
  markdownAFreeformMarkdownNoteWith: string;
  markdownContent: string;
  markdownNotesWriteHereUseNote: string;
  noteEmbedMaximumLines: string;
  noteEmbedMaximumNumberOfLinesShown: string;
  noteEmbedNoNotePathConfiguredChoose: string;
  noteEmbedNoteNotFound: (notePath: unknown) => string;
  noteEmbedNotePath: string;
  noteEmbedPathRelativeToTheVault: string;
  noteEmbedPreviewANoteFromYour: string;
  sheetsSyncAssignedTaskIdToTasks: (newIds: unknown) => string;
  sheetsSyncGoogleSheetIsBeingCreated: (scope: unknown) => string;
  sheetsSyncObsidianTasksOrganization: string;
  sheetsSyncObsidianTasksPersonal: string;
  sheetsSyncOwnerCanTBeUsed: (value: unknown) => string;
  sheetsSyncPullFailed: (id: unknown, message: unknown) => string;
  sheetsSyncSelfOwnerIsNotSet: string;
  sheetsSyncSheetCreated: (scope: unknown, spreadsheetUrl: unknown) => string;
  sheetsSyncSheetIsAlreadyConfigured: (scope: unknown, spreadsheetUrl: unknown) => string;
  sheetsSyncSheetIsNotConfiguredRun: (scope: unknown, scope2: unknown) => string;
  sheetsSyncSyncIsAlreadyRunningPlease: string;
  sheetsSyncTaskFromSheetsSeeThe: (heading: unknown) => string;
  sheetsSyncTitleIsEmpty: string;
  syncSettingsAiBackend: string;
  syncSettingsAiReplyReferenceFoldersComma: string;
  syncSettingsAuthenticate: string;
  syncSettingsAuthenticated: string;
  syncSettingsAuthenticationStatus: string;
  syncSettingsAutomaticSynchronization: string;
  syncSettingsAutoSyncTakesEffectAfter: (value: unknown) => string;
  syncSettingsClaudeCodeClaudePSubscription: string;
  syncSettingsCreateSpreadsheet: string;
  syncSettingsDefaultEmailFilterExamplesIn: string;
  syncSettingsDisconnect: string;
  syncSettingsDisconnect2: string;
  syncSettingsDisconnected: (title: unknown) => string;
  syncSettingsEditingAMdInThe: string;
  syncSettingsExampleYamada: string;
  syncSettingsFolderNameForYourPersonal: string;
  syncSettingsGoogleAuthentication: string;
  syncSettingsInboxQuery: string;
  syncSettingsLastSync: string;
  syncSettingsMailGmail: string;
  syncSettingsManualSynchronization: string;
  syncSettingsMessageLimit: string;
  syncSettingsNeverSynced: string;
  syncSettingsNotAuthenticatedAuthenticateFirst: string;
  syncSettingsNotConfiguredANewSpreadsheet: string;
  syncSettingsOpenInBrowser: string;
  syncSettingsOrganizationPushPull: (pushed: unknown, pulled: unknown) => string;
  syncSettingsOrganizationTasks: string;
  syncSettingsPersonalPushPull: (pushed: unknown, pulled: unknown) => string;
  syncSettingsPersonalTasks: string;
  syncSettingsReauthenticateOpenSettings: string;
  syncSettingsRemovesThisVaultSConnection: string;
  syncSettingsSetupFailed: (message: unknown) => string;
  syncSettingsSpreadsheetUrl: string;
  syncSettingsSyncAll: string;
  syncSettingsSyncAutomaticallyWhenTaskFiles: string;
  syncSettingsSyncBothScopes: string;
  syncSettingsSyncComplete: (value: unknown) => string;
  syncSettingsSyncCompletePushPull: (title: unknown, pushed: unknown, pulled: unknown) => string;
  syncSettingsSyncFailed: (message: unknown) => string;
  syncSettingsSyncNow: string;
  syncSettingsSyncPersonalAndOrganizationTasks: string;
  syncSettingsUrlUnavailable: string;
  syncSettingsVaultFoldersUsedAsBackground: string;
  syncSettingsYourName: string;
  taskCreatorAdded: (title: unknown) => string;
  taskCreatorAddTask: string;
  taskCreatorCreateATaskNoteWith: string;
  taskCreatorDefaultEffort: string;
  taskCreatorDefaultLabel: string;
  taskCreatorDefaultPriority: string;
  taskCreatorDefaultProject: string;
  taskCreatorDefaultStatus: string;
  taskCreatorDestinationFolder: string;
  taskCreatorDue: string;
  taskCreatorEffort: string;
  taskCreatorEnterATaskName: string;
  taskCreatorLabel: string;
  taskCreatorOrPressEnter: string;
  taskCreatorPriority: string;
  taskCreatorProjectName: string;
  taskCreatorTaskCreatorNewTask: string;
  taskCreatorTaskNameEGPrepare: string;
  taskCreatorWritingDesign: string;
  taskCreatorYyyyMmDdOrNone: string;
  todayCreateTodaySNote: string;
  todayDailyNotePathFormat: string;
  todayDailyNotesFolder: string;
  todayExampleGoodMorningHaveA: string;
  todayGreetingOptional: string;
  todayMatchYourVaultSNaming: string;
  todayOpenTodaySNote: string;
  todayMonth: (value: unknown) => string;
  todayTodayDate: string;
  todayTodaySDateAndWeekday: string;
}

const en: Strings = {
  doneLabel: "Done",
  nothingToSync: "nothing to sync",
  neverSynced: "Never synced",
  noneLabel: "(none)",
  openSettings: "Open settings",
  folderNotSet: (label) => `Set the “${label}” folder to show this widget.`,
  fileNotSet: (label) => `Set the “${label}” file to show this widget.`,
  setFirstNotice: (label) => `Set “${label}” in Settings → Deck first.`,
  inheritFolderHint: "Leave empty to use the folder from Settings → Deck.",
  notSetPlaceholder: "Not set",

  settingsHomeHeading: "Home dashboard",
  settingsHomeFileName: "Home dashboard file",
  settingsHomeFileDesc:
    "Opened by the “Open home dashboard” command and the ribbon icon. It is created from the template when it does not exist yet.",
  settingsOpenOnStartupName: "Open the home dashboard on startup",
  settingsOpenOnStartupDesc:
    "When Obsidian has finished loading, open the home dashboard. If it is already open, switch to that tab.",
  settingsDashboardFolderName: "Folder for new dashboards",
  settingsDashboardFolderDesc: "Used by “Create new dashboard”. Leave empty to create them at the vault root.",
  settingsFoldersHeading: "Folders",
  settingsFoldersIntro:
    "Widgets read your notes from these folders. A widget whose folder is not set shows a reminder with a button back to this page. Folders written inside an existing .dashboard file are kept as they are.",
  taskFolderName: "Task notes",
  taskFolderDesc:
    "Notes with a status field in their frontmatter. Used by Kanban, Gantt, Charts, Task creator, Sheets sync and the {{taskFolder}} token in Dataview queries.",
  dailyFolderName: "Daily notes",
  dailyFolderDesc:
    "Used by the Today widget. When empty, the folder and date format of the core Daily notes plugin are used if it is turned on.",
  meetingFolderName: "Meeting notes",
  meetingFolderDesc: "Used by the {{meetingFolder}} token in Dataview queries, such as the home dashboard's meeting widgets.",
  markwhenFileName: "Markwhen file",
  markwhenFileDesc: "A .mw file. Used by the Gantt widget when its source is Markwhen.",
  aiLogFolderName: "AI delegation logs",
  aiLogFolderDesc:
    "Each run of “delegate to Claude Code” is written here as a note. Required before a task can be delegated.",
  syncLogFolderName: "Sheets sync logs",
  syncLogFolderDesc: "One JSON line per sync is appended to a daily .jsonl file here. Leave empty to keep no log.",
  aiNotesFolderName: "Notes saved from AI search",
  aiNotesFolderDesc: "Where the “save as note” button of the AI search widget creates notes.",
  excludeFoldersName: "Folders excluded from AI search",
  excludeFoldersDesc:
    "Comma separated. Skipped by AI search and AI mail replies, in addition to each widget's own list. The log folders above are always skipped.",
  settingsAiHeading: "AI",
  claudeCommandName: "Claude Code command",
  claudeCommandDesc:
    "Run by AI search, AI mail replies and AI delegation. Enter claude (found on your PATH) or the absolute path of the claude executable. Only enter a program you trust: it runs on this computer with access to your vault. Dashboard files cannot change this.",
  claudeCommandRejected: (reason) => {
    const why =
      reason === "empty"
        ? "it is empty"
        : reason === "control-chars"
          ? "it contains a line break or NUL character"
          : reason === "not-executable"
            ? "no executable file exists at that path"
            : "only claude or an absolute path to an executable is allowed";
    return `The Claude Code command in Settings → Deck was not run: ${why}.`;
  },
  dashboardCommandIgnored: (value) =>
    `This dashboard asks to run “${value}”. Deck only runs the Claude Code command from Settings → Deck, so that value was ignored.`,
  settingsCalendarsHeading: "Calendars (iCal)",
  settingsCalendarsDesc:
    "Register private calendar addresses here and refer to them by name in Calendar widgets. The address stays on this device (secret storage when available) instead of being written into .dashboard files.",
  calendarNameLabel: "Name",
  calendarUrlLabel: "iCal URL",
  calendarAdd: "Add",
  calendarRemove: "Remove",
  calendarNeedsNameAndUrl: "Enter both a name and an http(s) iCal URL.",
  calendarAllowPrivateName: "Allow calendars on local or private networks",
  calendarAllowPrivateDesc:
    "Off by default: addresses such as localhost, 192.168.x.x or 10.x.x.x are not fetched, so a dashboard received from someone else cannot make Obsidian contact devices on your network. Turn on only for calendars you host there yourself.",
  calendarRefused: (reason) =>
    reason === "scheme"
      ? "Only http(s) calendar addresses are fetched."
      : reason === "private"
        ? "This address is on a local or private network, so it was not fetched. Allow it in Settings → Deck if it is your own calendar."
        : "This is not a valid calendar address.",
  calendarUnknownName: (name) => `No calendar named “${name}” is registered in Settings → Deck on this device.`,
  calendarWidgetSourceName: "Calendar name",
  calendarWidgetSourceDesc: "A calendar registered in Settings → Deck → Calendars. Recommended for private addresses.",
  calendarWidgetUrlDesc:
    "Direct URL (kept for older dashboards). It is saved inside the .dashboard file, so anyone you share or sync the file with can read the calendar — register private addresses by name instead.",

  basesLabel: "Base (.base)",
  basesDescription: "Shows a .base file (Obsidian Bases) inside the dashboard.",
  basesFileName: "Base file",
  basesFileDesc: "Path to a .base file in this vault.",
  basesViewName: "View (optional)",
  basesViewDesc: "Name of a view inside the base. Leave empty to show the first view.",
  basesUnavailable:
    "Bases is not available here. It needs Obsidian 1.9 or later with the Bases core plugin turned on (Settings → Core plugins).",
  basesFileMissing: (path) => `File not found: ${path}`,

  homeTitle: "Home",
  tplToday: "Today",
  tplGreeting: "Good morning ☀️",
  tplOverdue: "Overdue",
  tplOverdueLabel: "🔥 Overdue",
  tplDueToday: "Due today",
  tplDueTodayLabel: "📌 Due today",
  tplDueWeek: "Due this week",
  tplDueWeekLabel: "📅 Due in 7 days",
  tplMeetingsWeek: "Meetings this week",
  tplMeetingsWeekLabel: "💬 Meeting notes (7 days)",
  tplUnitTasks: "tasks",
  tplUnitNotes: "notes",
  tplAiSearch: "AI search",
  tplKanban: "Kanban",
  tplCalendar: "This week",
  tplTasksToday: "🔥 Due today and overdue",
  tplTasksWeek: "📅 Due in the next 7 days",
  tplTasksByProject: "📊 Open tasks by project",
  tplRecentMeetings: "💬 Recent meeting notes",
  tplRecentNotes: "🕘 Recently edited notes",
  tplColumnDue: "Due",
  tplColumnPriority: "Priority",
  tplColumnStatus: "Status",
  tplColumnCount: "Count",
  tplColumnUpdated: "Updated",
  tplGuideTitle: "🧭 Getting started",
  tplGuideBody:
    "## Make it yours\n" +
    "- Set your folders in **Settings → Deck** (tasks, daily notes, meeting notes). Widgets that need one show a button that takes you there.\n" +
    "- Most list and counter widgets use the **Dataview** plugin. Calendar and mail need Google sign-in.\n\n" +
    "## Editing\n" +
    "- ⚙ edits a widget (changes are saved as you type)\n" +
    "- ✎ switches to edit mode: drag to reorder, change width and height\n" +
    "- ↻ reloads the dashboard\n" +
    "- Click the title to rename this dashboard\n\n" +
    "_Feel free to rewrite this note._",

  // Text moved out of the code (was hard-coded Japanese).
  weekdaysShort: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  addWidgetAdd: "Add",
  addWidgetAddWidget: "Add widget",
  addWidgetChangesSaveAutomaticallyAsYou: "✏ Changes save automatically as you type (close or press Esc when done)",
  addWidgetClose: "Close",
  addWidgetDelete: "🗑 Delete",
  addWidgetEdit: (type) => `Edit: ${type}`,
  addWidgetTitle: "Title",
  addWidgetUnknownWidgetType: (type) => `Unknown widget type: ${type}`,
  aiDelegationAccepteditsEditsAreApprovedAutomatically: "acceptEdits = edits are approved automatically / bypassPermissions = fully automatic (dangerous)",
  aiDelegationAccepteditsRecommended: "acceptEdits (recommended)",
  aiDelegationAiDelegation: (basename) => `✨ AI delegation: ${basename}`,
  aiDelegationAiDelegationCompletedS: (taskBasename, value, tail) => `AI delegation completed: ${taskBasename} (${value}s)${tail}`,
  aiDelegationAiDelegationContinuesLog: (path) => `AI delegation continues. Log: ${path}`,
  aiDelegationAiDelegationFailedCodeSee: (code) => `AI delegation failed (code=${code}) — see log`,
  aiDelegationAiDelegationStopped: (taskBasename) => `AI delegation stopped: ${taskBasename}`,
  aiDelegationAiSessionStopped: "AI session stopped",
  aiDelegationAlreadyRunning: "Already running",
  aiDelegationAndTheLogIsWritten: (value) => ` and the log is written live to ${value}/<timestamp>_<task>.md.`,
  aiDelegationBypasspermissionsFullyAutomatic: "bypassPermissions (fully automatic)",
  aiDelegationCannotRunAgain: "Cannot run again",
  aiDelegationClose: "Close",
  aiDelegationClosingThisWindowKeepsThe: " Closing this window keeps the session running,",
  aiDelegationComplete: "✅ Complete",
  aiDelegationCompletedS: (sec) => `Completed ${sec}s`,
  aiDelegationDelegateToAi: "🚀 Delegate to AI",
  aiDelegationDoEveryPartOfThe: "Do every part of the following task that an AI can do.\n\n# Guidelines\n- Read the task file and work out what needs doing\n- Actually do the parts an AI can finish (code scaffolds, research notes, tidying documents and so on)\n- Leave parts that need human judgment, outside contact or a physical check as TODOs\n- Append what you did, the remaining TODOs and references to the end of the task file, under a new \"## AI delegation log (today)\" section\n- Save research notes made along the way in a suitable place in the vault\n\n# Task file\n{{TASK_PATH}}\n\nFirst Read {{TASK_PATH}} to understand the task, make a plan, then start.",
  aiDelegationErrorCode: (value) => `Error (code=${value})`,
  aiDelegationFailedToStart: (msg) => `Failed to start: ${msg}`,
  aiDelegationInstructionsAreEmpty: "Instructions are empty",
  aiDelegationInstructionsForAi: "Instructions for AI",
  aiDelegationLogFileNotFound: (path) => `Log file not found: ${path}`,
  aiDelegationOpenLog: "📄 Open log",
  aiDelegationReopenItFromAiAt: " Reopen it from AI🤖 at the bottom right of the status bar.",
  aiDelegationRetry: "🔁 Retry",
  aiDelegationRunAgain: "✅ Run again",
  aiDelegationRunning: "Running…",
  aiDelegationRunningContinuesWhenClosed: "Running… (continues when closed)",
  aiDelegationStarting: "Starting…",
  aiDelegationStartingClaude: "Starting Claude…",
  aiDelegationStatusUpdateFailed: (message) => `Status update failed: ${message}`,
  aiDelegationStopped: "🛑 Stopped",
  aiDelegationStopped2: "Stopped",
  aiDelegationText: (value) => `✅ ${value}`,
  aiDelegationThisLetsTheAiEdit: "⚠️  This lets the AI edit files and run shell commands.",
  aiDelegationWaiting: "Waiting",
  aiLogWriterAiDelegationLog: "# AI delegation log",
  aiLogWriterError: (value) => `
### ❌ Error

${value}
`,
  aiLogWriterExecutionTrace: "## Execution trace",
  aiLogWriterFailed: "❌ Failed",
  aiLogWriterInstructions: "## Instructions",
  aiLogWriterMode: (permissionMode) => `- **Mode**: \`${permissionMode}\``,
  aiLogWriterResult: (value) => `
### ✅ Result

${value}
`,
  aiLogWriterResultDurationSToolCalls: (tag, sec, toolCount, value) => `**Result**: ${tag} / **Duration**: ${sec}s / **Tool calls**: ${toolCount} / **Finished**: ${value}`,
  aiLogWriterStopped: "🛑 Stopped",
  aiLogWriterSucceeded: "✅ Succeeded",
  aiLogWriterTask: (taskPath) => `- **Task**: [[${taskPath}]]`,
  aiSearchAdd12SentencesOn: "- Add 1-2 sentences on why it is relevant\n",
  aiSearchAiSearchNaturalLanguage: "AI Search (natural language)",
  aiSearchAnthropicApiKeyIsNot: "Anthropic API key is not configured for the API backend.",
  aiSearchApiKeySaved: "API key saved",
  aiSearchAreAlwaysExcluded: (value) => `${value} are always excluded`,
  aiSearchAskAQuestionEG: "Ask a question… (e.g. What did we decide about the project last week?) — ⌘+Enter to submit",
  aiSearchAvoidGuessingSayClearlyWhen: "- Avoid guessing; say clearly when something is not in the sources\n",
  aiSearchBackend: "Backend",
  aiSearchCancel: "Cancel",
  aiSearchCandidateCountTopK: "Candidate count (top-K)",
  aiSearchCandidatesApiInputTokensOutput: (count, model, inputTokens, outputTokens) => `${count} candidates / API ${model} / input ${inputTokens} tokens, output ${outputTokens} tokens`,
  aiSearchCandidatesClaudePMs: (count, cmd, ms) => `${count} candidates / claude -p (${cmd}) / ${ms}ms`,
  aiSearchCandidatesQueryingClaude: (count) => `Candidates: ${count} / querying Claude…`,
  aiSearchClaudeCodeThroughClaudeP: "claude-code = through `claude -p` (Pro/Max subscription, no API key, desktop only; the command is set in Settings → Deck) / api = the Anthropic API directly",
  aiSearchClaudeHaiku4520251001: "claude-haiku-4-5-20251001 is recommended (cheap). For smarter answers, use claude-sonnet-4-6 or similar",
  aiSearchDoNotInventNotesOutside: "- Do not invent notes outside the candidate list",
  aiSearchEmptyTheWholeVaultMinus: "Empty = the whole vault (minus excluded folders). Example: Meetings, Notes",
  aiSearchEndWithASourcesSection: "- End with a \"## Sources\" section listing each source as a heading plus URL\n",
  aiSearchExcerptLength: "Excerpt length",
  aiSearchExcludedFoldersCommaSeparated: "Excluded folders (comma-separated)",
  aiSearchExcludedFromSearchInAddition: "Excluded from search in addition to the excluded folders in Settings → Deck. ",
  aiSearchFailedToSave: (message) => `Failed to save: ${message}`,
  aiSearchFindCandidateNotesByKeyword: "Find candidate notes by keyword, then ask Claude to select relevant notes and summarize them.",
  aiSearchFindingCandidateNotes: "Finding candidate notes…",
  aiSearchIfNothingMatchesSayNo: "- If nothing matches, say \"No matching notes\" honestly\n",
  aiSearchKeepEachPointToA: "- Keep each point to a short bullet\n",
  aiSearchLinkEachNoteAsFile: "- Link each note as [[file name]] (basename only, no extension)\n",
  aiSearchModelApiBackendOnly: "Model (API backend only)",
  aiSearchNoMatchesSearchTheWeb: "🌐 No matches — search the web",
  aiSearchNumberOfCandidateNotesSent: "Number of candidate notes sent to Claude. More candidates use more tokens. Typical range: 20–50.",
  aiSearchNumberOfCharactersSentFrom: "Number of characters sent from each candidate note",
  aiSearchOrSwitchTheBackendTo: "Or switch the backend to \"claude-code\" in ⚙ to go through `claude -p` (works with a Pro/Max subscription, no API key needed)",
  aiSearchPick35ReliableSources: "- Pick 3-5 reliable sources (official docs, major media, expert blogs and so on)\n",
  aiSearchQuestion: (query) => `
# Question
${query}`,
  aiSearchQuestionCandidateVaultNotes: (q, ctxBlock) => `# Question
${q}

# Candidate vault notes
${ctxBlock}`,
  aiSearchSaveAsNote: (aiNotesFolder) => `📚 Save as note (${aiNotesFolder})`,
  aiSearchSaveAsNote2: "📚 Save as note",
  aiSearchSaved: (value) => `Saved: ${value}`,
  aiSearchSearch: "✨ Search (⌘+↵)",
  aiSearchSearchFoldersCommaSeparated: "Search folders (comma-separated)",
  aiSearchSearchingTheWeb: "Searching the web…",
  aiSearchSearchTheWeb: "🌐 Search the web",
  aiSearchSetApiKey: "🔑 Set API key",
  aiSearchSkAnt: "sk-ant-...",
  aiSearchUseTheWebsearchToolTo: "Use the WebSearch tool to research the question below and summarize the key points in English Markdown.\n",
  aiSearchWebSearchCompleteClaudeP: (ms) => `🌐 Web search complete / claude -p (WebSearch) / ${ms}ms`,
  aiSearchWebSearchResults: "🌐 Web search results",
  aiSearchYouAreASearchAssistant: "You are a search assistant for an Obsidian vault. From the candidate notes provided, pick the 3-7 most relevant to the user's question and answer in Markdown, in English.\n",
  aiSessionListAiDelegationSessions: "🤖 AI delegation sessions",
  aiSessionListLog: "📄 Log",
  aiSessionListLogFileNotFound: (path) => `Log file not found: ${path}`,
  aiSessionListNoActiveAiDelegationSessions: "No active AI delegation sessions",
  aiSessionListOpen: "📺 Open",
  aiSessionListRemoveFromList: "Remove from list",
  aiSessionListStopped: "🛑 Stopped",
  aiSessionListStopped2: (taskBasename) => `Stopped: ${taskBasename}`,
  aiSessionListTaskFileNotFound: (taskPath) => `Task file not found: ${taskPath}`,
  aiSessionRegistryAiSessionIsAlreadyRunning: (id) => `AI session is already running: ${id}`,
  autoSyncWatcherAutoSyncError: (msg) => `Auto-sync error: ${msg}`,
  autoSyncWatcherAutoSyncFiles: (value, count) => `📊 Auto-sync: ${value} (${count} files)`,
  autoSyncWatcherAutoSyncSheetsApiRate: "Auto-sync: Sheets API rate limit reached. Retrying in 30 seconds.",
  autoSyncWatcherOrganizationPushPull: (pushed, pulled) => `Organization push:${pushed} pull:${pulled}`,
  autoSyncWatcherPersonalPushPull: (pushed, pulled) => `Personal push:${pushed} pull:${pulled}`,
  calendarAllDay: "All day",
  calendarDaysAheadToDisplay1: "Days ahead to display (1 = today only; 7 = one week)",
  calendarDaysToDisplay: "Days to display",
  calendarGoogleCalendarSettingsSelectYour: "Google Calendar: Settings → select your calendar → Integrate calendar → Secret address in iCal format",
  calendarIcalUrlIsNotConfigured: "iCal URL is not configured.",
  calendarLoading: "Loading…",
  calendarMaximumEvents: "Maximum events",
  calendarNoEvents: "No events 🎉",
  calendarRegisterTheUrlUnderA: "Register the URL under a name in Settings → Deck → Calendars, then choose that name with ⚙",
  calendarShowsEventsFromGoogleOutlook: "Shows events from Google, Outlook or Apple calendars. Register a private iCal URL by name in Settings → Deck → Calendars and refer to it by that name.",
  calendarText: (value, value2, wd) => `${value}/${value2} (${wd})`,
  calendarToday: (label) => `Today ${label}`,
  calendarTomorrow: (label) => `Tomorrow ${label}`,
  calendarYesterday: (label) => `Yesterday ${label}`,
  chartsChartsProgress: "Charts (progress)",
  chartsChartsToDisplayCommaSeparated: "Charts to display (comma-separated)",
  chartsCompletedTasksLast30Days: "📈 Completed tasks (last 30 days)",
  chartsNone: "(none)",
  chartsNotesCreatedLast30Days: "📝 Notes created (last 30 days)",
  chartsProjectField: "Project field",
  chartsSmallChartsShowingCompletedTasks: "Small charts showing completed tasks, notes created, and tasks grouped by project or status.",
  chartsStatusField: "Status field",
  chartsTaskFolder: "Task folder",
  chartsTasksByProject: "📊 Tasks by project",
  chartsTasksByStatus: "🥧 Tasks by status",
  claudeCodeClaudeExitedCodeStderrStdout: (code, value, value2) => `claude exited code=${code}
stderr: ${value}
stdout: ${value2}`,
  claudeCodeClaudePIsOnlySupported: "claude -p is only supported on desktop.",
  claudeCodeClaudePTimedOut120: "claude -p timed out (120 seconds)",
  claudeCodeFailedToStartProcess: (message) => `Failed to start process: ${message}`,
  claudeCodeStreamClaudeStreamingWorksOnlyOn: "Claude streaming works only on desktop.",
  claudeCodeStreamCouldNotWriteToStdin: (message) => `Could not write to stdin: ${message}`,
  claudeCodeStreamFailedToStartProcess: (message) => `Failed to start process: ${message}`,
  claudeCodeStreamTimedOutMin: (value) => `Timed out (${value} min)`,
  commandsAutoSync: (value) => `Auto-sync: ${value}`,
  commandsAutoSyncTakesEffectAfter: (value) => `Auto-sync: ${value} (takes effect after reloading the plugin)`,
  commandsCalendars: (count, value) => `Calendars (${count}):
${value}`,
  commandsCancel: "Cancel",
  commandsFailedToRetrieve: (message) => `Failed to retrieve: ${message}`,
  commandsOpenMailGmail: "Open mail (Gmail)",
  commandsOrganizationLastSync: (spreadsheetUrl, value) => `Organization: ${spreadsheetUrl}
  Last sync: ${value}`,
  commandsOrganizationNotConfigured: "Organization: not configured",
  commandsOrganizationPushPull: (pushed, pulled) => `Organization push:${pushed} pull:${pulled}`,
  commandsOrganizationSheetCreated: (spreadsheetUrl) => `Organization sheet created: ${spreadsheetUrl}`,
  commandsOrganizationSyncCompletePushPull: (pushed, pulled) => `Organization sync complete: push ${pushed} / pull ${pulled}`,
  commandsPersonalLastSync: (spreadsheetUrl, value) => `Personal: ${spreadsheetUrl}
  Last sync: ${value}`,
  commandsPersonalNotConfigured: "Personal: not configured",
  commandsPersonalPushPull: (pushed, pulled) => `Personal push:${pushed} pull:${pulled}`,
  commandsPersonalSheetCreated: (spreadsheetUrl) => `Personal sheet created: ${spreadsheetUrl}`,
  commandsPersonalSyncCompletePushPull: (pushed, pulled) => `Personal sync complete: push ${pushed} / pull ${pulled}`,
  commandsReset: "Reset",
  commandsResetHomeDashboard: "Reset home dashboard",
  commandsSetupFailed: (message) => `Setup failed: ${message}`,
  commandsSheetsSyncSetupOrganizationSheet: "Sheets Sync: Setup organization sheet",
  commandsSheetsSyncSetupPersonalSheet: "Sheets Sync: Setup personal sheet",
  commandsSheetsSyncSyncNowOrganization: "Sheets Sync: Sync now (organization only)",
  commandsSheetsSyncSyncNowPersonal: "Sheets Sync: Sync now (personal only)",
  commandsSignedOutOfGoogleCalendar: "Signed out of Google Calendar",
  commandsStartingSheetsSync: "Starting Sheets sync…",
  commandsSyncComplete: (value) => `Sync complete: ${value}`,
  commandsSyncFailed: (message) => `Sync failed: ${message}`,
  commandsTheDashboardWillBeOverwritten: (homePath) => `The dashboard "${homePath}" will be overwritten with the default template. Its current layout and widget settings will be lost. Continue?`,
  commandsWillBeCreatedFromThe: (homePath) => `"${homePath}" will be created from the default template.`,
  commandsYourName: (value) => `Your name: ${value}`,
  counterCountsTheResultsExampleList: "Counts the results. Example: LIST FROM \"{{taskFolder}}\" WHERE status != \"Done\". {{taskFolder}} / {{meetingFolder}} / {{dailyFolder}} are replaced with the folders from Settings → Deck",
  counterDataviewListQuery: "Dataview LIST query",
  counterDisplayTheNumberOfResults: "Display the number of results from a Dataview query.",
  counterItems: " items",
  counterItemsPieces: "items / pieces / %",
  counterLabel: "Label",
  counterOpenTasks: "Open tasks",
  counterTheDataviewPluginIsRequired: "The Dataview plugin is required.",
  counterUnit: "Unit",
  dashboardAddWidget: "+ Add widget",
  dashboardChangeHeight2WrapsAfter: "Change height (+2, wraps after 16)",
  dashboardChangeWidth468: "Change width (4→6→8→10→12→4)",
  dashboardDragToReorder: "Drag to reorder",
  dashboardEdit: "Edit",
  dashboardEditMode: "✎ Edit mode",
  dashboardMoveDown: "Move down",
  dashboardMoveUp: "Move up",
  dashboardNoWidgetsYetClickAdd: "No widgets yet. Click '+ Add widget' to add your first one.",
  dashboardRegenerateDefaults: "Regenerate defaults",
  dashboardReload: "Reload",
  dashboardUnsupportedWidget: (type) => `Unsupported widget: ${type}`,
  dashboardViewMode: "✓ View mode",
  dataviewDataviewDqlOrJsTaskfolder: "Dataview DQL or JS. {{taskFolder}} / {{meetingFolder}} / {{dailyFolder}} are replaced with the folders from Settings → Deck",
  dataviewDqlDataviewQueryLanguageJs: "DQL: Dataview query language / JS: DataviewJS",
  dataviewMode: "Mode",
  dataviewQuery: "Query",
  dataviewRunADataviewDqlQuery: "Run a Dataview DQL query and display its results.",
  dataviewTheDataviewPluginIsRequired: "The Dataview plugin is required.",
  ganttContainsNoEvents: (markwhenPath) => `${markwhenPath} contains no events`,
  ganttDaysAfterToday: "Days after today",
  ganttDaysBeforeToday: "Days before today",
  ganttDaysPx: (value, value2, totalDays, dayWidth) => `${value} – ${value2} (${totalDays} days / ${dayWidth}px)`,
  ganttDefaultZoomUseTheAnd: "Default zoom. Use the + and − buttons to adjust it in the chart.",
  ganttDueDateField: "Due date field",
  ganttEffortField: "Effort field",
  ganttExampleProjectsPlanMwLeave: "Example: \"Projects/plan.mw\". Leave empty to use the Markwhen file from Settings → Deck.",
  ganttFolderContainsNoTasksWith: (folder) => `Folder "${folder}" contains no tasks with a due date`,
  ganttGanttChartBuiltFromTask: "Gantt chart, built from task frontmatter (due date + effort) or a Markwhen (.mw) file. Supports zoom and shifting the date range.",
  ganttGroupByField: "Group by field",
  ganttHideCompletedTasks: "Hide completed tasks",
  ganttMarkwhenFilePath: "Markwhen file path",
  ganttMarkwhenMwFile: "Markwhen (.mw) file",
  ganttNext: "Next »",
  ganttNoEventsInThisPeriod: (value, value2) => `No events in this period (${value} – ${value2}). Use « Previous / Next » to move the range, or show more days in settings.`,
  ganttPrevious: "« Previous",
  ganttReset: "Reset",
  ganttRowHeightPx: "Row height (px)",
  ganttSource: "Source",
  ganttStartDateFieldOptional: "Start date field (optional)",
  ganttTaskPropertiesDueDateEffort: "Task properties (due date / effort)",
  ganttTasks: "Tasks",
  ganttTaskSourceFolder: "Task source folder",
  ganttToday: "Today",
  ganttWasNotFound: (markwhenPath) => `${markwhenPath} was not found`,
  ganttWidthPerDayPx: "Width per day (px)",
  gmailNoSubject: "(no subject)",
  googleAuth1CreateAnOauth2: "1. Create an OAuth 2.0 client (Desktop) in Google Cloud Console and download credential.json",
  googleAuth2AddTheCalendarApi: "2. Add the Calendar API scope (.../auth/calendar.readonly) to the consent screen and add yourself as a test user",
  googleAuth3PasteItIntoThe: "3. Paste it into the field below, then press the authenticate button",
  googleAuthAuthenticationFailed: (message) => `Authentication failed: ${message}`,
  googleAuthBothClientIdAndClient: "Both client_id and client_secret are required",
  googleAuthCredentialsJsonPaste: "Credentials JSON (paste)",
  googleAuthCredentialsSaved: "Credentials saved",
  googleAuthGoogleCalendarAuthentication: "Google Calendar authentication",
  googleAuthPasteTheCompleteDownloadedJson: "Paste the complete downloaded JSON, or an object containing client_id and client_secret.",
  googleAuthSaveCredentials: "Save credentials",
  googleAuthSaveCredentialsFirst: "Save credentials first",
  googleAuthSignedOut: "Signed out",
  googleAuthSignOut: "Sign out",
  googleAuthStartAuthentication: "Start authentication",
  googleAuthStatusAuthenticated: "Status: ✅ Authenticated",
  googleAuthStatusNotAuthenticated: "Status: ❌ Not authenticated",
  googleCalendarAllDay: "All day",
  googleCalendarAuthenticationRequiredOpenTheCommand: "Authentication required. Open the command palette → Google Calendar: Authenticate",
  googleCalendarCalendarId: "Calendar ID",
  googleCalendarDaysToDisplay: "Days to display",
  googleCalendarFetchEventsUsingTheGoogle: "Fetch events using the Google Calendar API. Configure credentials and authenticate in plugin settings.",
  googleCalendarLoading: "Loading…",
  googleCalendarMaximumEvents: "Maximum events",
  googleCalendarNoEvents: "No events 🎉",
  googleCalendarPrimaryYourMainCalendarA: "primary = your main calendar. A Google Calendar ID such as xxx@group.calendar.google.com also works.",
  googleCalendarText: (value, value2, wd) => `${value}/${value2} (${wd})`,
  googleCalendarToday: (label) => `Today ${label}`,
  googleCalendarTomorrow: (label) => `Tomorrow ${label}`,
  googleCalendarYesterday: (label) => `Yesterday ${label}`,
  googleOAuthAuthenticationTimedOut5Minutes: "Authentication timed out (5 minutes).",
  googleOAuthConfigureOauthCredentialsFirst: "Configure OAuth credentials first.",
  googleOAuthDoctypeHtmlHtmlHeadTitle: "<!doctype html><html><head><title>Authentication complete</title></head><body style=\"font-family:system-ui;padding:40px;text-align:center;\"><h1>✅ Authentication complete</h1><p>Close this tab and return to Obsidian.</p></body></html>",
  googleOAuthGoogleAuthenticationComplete: "✅ Google authentication complete",
  googleOAuthH1MissingAuthorizationCodeH1: "<h1>Missing authorization code</h1>",
  googleOAuthH1OauthErrorH1P: (value) => `<h1>OAuth error</h1><p>${value}</p>`,
  googleOAuthH1StateMismatchH1: "<h1>State mismatch</h1>",
  googleOAuthNoRefreshTokenReturnedAdd: "No refresh token returned. Add yourself as a test user on the OAuth consent screen in Google Cloud Console, then retry.",
  googleOAuthNotAuthenticatedAuthenticateFromThe: "Not authenticated. Authenticate from the command palette.",
  googleOAuthOauthAuthenticationIsOnlySupported: "OAuth authentication is only supported on desktop.",
  googleOAuthOauthCredentialsAreNotConfigured: "OAuth credentials are not configured.",
  googleOAuthOpeningGoogleAuthenticationInYour: "Opening Google authentication in your browser…",
  icalHttp401AuthenticationRequiredUse: "HTTP 401 — authentication required. Use an iCal URL with an embedded access token.",
  icalHttp403ForbiddenThisUrl: "HTTP 403 Forbidden — this URL may require a corporate network or VPN, or its token may have expired. Try Google Calendar's secret address in iCal format.",
  icalHttp404UrlNotFound: "HTTP 404 — URL not found. Obtain a new URL.",
  icalNetworkError: (message) => `Network error: ${message}`,
  kanbanCannotDelegateVaultPathUnavailable: "Cannot delegate: vault path unavailable",
  kanbanCardFieldsCommaSeparated: "Card fields (comma-separated)",
  kanbanColumnsCommaSeparated: "Columns (comma-separated)",
  kanbanEveryone: "Everyone",
  kanbanFileNotFound: (value) => `File not found: ${value}`,
  kanbanFolderContainsNoNotesWith: (folder, statusField) => `Folder "${folder}" contains no notes with the property "${statusField}"`,
  kanbanFolderHoldingNotesWithA: (inheritFolderHint) => `Folder holding notes with a status field in their frontmatter. ${inheritFolderHint}`,
  kanbanHideCompletedColumn: "Hide completed column",
  kanbanKanbanTasks: "Kanban (tasks)",
  kanbanPropertyNamesFromTaskFrontmatter: "Property names from task frontmatter",
  kanbanShowNotesAsKanbanCards: "Show notes as Kanban cards grouped by a status property. Drag cards to change status.",
  kanbanSourceFolder: "Source folder",
  kanbanStatusPropertyName: "Status property name",
  kanbanStatusValuesInTheOrder: "Status values, in the order they should appear",
  kanbanUpdateFailed: (message) => `Update failed: ${message}`,
  mailAiReply: "🤖 AI reply",
  mailAiReplyFailed: (message) => `AI reply failed: ${message}`,
  mailAllLabels: "All labels",
  mailArchive: "🗄 Archive",
  mailArchived: "Archived",
  mailAssistAnthropicApiKeyIsNot: "Anthropic API key is not configured. Select the claude-code backend or configure an API key.",
  mailAssistBaseTheReplyOnThe: "Base the reply on the background, history and decisions in the past material. Do not invent facts that are not in the material.\n\n",
  mailAssistEmailThread: "# Email thread\n",
  mailAssistNoRelevantBackgroundNotesFound: "(No relevant background notes found)",
  mailAssistOutputFormatSummaryBulletsReply: (DELIM) => `Output format:
## Summary
(bullets)

${DELIM}
(Reply body. Start with the greeting; no signature.)

`,
  mailAssistRelatedVaultNotes: "\n\n# Related vault notes\n",
  mailAssistReplyDraft: "=== REPLY DRAFT ===",
  mailAssistWrite1ASummaryOf: "write (1) a summary of the thread and (2) a suitable reply draft.\n",
  mailAssistYouAreABusinessEmail: "You are a business email assistant. Read the email thread below and the related past material in the vault (meeting notes, knowledge notes), then ",
  mailAttachment: "📎 Attachment: ",
  mailCompactGmailMessageListClick: "Compact Gmail message list. Click to open the mail pane. Requires Gmail authentication.",
  mailCompose: "✏ Compose",
  mailCompose2: "✏ Compose",
  mailComposeAiSummaryAndSourcesNot: "🤖 AI summary and sources (not included in the email)",
  mailComposeCancel: "Cancel",
  mailComposeCompose: "Compose",
  mailComposeCreatingDraft: "Creating draft…",
  mailComposeDraftCreatedOpenItIn: (url) => `Draft created. Open it in Gmail: ${url}`,
  mailComposeEnterARecipientTo: "Enter a recipient (To)",
  mailComposeFailedToCreateDraft: (message) => `Failed to create draft: ${message}`,
  mailComposeForward: "Forward",
  mailComposeMessage: "Message…",
  mailComposeMessageBodyIsEmpty: "Message body is empty",
  mailComposeOpenedTheGmailDraftReview: "Opened the Gmail draft. Review it before sending.",
  mailComposeReply: "Reply",
  mailComposeReviewAndSendInGmail: "📤 Review and send in Gmail",
  mailComposeSubject: "Subject",
  mailFailed: (message) => `Failed: ${message}`,
  mailFailedToRetrieveAttachment: (message) => `Failed to retrieve attachment: ${message}`,
  mailForward: "↪ Forward",
  mailGeneratingAiReplyThreadSummary: "Generating AI reply… (thread summary and vault context)",
  mailGmailAuthenticationRequiredGoTo: "Gmail authentication required. Go to Settings → Deck → Reauthenticate.",
  mailGmailAuthenticationRequiredSettingsDeck: "Gmail authentication required (Settings → Deck → Reauthenticate).",
  mailGmailSearchSyntaxExamplesIn: "Gmail search syntax. Examples: in:inbox / is:unread / from:someone@example.com",
  mailLoading: "Loading…",
  mailMail: "Mail",
  mailMailGmail: "Mail (Gmail)",
  mailMessageLimit: "Message limit",
  mailMovedToTrash: "Moved to trash",
  mailNoMail: "No mail 🎉",
  mailNoMail2: "No mail 🎉",
  mailRefresh: "⟳ Refresh",
  mailReply: "↩ Reply",
  mailSearchPressEnter: "🔍 Search (press Enter)",
  mailSearchQuery: "Search query",
  mailSources: (value) => `Sources: ${value}`,
  mailSourcesNone: "Sources: none",
  mailTrash: "🗑 Trash",
  mainAiDelegationNoActiveSessions: "AI delegation: no active sessions",
  mainAiDelegationRunningTotalItems: (count, total) => `AI delegation: running ${count} / total ${total} items`,
  mainAiDelegationSessions: "AI delegation sessions",
  mainAiItems: (icon, total) => `${icon} AI ${total} items`,
  mainAiRunning: (icon, count) => `${icon} AI ${count} running`,
  mainOpenMail: "Open mail",
  markdownAFreeformMarkdownNoteWith: "A freeform Markdown note with headings and links.",
  markdownContent: "Content",
  markdownNotesWriteHereUseNote: "# Notes\n\nWrite here. Use [[Note name]] to link to a note.",
  noteEmbedMaximumLines: "Maximum lines",
  noteEmbedMaximumNumberOfLinesShown: "Maximum number of lines shown in the preview",
  noteEmbedNoNotePathConfiguredChoose: "No note path configured. Choose one in settings.",
  noteEmbedNoteNotFound: (notePath) => `Note not found: ${notePath}`,
  noteEmbedNotePath: "Note path",
  noteEmbedPathRelativeToTheVault: "Path relative to the vault root (example: About me.md)",
  noteEmbedPreviewANoteFromYour: "Preview a note from your vault.",
  sheetsSyncAssignedTaskIdToTasks: (newIds) => `Assigned task_id to ${newIds} tasks`,
  sheetsSyncGoogleSheetIsBeingCreated: (scope) => `${scope} Google Sheet is being created…`,
  sheetsSyncObsidianTasksOrganization: "Obsidian Tasks (Organization)",
  sheetsSyncObsidianTasksPersonal: "Obsidian Tasks (Personal)",
  sheetsSyncOwnerCanTBeUsed: (value) => `Owner "${value}" can't be used as a folder name, so the task went to Unassigned.`,
  sheetsSyncPullFailed: (id, message) => `Pull failed ${id}: ${message}`,
  sheetsSyncSelfOwnerIsNotSet: "self_owner is not set. Enter your own folder name in Settings → Deck before syncing the team sheet.",
  sheetsSyncSheetCreated: (scope, spreadsheetUrl) => `✅ ${scope} sheet created: ${spreadsheetUrl}`,
  sheetsSyncSheetIsAlreadyConfigured: (scope, spreadsheetUrl) => `${scope} sheet is already configured: ${spreadsheetUrl}`,
  sheetsSyncSheetIsNotConfiguredRun: (scope, scope2) => `${scope} sheet is not configured. Run 'Sheets Sync: Setup ${scope2}' first.`,
  sheetsSyncSyncIsAlreadyRunningPlease: "Sync is already running. Please wait.",
  sheetsSyncTaskFromSheetsSeeThe: (heading) => `# ${heading}

Task from Sheets. See the sheet for details.
`,
  sheetsSyncTitleIsEmpty: "Title is empty",
  syncSettingsAiBackend: "AI backend",
  syncSettingsAiReplyReferenceFoldersComma: "AI reply reference folders (comma-separated)",
  syncSettingsAuthenticate: "Authenticate",
  syncSettingsAuthenticated: "✅ Authenticated",
  syncSettingsAuthenticationStatus: "Authentication status",
  syncSettingsAutomaticSynchronization: "Automatic synchronization",
  syncSettingsAutoSyncTakesEffectAfter: (value) => `Auto-sync ${value} (takes effect after reloading the plugin)`,
  syncSettingsClaudeCodeClaudePSubscription: "claude-code = `claude -p` (subscription, no API key needed) / api = Anthropic API",
  syncSettingsCreateSpreadsheet: "Create spreadsheet",
  syncSettingsDefaultEmailFilterExamplesIn: "Default email filter. Examples: in:inbox / is:unread",
  syncSettingsDisconnect: "Disconnect",
  syncSettingsDisconnect2: "Disconnect",
  syncSettingsDisconnected: (title) => `${title} disconnected`,
  syncSettingsEditingAMdInThe: "Editing a .md in the task folder syncs automatically after a 2-second debounce. Reload the plugin for changes here to take effect.",
  syncSettingsExampleYamada: "Example: yamada",
  syncSettingsFolderNameForYourPersonal: "Folder name for your personal scope. <task folder>/{this name}/*.md count as personal tasks. Required for syncing the team sheet",
  syncSettingsGoogleAuthentication: "Google authentication",
  syncSettingsInboxQuery: "Inbox query",
  syncSettingsLastSync: "Last sync",
  syncSettingsMailGmail: "Mail (Gmail)",
  syncSettingsManualSynchronization: "Manual synchronization",
  syncSettingsMessageLimit: "Message limit",
  syncSettingsNeverSynced: "Never synced",
  syncSettingsNotAuthenticatedAuthenticateFirst: "❌ Not authenticated — authenticate first",
  syncSettingsNotConfiguredANewSpreadsheet: "Not configured — a new spreadsheet will be created",
  syncSettingsOpenInBrowser: "Open in browser",
  syncSettingsOrganizationPushPull: (pushed, pulled) => `Organization push:${pushed} pull:${pulled}`,
  syncSettingsOrganizationTasks: "Organization tasks",
  syncSettingsPersonalPushPull: (pushed, pulled) => `Personal push:${pushed} pull:${pulled}`,
  syncSettingsPersonalTasks: "Personal tasks",
  syncSettingsReauthenticateOpenSettings: "Reauthenticate / open settings",
  syncSettingsRemovesThisVaultSConnection: "Removes this vault's connection settings only. The spreadsheet remains.",
  syncSettingsSetupFailed: (message) => `Setup failed: ${message}`,
  syncSettingsSpreadsheetUrl: "Spreadsheet URL",
  syncSettingsSyncAll: "Sync all",
  syncSettingsSyncAutomaticallyWhenTaskFiles: "Sync automatically when task files change",
  syncSettingsSyncBothScopes: "Sync both scopes",
  syncSettingsSyncComplete: (value) => `Sync complete: ${value}`,
  syncSettingsSyncCompletePushPull: (title, pushed, pulled) => `${title} sync complete: push ${pushed} / pull ${pulled}`,
  syncSettingsSyncFailed: (message) => `Sync failed: ${message}`,
  syncSettingsSyncNow: "Sync now",
  syncSettingsSyncPersonalAndOrganizationTasks: "Sync personal and organization tasks. Unconfigured scopes are skipped.",
  syncSettingsUrlUnavailable: "(URL unavailable)",
  syncSettingsVaultFoldersUsedAsBackground: "Vault folders used as background when drafting a reply. Empty = the whole vault. Example: Meetings, Notes",
  syncSettingsYourName: "Your name",
  taskCreatorAdded: (title) => `✅ Added: ${title}`,
  taskCreatorAddTask: "＋ Add task",
  taskCreatorCreateATaskNoteWith: "Create a task note with properties using a form. It appears in matching Kanban and Gantt widgets.",
  taskCreatorDefaultEffort: "Default effort",
  taskCreatorDefaultLabel: "Default label",
  taskCreatorDefaultPriority: "Default priority",
  taskCreatorDefaultProject: "Default project",
  taskCreatorDefaultStatus: "Default status",
  taskCreatorDestinationFolder: "Destination folder",
  taskCreatorDue: "Due",
  taskCreatorEffort: "Effort",
  taskCreatorEnterATaskName: "Enter a task name",
  taskCreatorLabel: "Label",
  taskCreatorOrPressEnter: "Or press ⌘+Enter",
  taskCreatorPriority: "Priority",
  taskCreatorProjectName: "Project name",
  taskCreatorTaskCreatorNewTask: "Task Creator (new task)",
  taskCreatorTaskNameEGPrepare: "Task name (e.g. Prepare proposal slides)",
  taskCreatorWritingDesign: "Writing / Design…",
  taskCreatorYyyyMmDdOrNone: "YYYY-MM-DD or none",
  todayCreateTodaySNote: "📝 Create today's note",
  todayDailyNotePathFormat: "Daily note path format",
  todayDailyNotesFolder: "Daily notes folder",
  todayExampleGoodMorningHaveA: "Example: Good morning / Have a good day",
  todayGreetingOptional: "Greeting (optional)",
  todayMatchYourVaultSNaming: "Match your vault's naming (when the core Daily notes settings are used, their date format wins)",
  todayOpenTodaySNote: "📝 Open today's note",
  todayMonth: (value) => ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(value) - 1] ?? String(value),
  todayTodayDate: "Today (date)",
  todayTodaySDateAndWeekday: "Today's date and weekday, with a shortcut to your daily note.",
};

const ja: Strings = {
  doneLabel: "完了",
  nothingToSync: "対象なし",
  neverSynced: "未同期",
  noneLabel: "(なし)",
  openSettings: "設定を開く",
  folderNotSet: (label) => `このウィジェットを表示するには「${label}」のフォルダを設定してください。`,
  fileNotSet: (label) => `このウィジェットを表示するには「${label}」のファイルを設定してください。`,
  setFirstNotice: (label) => `先に 設定 → Deck で「${label}」を設定してください。`,
  inheritFolderHint: "空なら 設定 → Deck のフォルダを使います。",
  notSetPlaceholder: "未設定",

  settingsHomeHeading: "ホームダッシュボード",
  settingsHomeFileName: "ホームダッシュボードのファイル",
  settingsHomeFileDesc:
    "「Open home dashboard」コマンドとリボンのアイコンで開くファイルです。まだ無いときはテンプレートから作ります。",
  settingsOpenOnStartupName: "起動時にホームダッシュボードを開く",
  settingsOpenOnStartupDesc:
    "Obsidian の読み込みが終わったらホームダッシュボードを開きます。すでに開いているときは、そのタブに切り替えます。",
  settingsDashboardFolderName: "新しいダッシュボードの保存先",
  settingsDashboardFolderDesc: "「Create new dashboard」で作るファイルの置き場所です。空なら vault の直下に作ります。",
  settingsFoldersHeading: "フォルダ",
  settingsFoldersIntro:
    "ウィジェットはここで指定したフォルダからノートを読みます。フォルダが未設定のウィジェットには、この画面に戻るボタン付きの案内を出します。既存の .dashboard ファイルに書かれたフォルダは、そのまま使います。",
  taskFolderName: "タスクのノート",
  taskFolderDesc:
    "frontmatter に status を持つノートの置き場所です。Kanban・Gantt・Charts・Task creator・Sheets 同期と、Dataview クエリの {{taskFolder}} で使います。",
  dailyFolderName: "デイリーノート",
  dailyFolderDesc:
    "Today ウィジェットで使います。空のときは、コアプラグイン「デイリーノート」が有効ならそのフォルダと日付形式を使います。",
  meetingFolderName: "議事録",
  meetingFolderDesc: "Dataview クエリの {{meetingFolder}} で使います。ホームダッシュボードの議事録ウィジェットもこれを参照します。",
  markwhenFileName: "Markwhen ファイル",
  markwhenFileDesc: ".mw ファイルです。Gantt ウィジェットのソースを Markwhen にしたときに読みます。",
  aiLogFolderName: "AI 移譲のログ",
  aiLogFolderDesc:
    "Claude Code へのタスク移譲を 1 回ごとにノートとして書き出す場所です。移譲を使う前に設定が必要です。",
  syncLogFolderName: "Sheets 同期のログ",
  syncLogFolderDesc: "同期のたびに 1 行の JSON を日付ごとの .jsonl に追記します。空ならログを残しません。",
  aiNotesFolderName: "AI 検索から保存するノート",
  aiNotesFolderDesc: "AI 検索ウィジェットの「ノートとして保存」ボタンでノートを作る場所です。",
  excludeFoldersName: "AI 検索から除くフォルダ",
  excludeFoldersDesc:
    "カンマ区切りで指定します。AI 検索と AI のメール返信で、各ウィジェットの除外リストに加えて読み飛ばします。上のログ用フォルダは常に除きます。",
  settingsAiHeading: "AI",
  claudeCommandName: "Claude Code のコマンド",
  claudeCommandDesc:
    "AI 検索・AI のメール返信・AI 移譲で起動するコマンドです。claude（PATH から探します）か、claude の実行ファイルの絶対パスを入れてください。この PC 上で vault にアクセスできる状態で動くので、信頼できる実行ファイルだけを指定してください。ダッシュボードのファイルからは変更できません。",
  claudeCommandRejected: (reason) => {
    const why =
      reason === "empty"
        ? "空です"
        : reason === "control-chars"
          ? "改行か NUL 文字が含まれています"
          : reason === "not-executable"
            ? "そのパスに実行できるファイルがありません"
            : "claude か、実行ファイルの絶対パスだけを指定できます";
    return `設定 → Deck の Claude Code のコマンドを実行しませんでした: ${why}。`;
  },
  dashboardCommandIgnored: (value) =>
    `このダッシュボードには「${value}」を実行する設定が書かれています。Deck は 設定 → Deck の Claude Code のコマンドだけを実行するので、この値は使いませんでした。`,
  settingsCalendarsHeading: "カレンダー (iCal)",
  settingsCalendarsDesc:
    "非公開のカレンダー URL はここに名前を付けて登録し、Calendar ウィジェットからは名前で参照してください。URL は .dashboard ファイルに書かれず、この端末に保存されます（使えるときはシークレットストレージ）。",
  calendarNameLabel: "名前",
  calendarUrlLabel: "iCal URL",
  calendarAdd: "追加",
  calendarRemove: "削除",
  calendarNeedsNameAndUrl: "名前と http(s) の iCal URL の両方を入れてください。",
  calendarAllowPrivateName: "ローカル・プライベートネットワークのカレンダーを許可する",
  calendarAllowPrivateDesc:
    "既定はオフです。localhost や 192.168.x.x、10.x.x.x などの宛先は取得しないので、他人から受け取ったダッシュボードが手元のネットワーク内の機器に接続させることはできません。自分でそこにカレンダーを置いているときだけオンにしてください。",
  calendarRefused: (reason) =>
    reason === "scheme"
      ? "http(s) のカレンダー URL だけを取得します。"
      : reason === "private"
        ? "ローカルまたはプライベートネットワークの宛先なので取得しませんでした。自分のカレンダーなら 設定 → Deck で許可してください。"
        : "カレンダーの URL として正しくありません。",
  calendarUnknownName: (name) => `「${name}」という名前のカレンダーは、この端末の 設定 → Deck に登録されていません。`,
  calendarWidgetSourceName: "カレンダー名",
  calendarWidgetSourceDesc: "設定 → Deck → カレンダー に登録した名前です。非公開 URL はこちらを使ってください。",
  calendarWidgetUrlDesc:
    "URL の直接指定（以前のダッシュボードとの互換用）。.dashboard ファイルに保存されるので、共有・同期した相手もカレンダーを読めます。非公開 URL は名前で登録してください。",

  basesLabel: "Base (.base)",
  basesDescription: ".base ファイル（Obsidian Bases）をダッシュボードの中に表示します。",
  basesFileName: "Base ファイル",
  basesFileDesc: "この vault にある .base ファイルのパスです。",
  basesViewName: "ビュー（任意）",
  basesViewDesc: "base の中のビュー名です。空なら最初のビューを表示します。",
  basesUnavailable:
    "この環境では Bases を使えません。Obsidian 1.9 以降で、コアプラグイン「Bases」を有効にしてください（設定 → コアプラグイン）。",
  basesFileMissing: (path) => `ファイルが見つかりません: ${path}`,

  homeTitle: "ホーム",
  tplToday: "今日",
  tplGreeting: "おはよう ☀️",
  tplOverdue: "期限超過",
  tplOverdueLabel: "🔥 期限超過",
  tplDueToday: "今日締切",
  tplDueTodayLabel: "📌 今日締切",
  tplDueWeek: "今週締切",
  tplDueWeekLabel: "📅 7日以内に締切",
  tplMeetingsWeek: "今週の議事録",
  tplMeetingsWeekLabel: "💬 7日以内の議事録",
  tplUnitTasks: "件",
  tplUnitNotes: "件",
  tplAiSearch: "AI 検索",
  tplKanban: "Kanban",
  tplCalendar: "今週の予定",
  tplTasksToday: "🔥 今日締切と期限超過",
  tplTasksWeek: "📅 7日以内に締切",
  tplTasksByProject: "📊 PJT別の未完了タスク",
  tplRecentMeetings: "💬 最近の議事録",
  tplRecentNotes: "🕘 最近編集したノート",
  tplColumnDue: "期限",
  tplColumnPriority: "優先",
  tplColumnStatus: "状態",
  tplColumnCount: "件数",
  tplColumnUpdated: "更新",
  tplGuideTitle: "🧭 はじめに",
  tplGuideBody:
    "## 自分の vault に合わせる\n" +
    "- **設定 → Deck** でフォルダ（タスク・デイリーノート・議事録）を指定します。フォルダが必要なウィジェットには、設定画面へのボタンが出ます。\n" +
    "- 一覧やカウンターのウィジェットの多くは **Dataview** プラグインを使います。カレンダーとメールには Google へのサインインが必要です。\n\n" +
    "## 編集のしかた\n" +
    "- ⚙ でウィジェットを編集（入力はその場で保存）\n" +
    "- ✎ で編集モード（ドラッグで並び替え、幅と高さの変更）\n" +
    "- ↻ でダッシュボードを読み込み直す\n" +
    "- タイトルをクリックすると名前を変えられます\n\n" +
    "_このメモは自由に書き換えてかまいません。_",

  // Text moved out of the code (was hard-coded Japanese).
  weekdaysShort: ["日", "月", "火", "水", "木", "金", "土"],
  addWidgetAdd: "追加",
  addWidgetAddWidget: "ウィジェットを追加",
  addWidgetChangesSaveAutomaticallyAsYou: "✏ 入力するだけで自動保存されます (閉じるかEscでOK)",
  addWidgetClose: "閉じる",
  addWidgetDelete: "🗑 削除",
  addWidgetEdit: (type) => `編集: ${type}`,
  addWidgetTitle: "タイトル",
  addWidgetUnknownWidgetType: (type) => `不明なウィジェット種別: ${type}`,
  aiDelegationAccepteditsEditsAreApprovedAutomatically: "acceptEdits = 編集は自動承認 / bypassPermissions = 全自動 (危険)",
  aiDelegationAccepteditsRecommended: "acceptEdits (推奨)",
  aiDelegationAiDelegation: (basename) => `✨ AI移譲: ${basename}`,
  aiDelegationAiDelegationCompletedS: (taskBasename, value, tail) => `AI移譲完了: ${taskBasename} (${value}s)${tail}`,
  aiDelegationAiDelegationContinuesLog: (path) => `AI移譲は継続中。ログ: ${path}`,
  aiDelegationAiDelegationFailedCodeSee: (code) => `AI移譲失敗 (code=${code}) — ログ参照`,
  aiDelegationAiDelegationStopped: (taskBasename) => `AI移譲中止: ${taskBasename}`,
  aiDelegationAiSessionStopped: "AIセッションを中止しました",
  aiDelegationAlreadyRunning: "既に実行中です",
  aiDelegationAndTheLogIsWritten: (value) => ` ログは ${value}/<timestamp>_<task>.md にリアルタイム書き出しされます。`,
  aiDelegationBypasspermissionsFullyAutomatic: "bypassPermissions (全自動)",
  aiDelegationCannotRunAgain: "再実行不可",
  aiDelegationClose: "閉じる",
  aiDelegationClosingThisWindowKeepsThe: " 実行中にモーダルを閉じてもセッションは継続し、",
  aiDelegationComplete: "✅ 完了",
  aiDelegationCompletedS: (sec) => `完了 ${sec}s`,
  aiDelegationDelegateToAi: "🚀 AIに渡す",
  aiDelegationDoEveryPartOfThe: "次のタスクのうち、AIが実行可能な部分をすべて実施してください。\n\n# 指針\n- タスクファイルを読み、何をすべきか把握する\n- AIが完遂できる部分は実際に作業する (コード雛形・調査メモ作成・ドキュメント整理など)\n- 人間判断・外部連絡・実物確認が必要な部分はTODOとして残す\n- 作業内容・残TODO・参考情報をタスクファイルの末尾に \"## AI移譲ログ (今日)\" セクションを作って追記する\n- 作業中の調査メモは vault 内の適切な場所に保存\n\n# タスクファイル\n{{TASK_PATH}}\n\nまず {{TASK_PATH}} を Read してタスク内容を把握し、計画を立ててから着手してください。",
  aiDelegationErrorCode: (value) => `エラー (code=${value})`,
  aiDelegationFailedToStart: (msg) => `起動失敗: ${msg}`,
  aiDelegationInstructionsAreEmpty: "指示が空です",
  aiDelegationInstructionsForAi: "AIへの指示",
  aiDelegationLogFileNotFound: (path) => `ログファイルが見つかりません: ${path}`,
  aiDelegationOpenLog: "📄 ログを開く",
  aiDelegationReopenItFromAiAt: " ステータスバー右下の AI🤖 から復帰できます。",
  aiDelegationRetry: "🔁 再試行",
  aiDelegationRunAgain: "✅ 再実行",
  aiDelegationRunning: "実行中…",
  aiDelegationRunningContinuesWhenClosed: "実行中… (閉じても継続)",
  aiDelegationStarting: "起動中…",
  aiDelegationStartingClaude: "claude起動中…",
  aiDelegationStatusUpdateFailed: (message) => `status更新失敗: ${message}`,
  aiDelegationStopped: "🛑 中止",
  aiDelegationStopped2: "中止",
  aiDelegationText: (value) => `✅ ${value}`,
  aiDelegationThisLetsTheAiEdit: "⚠️  AIにファイル編集・シェルコマンド実行を許可します。",
  aiDelegationWaiting: "待機中",
  aiLogWriterAiDelegationLog: "# AI移譲ログ",
  aiLogWriterError: (value) => `
### ❌ エラー

${value}

`,
  aiLogWriterExecutionTrace: "## 実行トレース",
  aiLogWriterFailed: "❌ 失敗",
  aiLogWriterInstructions: "## 指示",
  aiLogWriterMode: (permissionMode) => `- **モード**: \`${permissionMode}\``,
  aiLogWriterResult: (value) => `
### ✅ 結果

${value}

`,
  aiLogWriterResultDurationSToolCalls: (tag, sec, toolCount, value) => `**結果**: ${tag} / **所要時間**: ${sec}s / **ツール呼出**: ${toolCount} / **終了**: ${value}`,
  aiLogWriterStopped: "🛑 中止",
  aiLogWriterSucceeded: "✅ 成功",
  aiLogWriterTask: (taskPath) => `- **タスク**: [[${taskPath}]]`,
  aiSearchAdd12SentencesOn: "- なぜ関連するかを1-2文で添える\n",
  aiSearchAiSearchNaturalLanguage: "AI Search (自然言語検索)",
  aiSearchAnthropicApiKeyIsNot: "Anthropic API キーが未設定です (API backend用)。",
  aiSearchApiKeySaved: "APIキーを保存しました",
  aiSearchAreAlwaysExcluded: (value) => `${value} は強制除外`,
  aiSearchAskAQuestionEG: "聞きたいことを自然な日本語で… (例: 先週のサンプル案件の議論ポイント) — ⌘+Enter で送信",
  aiSearchAvoidGuessingSayClearlyWhen: "- 推測・憶測は避け、ソースに無い情報は明記\n",
  aiSearchBackend: "バックエンド",
  aiSearchCancel: "キャンセル",
  aiSearchCandidateCountTopK: "候補数 (top-K)",
  aiSearchCandidatesApiInputTokensOutput: (count, model, inputTokens, outputTokens) => `候補 ${count} 件 / API ${model} / 入力 ${inputTokens}t 出力 ${outputTokens}t`,
  aiSearchCandidatesClaudePMs: (count, cmd, ms) => `候補 ${count} 件 / claude -p (${cmd}) / ${ms}ms`,
  aiSearchCandidatesQueryingClaude: (count) => `候補 ${count} 件 / Claude 問い合わせ中…`,
  aiSearchClaudeCodeThroughClaudeP: "claude-code = `claude -p` 経由 (Pro/Maxサブスク・APIキー不要・desktop限定。コマンドは 設定 → Deck で指定) / api = Anthropic API 直叩き",
  aiSearchClaudeHaiku4520251001: "claude-haiku-4-5-20251001 推奨 (安価)。賢く欲しければ claude-sonnet-4-6 等",
  aiSearchDoNotInventNotesOutside: "- 候補リスト外を発明しない",
  aiSearchEmptyTheWholeVaultMinus: "空 = vault全体（除外フォルダを除く）。例: Meetings, Notes",
  aiSearchEndWithASourcesSection: "- 最後に \"## 参照\" セクションを作り、見出し+URLでソースを並べる\n",
  aiSearchExcerptLength: "抜粋文字数",
  aiSearchExcludedFoldersCommaSeparated: "除外フォルダ (カンマ区切り)",
  aiSearchExcludedFromSearchInAddition: "設定 → Deck の除外フォルダに加えて、検索対象から外す。",
  aiSearchFailedToSave: (message) => `保存失敗: ${message}`,
  aiSearchFindCandidateNotesByKeyword: "自然言語クエリ → vault内候補をkeyword pre-filter → Claudeに渡して関連ノートを要約付きで返す。",
  aiSearchFindingCandidateNotes: "候補抽出中…",
  aiSearchIfNothingMatchesSayNo: "- 該当なしなら正直に「該当ノートなし」と言う\n",
  aiSearchKeepEachPointToA: "- 各論点を箇条書きで簡潔に\n",
  aiSearchLinkEachNoteAsFile: "- 各回答ノートは [[ファイル名]] 形式でリンク (拡張子なし、basenameのみ)\n",
  aiSearchModelApiBackendOnly: "モデル (api backendのみ)",
  aiSearchNoMatchesSearchTheWeb: "🌐 該当なし — Webで調べる",
  aiSearchNumberOfCandidateNotesSent: "Claudeに送る候補ノート数。多いほど精度高/高コスト。20-50推奨",
  aiSearchNumberOfCharactersSentFrom: "各候補ノートから何文字を文脈として送るか",
  aiSearchOrSwitchTheBackendTo: "または ⚙ から backend を「claude-code」に切替で `claude -p` 経由 (Pro/Maxサブスクで動作・APIキー不要)",
  aiSearchPick35ReliableSources: "- 信頼できる情報源を3-5件選ぶ (公式ドキュメント・主要メディア・専門ブログ等)\n",
  aiSearchQuestion: (query) => `
# 質問
${query}`,
  aiSearchQuestionCandidateVaultNotes: (q, ctxBlock) => `# 質問
${q}

# vault候補ノート
${ctxBlock}`,
  aiSearchSaveAsNote: (aiNotesFolder) => `📚 ナレッジ化 (${aiNotesFolder})`,
  aiSearchSaveAsNote2: "📚 ナレッジ化",
  aiSearchSaved: (value) => `保存: ${value}`,
  aiSearchSearch: "✨ 検索 (⌘+↵)",
  aiSearchSearchFoldersCommaSeparated: "検索対象フォルダ (カンマ区切り)",
  aiSearchSearchingTheWeb: "Web検索中…",
  aiSearchSearchTheWeb: "🌐 Webで調べる",
  aiSearchSetApiKey: "🔑 APIキーを設定",
  aiSearchSkAnt: "sk-ant-... 形式",
  aiSearchUseTheWebsearchToolTo: "WebSearchツールを使って次の質問を調査し、要点を日本語Markdownでまとめてください。\n",
  aiSearchWebSearchCompleteClaudeP: (ms) => `🌐 Web検索完了 / claude -p (WebSearch) / ${ms}ms`,
  aiSearchWebSearchResults: "🌐 Web検索結果",
  aiSearchYouAreASearchAssistant: "あなたはObsidian vaultの検索アシスタントです。ユーザーの質問に対して、提示されたノート候補から最も関連度の高い 3-7 件を選び、Markdownで日本語で回答してください。\n",
  aiSessionListAiDelegationSessions: "🤖 AI移譲セッション",
  aiSessionListLog: "📄 ログ",
  aiSessionListLogFileNotFound: (path) => `ログファイルが見つかりません: ${path}`,
  aiSessionListNoActiveAiDelegationSessions: "アクティブなAI移譲セッションはありません",
  aiSessionListOpen: "📺 開く",
  aiSessionListRemoveFromList: "リストから削除",
  aiSessionListStopped: "🛑 中止",
  aiSessionListStopped2: (taskBasename) => `中止: ${taskBasename}`,
  aiSessionListTaskFileNotFound: (taskPath) => `タスクファイル不在: ${taskPath}`,
  aiSessionRegistryAiSessionIsAlreadyRunning: (id) => `AIセッションは既に実行中: ${id}`,
  autoSyncWatcherAutoSyncError: (msg) => `自動同期エラー: ${msg}`,
  autoSyncWatcherAutoSyncFiles: (value, count) => `📊 自動同期: ${value} (${count}件)`,
  autoSyncWatcherAutoSyncSheetsApiRate: "自動同期: Sheets APIレート制限。30秒後に再試行します。",
  autoSyncWatcherOrganizationPushPull: (pushed, pulled) => `組織 push:${pushed} pull:${pulled}`,
  autoSyncWatcherPersonalPushPull: (pushed, pulled) => `個人 push:${pushed} pull:${pulled}`,
  calendarAllDay: "終日",
  calendarDaysAheadToDisplay1: "今日から何日先まで表示するか (1=今日のみ / 7=今週)",
  calendarDaysToDisplay: "表示日数",
  calendarGoogleCalendarSettingsSelectYour: "Google カレンダー: 設定 → カレンダー → 該当カレンダー → 「カレンダーの統合」→「カレンダーの非公開URL（iCal形式）」をコピー",
  calendarIcalUrlIsNotConfigured: "iCal URL が未設定です。",
  calendarLoading: "読み込み中…",
  calendarMaximumEvents: "最大件数",
  calendarNoEvents: "予定はありません 🎉",
  calendarRegisterTheUrlUnderA: "設定 → Deck → カレンダー に名前を付けて URL を登録し、⚙ でその名前を指定",
  calendarShowsEventsFromGoogleOutlook: "Google/Outlook/Apple カレンダーの予定を表示。非公開の iCal URL は 設定 → Deck → カレンダー に名前で登録して参照。",
  calendarText: (value, value2, wd) => `${value}/${value2}（${wd}）`,
  calendarToday: (label) => `今日 ${label}`,
  calendarTomorrow: (label) => `明日 ${label}`,
  calendarYesterday: (label) => `昨日 ${label}`,
  chartsChartsProgress: "Charts (進捗グラフ)",
  chartsChartsToDisplayCommaSeparated: "表示するチャート (カンマ区切り)",
  chartsCompletedTasksLast30Days: "📈 完了タスク (過去30日)",
  chartsNone: "(なし)",
  chartsNotesCreatedLast30Days: "📝 ノート作成数 (過去30日)",
  chartsProjectField: "PJT フィールド",
  chartsSmallChartsShowingCompletedTasks: "完了タスク・ノート作成数・PJT別の集計をSVGミニグラフで表示。Chart libraryなしの軽量実装。",
  chartsStatusField: "status フィールド",
  chartsTaskFolder: "タスクフォルダ",
  chartsTasksByProject: "📊 PJT別タスク数",
  chartsTasksByStatus: "🥧 status別タスク数",
  claudeCodeClaudeExitedCodeStderrStdout: (code, value, value2) => `claude exited code=${code}
stderr: ${value}
stdout: ${value2}`,
  claudeCodeClaudePIsOnlySupported: "claude -p はデスクトップ版のみ対応です。",
  claudeCodeClaudePTimedOut120: "claude -p タイムアウト (120秒)",
  claudeCodeFailedToStartProcess: (message) => `spawn失敗: ${message}`,
  claudeCodeStreamClaudeStreamingWorksOnlyOn: "claude streaming はデスクトップ版のみ対応です。",
  claudeCodeStreamCouldNotWriteToStdin: (message) => `stdin書込失敗: ${message}`,
  claudeCodeStreamFailedToStartProcess: (message) => `spawn失敗: ${message}`,
  claudeCodeStreamTimedOutMin: (value) => `タイムアウト (${value}分)`,
  commandsAutoSync: (value) => `自動同期: ${value}`,
  commandsAutoSyncTakesEffectAfter: (value) => `自動同期: ${value}（次回プラグイン再読み込み時に有効化）`,
  commandsCalendars: (count, value) => `カレンダー一覧 (${count}件):
${value}`,
  commandsCancel: "キャンセル",
  commandsFailedToRetrieve: (message) => `取得失敗: ${message}`,
  commandsOpenMailGmail: "メールを開く (Gmail)",
  commandsOrganizationLastSync: (spreadsheetUrl, value) => `組織: ${spreadsheetUrl}
  最終: ${value}`,
  commandsOrganizationNotConfigured: "組織: 未設定",
  commandsOrganizationPushPull: (pushed, pulled) => `組織 push:${pushed} pull:${pulled}`,
  commandsOrganizationSheetCreated: (spreadsheetUrl) => `組織シート作成: ${spreadsheetUrl}`,
  commandsOrganizationSyncCompletePushPull: (pushed, pulled) => `組織同期完了: push ${pushed} / pull ${pulled}`,
  commandsPersonalLastSync: (spreadsheetUrl, value) => `個人: ${spreadsheetUrl}
  最終: ${value}`,
  commandsPersonalNotConfigured: "個人: 未設定",
  commandsPersonalPushPull: (pushed, pulled) => `個人 push:${pushed} pull:${pulled}`,
  commandsPersonalSheetCreated: (spreadsheetUrl) => `個人シート作成: ${spreadsheetUrl}`,
  commandsPersonalSyncCompletePushPull: (pushed, pulled) => `個人同期完了: push ${pushed} / pull ${pulled}`,
  commandsReset: "リセット",
  commandsResetHomeDashboard: "ホームダッシュボードをリセット",
  commandsSetupFailed: (message) => `Setup失敗: ${message}`,
  commandsSheetsSyncSetupOrganizationSheet: "Sheets Sync: Setup org sheet (組織)",
  commandsSheetsSyncSetupPersonalSheet: "Sheets Sync: Setup personal sheet (個人)",
  commandsSheetsSyncSyncNowOrganization: "Sheets Sync: Sync now (組織 only)",
  commandsSheetsSyncSyncNowPersonal: "Sheets Sync: Sync now (個人 only)",
  commandsSignedOutOfGoogleCalendar: "Google Calendar からサインアウトしました",
  commandsStartingSheetsSync: "Sheets同期を開始…",
  commandsSyncComplete: (value) => `同期完了: ${value}`,
  commandsSyncFailed: (message) => `同期失敗: ${message}`,
  commandsTheDashboardWillBeOverwritten: (homePath) => `現在の「${homePath}」を初期テンプレートで上書きします。元のレイアウトとウィジェット設定は失われます。よろしいですか？`,
  commandsWillBeCreatedFromThe: (homePath) => `「${homePath}」を初期テンプレートで作成します。`,
  commandsYourName: (value) => `自分: ${value}`,
  counterCountsTheResultsExampleList: "結果の件数をカウントする。例: LIST FROM \"{{taskFolder}}\" WHERE status != \"完了\"。{{taskFolder}} / {{meetingFolder}} / {{dailyFolder}} は 設定 → Deck のフォルダに置き換わります",
  counterDataviewListQuery: "Dataview LIST クエリ",
  counterDisplayTheNumberOfResults: "Dataviewクエリの結果件数を大きな数字で表示する。",
  counterItems: "件",
  counterItemsPieces: "件 / 個 / %",
  counterLabel: "ラベル",
  counterOpenTasks: "未完了タスク",
  counterTheDataviewPluginIsRequired: "Dataview プラグインが必要です。",
  counterUnit: "単位",
  dashboardAddWidget: "+ ウィジェット追加",
  dashboardChangeHeight2WrapsAfter: "高さ変更 (+2、最大16でループ)",
  dashboardChangeWidth468: "幅変更 (4→6→8→10→12→4)",
  dashboardDragToReorder: "ドラッグして並び替え",
  dashboardEdit: "編集",
  dashboardEditMode: "✎ 編集モード",
  dashboardMoveDown: "下へ",
  dashboardMoveUp: "上へ",
  dashboardNoWidgetsYetClickAdd: "ウィジェットがありません。「+ ウィジェット追加」から最初のひとつを追加してください。",
  dashboardRegenerateDefaults: "デフォルトで再生成",
  dashboardReload: "再読み込み",
  dashboardUnsupportedWidget: (type) => `未対応のウィジェット: ${type}`,
  dashboardViewMode: "✓ 閲覧モードへ",
  dataviewDataviewDqlOrJsTaskfolder: "Dataview の DQL or JS。{{taskFolder}} / {{meetingFolder}} / {{dailyFolder}} は 設定 → Deck のフォルダに置き換わります",
  dataviewDqlDataviewQueryLanguageJs: "DQL: Dataviewクエリ言語 / JS: DataviewJS",
  dataviewMode: "モード",
  dataviewQuery: "クエリ",
  dataviewRunADataviewDqlQuery: "Dataviewの DQL クエリを実行して結果を表示する。",
  dataviewTheDataviewPluginIsRequired: "Dataview プラグインが必要です。",
  ganttContainsNoEvents: (markwhenPath) => `${markwhenPath} にイベントがありません`,
  ganttDaysAfterToday: "表示期間: 今日より先 (日)",
  ganttDaysBeforeToday: "表示期間: 今日より前 (日)",
  ganttDaysPx: (value, value2, totalDays, dayWidth) => `${value} 〜 ${value2} (${totalDays}日 / ${dayWidth}px)`,
  ganttDefaultZoomUseTheAnd: "デフォルトズーム。実行中は + - ボタンでも変更可",
  ganttDueDateField: "(frontmatter) 期限フィールド",
  ganttEffortField: "(frontmatter) 工数フィールド",
  ganttExampleProjectsPlanMwLeave: "例: \"Projects/plan.mw\"。空なら 設定 → Deck の Markwhen ファイルを使います。",
  ganttFolderContainsNoTasksWith: (folder) => `フォルダ "${folder}" に期限を持つタスクがありません`,
  ganttGanttChartBuiltFromTask: "ガントチャート。タスクの frontmatter (期限+工数) か Markwhen (.mw) ファイルから自動生成。ズーム&期間シフト対応。",
  ganttGroupByField: "(frontmatter) グループ化フィールド",
  ganttHideCompletedTasks: "完了タスクを隠す",
  ganttMarkwhenFilePath: "Markwhen ファイルパス",
  ganttMarkwhenMwFile: "Markwhen (.mw) ファイル",
  ganttNext: "次へ »",
  ganttNoEventsInThisPeriod: (value, value2) => `この期間 (${value} 〜 ${value2}) にイベントなし。« 前へ / 次へ » で期間を動かすか、設定で期間日数を増やしてください。`,
  ganttPrevious: "« 前へ",
  ganttReset: "リセット",
  ganttRowHeightPx: "行の高さ (px)",
  ganttSource: "ソース",
  ganttStartDateFieldOptional: "(frontmatter) 開始フィールド (任意)",
  ganttTaskPropertiesDueDateEffort: "タスクのfrontmatter (期限/工数)",
  ganttTasks: "タスク",
  ganttTaskSourceFolder: "(frontmatter) ソースフォルダ",
  ganttToday: "今日",
  ganttWasNotFound: (markwhenPath) => `${markwhenPath} が見つかりません`,
  ganttWidthPerDayPx: "1日あたりの幅 (px)",
  gmailNoSubject: "(件名なし)",
  googleAuth1CreateAnOauth2: "1. Google Cloud Console で OAuth 2.0 Client (Desktop) を作成 → credential.json をダウンロード",
  googleAuth2AddTheCalendarApi: "2. 同意画面に Calendar API のスコープ (.../auth/calendar.readonly) を追加 + テストユーザーに自分を入れる",
  googleAuth3PasteItIntoThe: "3. 下の入力欄に貼り付け → 認証ボタン",
  googleAuthAuthenticationFailed: (message) => `認証失敗: ${message}`,
  googleAuthBothClientIdAndClient: "client_id と client_secret 両方必要です",
  googleAuthCredentialsJsonPaste: "credential.json (貼り付け)",
  googleAuthCredentialsSaved: "credential を保存しました",
  googleAuthGoogleCalendarAuthentication: "Google Calendar 認証",
  googleAuthPasteTheCompleteDownloadedJson: "ダウンロードしたJSONの中身全部、または客户端ID/secretだけ",
  googleAuthSaveCredentials: "credential 保存",
  googleAuthSaveCredentialsFirst: "先に credential を保存",
  googleAuthSignedOut: "サインアウトしました",
  googleAuthSignOut: "サインアウト",
  googleAuthStartAuthentication: "認証を開始",
  googleAuthStatusAuthenticated: "状態: ✅ 認証済み",
  googleAuthStatusNotAuthenticated: "状態: ❌ 未認証",
  googleCalendarAllDay: "終日",
  googleCalendarAuthenticationRequiredOpenTheCommand: "認証が必要です。コマンドパレット → 「Google Calendar: Authenticate」",
  googleCalendarCalendarId: "カレンダーID",
  googleCalendarDaysToDisplay: "表示日数",
  googleCalendarFetchEventsUsingTheGoogle: "Google Calendar API (OAuth) で予定を取得。プラグイン設定でcredentialと認証が必要。",
  googleCalendarLoading: "読み込み中…",
  googleCalendarMaximumEvents: "最大件数",
  googleCalendarNoEvents: "予定はありません 🎉",
  googleCalendarPrimaryYourMainCalendarA: "primary = メインカレンダー / Google CalendarのカレンダーID (xxx@group.calendar.google.com) も可",
  googleCalendarText: (value, value2, wd) => `${value}/${value2}（${wd}）`,
  googleCalendarToday: (label) => `今日 ${label}`,
  googleCalendarTomorrow: (label) => `明日 ${label}`,
  googleCalendarYesterday: (label) => `昨日 ${label}`,
  googleOAuthAuthenticationTimedOut5Minutes: "認証がタイムアウトしました (5分)。",
  googleOAuthConfigureOauthCredentialsFirst: "先にOAuth credentials を設定してください。",
  googleOAuthDoctypeHtmlHtmlHeadTitle: "<!doctype html><html><head><title>認証完了</title></head><body style=\"font-family:system-ui;padding:40px;text-align:center;\"><h1>✅ 認証完了</h1><p>このタブを閉じてObsidianに戻ってください。</p></body></html>",
  googleOAuthGoogleAuthenticationComplete: "✅ Google Calendar 認証完了",
  googleOAuthH1MissingAuthorizationCodeH1: "<h1>code がありません</h1>",
  googleOAuthH1OauthErrorH1P: (value) => `<h1>OAuth エラー</h1><p>${value}</p>`,
  googleOAuthH1StateMismatchH1: "<h1>state 不一致</h1>",
  googleOAuthNoRefreshTokenReturnedAdd: "refresh_token が返ってきません。Google Cloud Console で「OAuth 同意画面」のテストユーザーに自分を追加して再試行してください。",
  googleOAuthNotAuthenticatedAuthenticateFromThe: "認証されていません。コマンドパレットで認証してください。",
  googleOAuthOauthAuthenticationIsOnlySupported: "OAuth認証はデスクトップ版のみ対応です。",
  googleOAuthOauthCredentialsAreNotConfigured: "OAuth credentials が未設定です。",
  googleOAuthOpeningGoogleAuthenticationInYour: "ブラウザでGoogle認証を開きます…",
  icalHttp401AuthenticationRequiredUse: "HTTP 401 — 認証が必要。iCal URLはトークン埋め込み式の公開URLにしてください。",
  icalHttp403ForbiddenThisUrl: "HTTP 403 Forbidden — このURLは社内ネットワーク/VPN専用、もしくはトークンが失効している可能性。Googleカレンダーの「カレンダーの非公開URL（iCal形式）」推奨。",
  icalHttp404UrlNotFound: "HTTP 404 — URLが見つかりません。URLの再取得を。",
  icalNetworkError: (message) => `ネットワークエラー: ${message}`,
  kanbanCannotDelegateVaultPathUnavailable: "vaultパス取得失敗のためAI移譲をスキップ",
  kanbanCardFieldsCommaSeparated: "カードに表示するフィールド (カンマ区切り)",
  kanbanColumnsCommaSeparated: "列 (カンマ区切り)",
  kanbanEveryone: "全員",
  kanbanFileNotFound: (value) => `ファイルが見つかりません: ${value}`,
  kanbanFolderContainsNoNotesWith: (folder, statusField) => `フォルダ "${folder}" に frontmatter "${statusField}" を持つノートがありません`,
  kanbanFolderHoldingNotesWithA: (inheritFolderHint) => `frontmatterにstatusを持つノートが置かれているフォルダ。${inheritFolderHint}`,
  kanbanHideCompletedColumn: "完了列を隠す",
  kanbanKanbanTasks: "Kanban (タスク)",
  kanbanPropertyNamesFromTaskFrontmatter: "frontmatterのキー名",
  kanbanShowNotesAsKanbanCards: "フォルダ内のノートを frontmatter のステータス列でカンバン表示。カードをドラッグして状態変更。",
  kanbanSourceFolder: "ソースフォルダ",
  kanbanStatusPropertyName: "ステータスのfrontmatterキー名",
  kanbanStatusValuesInTheOrder: "statusに入りうる値。並び順=この順番",
  kanbanUpdateFailed: (message) => `更新失敗: ${message}`,
  mailAiReply: "🤖 AI返信",
  mailAiReplyFailed: (message) => `AI返信失敗: ${message}`,
  mailAllLabels: "全ラベル",
  mailArchive: "🗄 アーカイブ",
  mailArchived: "アーカイブしました",
  mailAssistAnthropicApiKeyIsNot: "Anthropic API キーが未設定です（設定で backend を claude-code にするか、キーを設定）",
  mailAssistBaseTheReplyOnThe: "過去資料に書かれた背景・経緯・決定事項を踏まえて返信を書くこと。資料に無い事実を創作しないこと。\n\n",
  mailAssistEmailThread: "# メールスレッド\n",
  mailAssistNoRelevantBackgroundNotesFound: "(関連する過去資料は見つかりませんでした)",
  mailAssistOutputFormatSummaryBulletsReply: (DELIM) => `出力フォーマット:
## 要約
(箇条書き)

${DELIM}
(返信本文。宛名から始め、署名は不要)

`,
  mailAssistRelatedVaultNotes: "\n\n# vault内の関連資料\n",
  mailAssistReplyDraft: "=== 返信ドラフト ===",
  mailAssistWrite1ASummaryOf: "(1) スレッドの要約 と (2) 適切な返信ドラフト を作成してください。\n",
  mailAssistYouAreABusinessEmail: "あなたは日本語ビジネスメールのアシスタントです。以下のメールスレッドと、vault内の関連する過去資料(議事録/ナレッジ)を読み、",
  mailAttachment: "📎 添付: ",
  mailCompactGmailMessageListClick: "Gmail の受信一覧をコンパクト表示。クリックでメールペインを開く。OAuth(gmail)認証が必要。",
  mailCompose: "✏ 新規作成",
  mailCompose2: "✏ 作成",
  mailComposeAiSummaryAndSourcesNot: "🤖 AI要約・参照（このメールには含まれません）",
  mailComposeCancel: "キャンセル",
  mailComposeCompose: "新規作成",
  mailComposeCreatingDraft: "下書き作成中…",
  mailComposeDraftCreatedOpenItIn: (url) => `下書きを作成しました。Gmail のドラフトを開いてください: ${url}`,
  mailComposeEnterARecipientTo: "宛先(To)が未入力です",
  mailComposeFailedToCreateDraft: (message) => `下書き作成失敗: ${message}`,
  mailComposeForward: "転送",
  mailComposeMessage: "本文…",
  mailComposeMessageBodyIsEmpty: "本文が空です",
  mailComposeOpenedTheGmailDraftReview: "Gmail の下書きを開きました。内容を確認して送信してください。",
  mailComposeReply: "返信",
  mailComposeReviewAndSendInGmail: "📤 Gmailで確認して送信",
  mailComposeSubject: "件名",
  mailFailed: (message) => `失敗: ${message}`,
  mailFailedToRetrieveAttachment: (message) => `添付取得失敗: ${message}`,
  mailForward: "↪ 転送",
  mailGeneratingAiReplyThreadSummary: "AI返信ドラフト生成中…（スレッド要約＋vault背景）",
  mailGmailAuthenticationRequiredGoTo: "Gmail の認証が必要です。設定 → Deck → 「再認証」を実行してください。",
  mailGmailAuthenticationRequiredSettingsDeck: "Gmail 認証が必要です（設定 → Deck → 再認証）。",
  mailGmailSearchSyntaxExamplesIn: "Gmail 検索構文。例: in:inbox / is:unread / from:boss@x.com",
  mailLoading: "読み込み中…",
  mailMail: "メール",
  mailMailGmail: "メール (Gmail)",
  mailMessageLimit: "表示件数",
  mailMovedToTrash: "ゴミ箱へ移動しました",
  mailNoMail: "メールはありません 🎉",
  mailNoMail2: "メールなし 🎉",
  mailRefresh: "⟳ 更新",
  mailReply: "↩ 返信",
  mailSearchPressEnter: "🔍 検索（Enterで実行）",
  mailSearchQuery: "検索クエリ",
  mailSources: (value) => `参照: ${value}`,
  mailSourcesNone: "参照: なし",
  mailTrash: "🗑 ゴミ箱",
  mainAiDelegationNoActiveSessions: "AI移譲: アクティブなセッションなし",
  mainAiDelegationRunningTotalItems: (count, total) => `AI移譲: 実行中 ${count}件 / 合計 ${total}件`,
  mainAiDelegationSessions: "AI移譲セッション",
  mainAiItems: (icon, total) => `${icon} AI ${total}件`,
  mainAiRunning: (icon, count) => `${icon} AI ${count}実行中`,
  mainOpenMail: "メールを開く",
  markdownAFreeformMarkdownNoteWith: "自由メモ。Markdown記法で書ける。リンクや見出しも使える。",
  markdownContent: "内容",
  markdownNotesWriteHereUseNote: "# メモ\n\nここに自由に書ける。`[[ノート名]]` でリンクも貼れる。",
  noteEmbedMaximumLines: "最大行数",
  noteEmbedMaximumNumberOfLinesShown: "プレビューに表示する最大行数",
  noteEmbedNoNotePathConfiguredChoose: "ノートパスが未設定です。設定から指定してください。",
  noteEmbedNoteNotFound: (notePath) => `ノートが見つかりません: ${notePath}`,
  noteEmbedNotePath: "ノートパス",
  noteEmbedPathRelativeToTheVault: "vaultルートからの相対パス (例: 自分について.md)",
  noteEmbedPreviewANoteFromYour: "任意のノートをプレビュー表示する。",
  sheetsSyncAssignedTaskIdToTasks: (newIds) => `task_id を ${newIds} 件付与`,
  sheetsSyncGoogleSheetIsBeingCreated: (scope) => `${scope} のGoogle Sheetsを作成中…`,
  sheetsSyncObsidianTasksOrganization: "Obsidian Tasks (組織)",
  sheetsSyncObsidianTasksPersonal: "Obsidian Tasks (個人)",
  sheetsSyncOwnerCanTBeUsed: (value) => `担当「${value}」はフォルダ名として使えないため、未割当に入れました。`,
  sheetsSyncPullFailed: (id, message) => `pull失敗 ${id}: ${message}`,
  sheetsSyncSelfOwnerIsNotSet: "self_owner が未設定です。設定 → Deck で自分のフォルダ名を入れてから組織シートを同期してください。",
  sheetsSyncSheetCreated: (scope, spreadsheetUrl) => `✅ ${scope} スプシ作成完了: ${spreadsheetUrl}`,
  sheetsSyncSheetIsAlreadyConfigured: (scope, spreadsheetUrl) => `${scope} スプシは既に設定済み: ${spreadsheetUrl}`,
  sheetsSyncSheetIsNotConfiguredRun: (scope, scope2) => `${scope} スプシ未設定。'Sheets Sync: Setup ${scope2}' を先に実行してください。`,
  sheetsSyncSyncIsAlreadyRunningPlease: "既に同期中です。完了をお待ちください。",
  sheetsSyncTaskFromSheetsSeeThe: (heading) => `# ${heading}

Sheets発のタスク。詳細はSheets側を参照。
`,
  sheetsSyncTitleIsEmpty: "タイトルが空",
  syncSettingsAiBackend: "AIバックエンド",
  syncSettingsAiReplyReferenceFoldersComma: "AI返信の参照フォルダ (カンマ区切り)",
  syncSettingsAuthenticate: "認証する",
  syncSettingsAuthenticated: "✅ 認証済み",
  syncSettingsAuthenticationStatus: "認証状態",
  syncSettingsAutomaticSynchronization: "自動同期",
  syncSettingsAutoSyncTakesEffectAfter: (value) => `自動同期 ${value}（次回プラグイン再読み込みで有効化）`,
  syncSettingsClaudeCodeClaudePSubscription: "claude-code = `claude -p`（サブスク・APIキー不要）/ api = Anthropic API",
  syncSettingsCreateSpreadsheet: "Sheetsを作成",
  syncSettingsDefaultEmailFilterExamplesIn: "一覧の既定の絞り込み。例: in:inbox / is:unread",
  syncSettingsDisconnect: "接続解除",
  syncSettingsDisconnect2: "解除",
  syncSettingsDisconnected: (title) => `${title} の接続を解除しました`,
  syncSettingsEditingAMdInThe: "タスクのフォルダの .md を更新すると 2秒のデバウンス後に自動同期します。変更を反映するにはプラグインを再読み込みしてください。",
  syncSettingsExampleYamada: "例: yamada",
  syncSettingsFolderNameForYourPersonal: "個人スコープが対象とするフォルダ名。<タスクのフォルダ>/{この名前}/*.md が個人タスク扱い。組織シートの同期には必須",
  syncSettingsGoogleAuthentication: "Google 認証",
  syncSettingsInboxQuery: "受信クエリ",
  syncSettingsLastSync: "最終同期",
  syncSettingsMailGmail: "メール (Gmail)",
  syncSettingsManualSynchronization: "手動同期 (まとめて)",
  syncSettingsMessageLimit: "表示件数",
  syncSettingsNeverSynced: "未同期",
  syncSettingsNotAuthenticatedAuthenticateFirst: "❌ 未認証 — まず認証してください",
  syncSettingsNotConfiguredANewSpreadsheet: "未設定 — 新規スプシを自動作成します",
  syncSettingsOpenInBrowser: "ブラウザで開く",
  syncSettingsOrganizationPushPull: (pushed, pulled) => `組織 push:${pushed} pull:${pulled}`,
  syncSettingsOrganizationTasks: "組織タスク",
  syncSettingsPersonalPushPull: (pushed, pulled) => `個人 push:${pushed} pull:${pulled}`,
  syncSettingsPersonalTasks: "個人タスク",
  syncSettingsReauthenticateOpenSettings: "再認証 / 設定を開く",
  syncSettingsRemovesThisVaultSConnection: "vault側の設定だけ削除。Sheets本体は残ります。",
  syncSettingsSetupFailed: (message) => `Setup失敗: ${message}`,
  syncSettingsSpreadsheetUrl: "スプシURL",
  syncSettingsSyncAll: "全部同期",
  syncSettingsSyncAutomaticallyWhenTaskFiles: "ファイル変更時に自動同期",
  syncSettingsSyncBothScopes: "両スコープを同期",
  syncSettingsSyncComplete: (value) => `同期完了: ${value}`,
  syncSettingsSyncCompletePushPull: (title, pushed, pulled) => `${title} 同期完了: push ${pushed} / pull ${pulled}`,
  syncSettingsSyncFailed: (message) => `同期失敗: ${message}`,
  syncSettingsSyncNow: "今すぐ同期",
  syncSettingsSyncPersonalAndOrganizationTasks: "個人と組織の両方を実行します。両方setup済みでないと一部スキップ。",
  syncSettingsUrlUnavailable: "(URL不明)",
  syncSettingsVaultFoldersUsedAsBackground: "返信ドラフト生成時に過去背景として参照する vault フォルダ。空 = vault 全体。例: Meetings, Notes",
  syncSettingsYourName: "自分の名前",
  taskCreatorAdded: (title) => `✅ 追加: ${title}`,
  taskCreatorAddTask: "＋ タスク追加",
  taskCreatorCreateATaskNoteWith: "フォームから frontmatter付きタスクノートを作成する。Kanban/Ganttに即反映。",
  taskCreatorDefaultEffort: "デフォルト 工数",
  taskCreatorDefaultLabel: "デフォルト ラベル",
  taskCreatorDefaultPriority: "デフォルト 優先度",
  taskCreatorDefaultProject: "デフォルト PJT",
  taskCreatorDefaultStatus: "デフォルト status",
  taskCreatorDestinationFolder: "保存先フォルダ",
  taskCreatorDue: "期限",
  taskCreatorEffort: "工数",
  taskCreatorEnterATaskName: "タスク名を入力してください",
  taskCreatorLabel: "ラベル",
  taskCreatorOrPressEnter: "⌘+Enter でも追加",
  taskCreatorPriority: "優先度",
  taskCreatorProjectName: "PJT名",
  taskCreatorTaskCreatorNewTask: "Task Creator (新規タスク追加)",
  taskCreatorTaskNameEGPrepare: "タスク名 (例: 作成 提案スライド)",
  taskCreatorWritingDesign: "作成/設計...",
  taskCreatorYyyyMmDdOrNone: "YYYY-MM-DD or なし",
  todayCreateTodaySNote: "📝 今日の日報を作成",
  todayDailyNotePathFormat: "日報ファイルパス形式",
  todayDailyNotesFolder: "日報フォルダ",
  todayExampleGoodMorningHaveA: "例: おはよう / 今日もいい一日を",
  todayGreetingOptional: "挨拶 (任意)",
  todayMatchYourVaultSNaming: "vaultの命名規則に合わせる（コアのデイリーノートの設定を使うときは、その日付形式が優先されます）",
  todayOpenTodaySNote: "📝 今日の日報を開く",
  todayMonth: (value) => `${value}月`,
  todayTodayDate: "Today (日付)",
  todayTodaySDateAndWeekday: "今日の日付・曜日を大きく表示 + 日報ノートへのクイックリンク。",
};

export function getStrings(locale: string): Strings {
  return locale.toLowerCase().startsWith("ja") ? ja : en;
}

/** Strings for the locale Obsidian is currently running in. */
export function t(): Strings {
  return getStrings(moment.locale());
}
