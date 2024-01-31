export type Committer = {
  name: string
  email: string
}

export type ContentNode = {
  [key: string]: string | number | boolean | ContentNode | ContentNode[]
}

export type ValueUpdates = {
  [propertyPath: string]: string | number | boolean
}

export type Changes = {
  [filepath: string]: ValueUpdates
}

export type ChangedFile = {
  absolutePath: string
  relativePath: string
  content: string
  json: ContentNode
  sha?: string
}

export enum Method {
  CreateOrUpdate = 'createorupdate',
  Update = 'update',
  Create = 'create'
}

export enum Format {
  YAML = 'yaml',
  JSON = 'json',
  UNKNOWN = ''
}

export type QuotingType = '"' | "'"

export type FormatParser = {
  convert<T extends ContentNode>(filePath: string): T
  dump<T extends ContentNode>(
    content: T,
    options?: {
      [key: string]: undefined | string | boolean | number | QuotingType
    }
  ): string
}
