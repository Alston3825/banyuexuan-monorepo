export interface LoginResponse {
  accessToken: string
  refreshToken: string
  account: { id: string; username: string; realName: string; uiTheme?: string | null }
  /** 该账号拥有的权限点code列表，用来决定导航菜单显示哪些模块，见 layouts/nav-menu.ts */
  permissions: string[]
}

export interface RefreshResponse {
  accessToken: string
  refreshToken: string
  permissions: string[]
}
