import { builder } from '../builder'

export class PageInfo extends builder.objectType() {
  hasNextPage!: boolean
  hasPreviousPage!: boolean
  startCursor!: string | null
  endCursor!: string | null
}

export function encodeCursor(data: string): string {
  return Buffer.from(data).toString('base64url')
}

export function decodeCursor(cursor: string): string {
  return Buffer.from(cursor, 'base64url').toString('utf-8')
}

export interface Edge<Node> {
  node: Node
  cursor: string
}

export interface Connection<Node> {
  edges: Edge<Node>[]
  pageInfo: PageInfo
  totalCount: number
}
