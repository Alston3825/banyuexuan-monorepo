import type { PermissionPoint, PermissionTreeNode } from '../api/types/permission'

export function buildPermissionTree(flat: PermissionPoint[]): PermissionTreeNode[] {
  const byId = new Map<string, PermissionTreeNode>(flat.map((p) => [p.id, { ...p, children: [] }]))
  const roots: PermissionTreeNode[] = []
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}
