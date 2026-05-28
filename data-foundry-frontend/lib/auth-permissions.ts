export type UserRole = "DATA_BA" | "DATA_ENGINEER" | "BUSINESS_EXPERT" | "ADMIN";

export type UserStatus = "ACTIVE" | "DISABLED";

export type PermissionUser = {
  account: string;
  name: string;
  status: UserStatus;
  role: UserRole;
};

export const ROLE_LABEL: Record<UserRole, string> = {
  DATA_BA: "数据BA",
  DATA_ENGINEER: "数据工程师",
  BUSINESS_EXPERT: "业务专家",
  ADMIN: "管理员",
};

export const STATUS_LABEL: Record<UserStatus, string> = {
  ACTIVE: "启用",
  DISABLED: "停用",
};

const STORAGE_KEYS = {
  authToken: "dataFoundry.auth.token.v1",
  currentUser: "dataFoundry.auth.currentUser.v1",
} as const;

const AUTH_CHANGED_EVENT = "datafoundry:auth-changed";

export function subscribePermissionsChanged(listener: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handler = () => listener();
  window.addEventListener(AUTH_CHANGED_EVENT, handler);
  window.addEventListener("storage", handler);

  return () => {
    window.removeEventListener(AUTH_CHANGED_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

export function notifyPermissionsChanged() {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

export function loadAuthToken(): string {
  if (typeof window === "undefined") {
    return "";
  }
  return window.localStorage.getItem(STORAGE_KEYS.authToken) || "";
}

export function saveAuthToken(token: string) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEYS.authToken, token);
  notifyPermissionsChanged();
}

export function loadStoredCurrentUser(): PermissionUser | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.currentUser);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<PermissionUser> | null;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    if (!parsed.account || !parsed.name || !parsed.role || !parsed.status) {
      return null;
    }
    return {
      account: parsed.account,
      name: parsed.name,
      role: parsed.role,
      status: parsed.status,
    };
  } catch {
    return null;
  }
}

export function saveStoredCurrentUser(user: PermissionUser | null) {
  if (typeof window === "undefined") {
    return;
  }
  if (!user) {
    window.localStorage.removeItem(STORAGE_KEYS.currentUser);
  } else {
    window.localStorage.setItem(STORAGE_KEYS.currentUser, JSON.stringify(user));
  }
  notifyPermissionsChanged();
}

export function clearAuthSession() {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(STORAGE_KEYS.authToken);
  window.localStorage.removeItem(STORAGE_KEYS.currentUser);
  notifyPermissionsChanged();
}

export function getCurrentUser(): PermissionUser | null {
  return loadStoredCurrentUser();
}

export function canViewCollectionTasks(role: UserRole) {
  return role === "DATA_ENGINEER" || role === "ADMIN";
}

export function isAdminRole(role: UserRole | null | undefined) {
  return role === "ADMIN";
}
