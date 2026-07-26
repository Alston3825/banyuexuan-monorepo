export interface LoginResponse {
  accessToken: string
  refreshToken: string
  account: { id: string; username: string; realName: string }
}

export interface RefreshResponse {
  accessToken: string
  refreshToken: string
}
