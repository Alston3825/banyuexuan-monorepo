/** 占位共享类型，验证 npm workspaces 内跨包引用可用；后续按领域模型陆续补充。 */
export interface HealthCheckResult {
  status: 'ok' | 'error'
  service: string
  time: string
}
