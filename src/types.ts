export type Committer = {
  name: string
  email: string
}

export type YamlNode = {
  [key: string]: string | number | boolean | YamlNode | YamlNode[]
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
  json: YamlNode
  sha?: string
}

export enum Method {
  CreateOrUpdate = 'createorupdate',
  Update = 'update',
  Create = 'create'
}
