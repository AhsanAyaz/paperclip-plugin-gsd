export const PLUGIN_ID = "paperclip.gsd";
export const PLUGIN_VERSION = "0.1.0";

export const SLOT_IDS = {
  DASHBOARD_WIDGET: "gsd-overview",
  PROJECT_TAB: "gsd-project-tab",
  ISSUE_TAB: "gsd-issue-tab",
  SYNC_BUTTON: "gsd-sync-btn",
  SETTINGS_PAGE: "gsd-settings",
} as const;

export const EXPORT_NAMES = {
  DASHBOARD_WIDGET: "GsdDashboardWidget",
  PROJECT_TAB: "GsdProjectTab",
  ISSUE_TAB: "GsdIssueTab",
  SYNC_BUTTON: "GsdSyncButton",
  SETTINGS_PAGE: "GsdSettingsPage",
} as const;

export const DATA_KEYS = {
  OVERVIEW: "gsd-overview",
  PROJECT_DETAIL: "gsd-project-detail",
  ISSUE_PHASE: "gsd-issue-phase",
  ADAPTER_COMPAT: "gsd-adapter-compat",
  CONFIG: "gsd-config",
} as const;

export const ACTION_KEYS = {
  SYNC_PROJECT: "sync-project",
  SYNC_ALL: "sync-all",
  LINK_PHASE: "link-phase",
  UPDATE_CONFIG: "update-config",
} as const;
