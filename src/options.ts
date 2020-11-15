import * as core from '@actions/core'
import * as process from 'process'

export interface Author {
  name: string
  email: string
}

export interface Options {
  valueFile: string
  propertyPath: string
  value: string | number | boolean
  token: string
  branch: string
  targetBranch: string
  createPR: boolean
  message: string
  author: Author
}

export class GitHubOptions {
  get valueFile(): string {
    return core.getInput('valueFile')
  }

  get propertyPath(): string {
    return core.getInput('propertyPath')
  }

  get value(): string {
    return core.getInput('value')
  }

  get branch(): string {
    return core.getInput('branch')
  }

  get targetBranch(): string {
    return core.getInput('targetBranch')
  }

  get createPR(): boolean {
    return core.getInput('createPR') === 'true'
  }

  get token(): string {
    return core.getInput('token')
  }

  get message(): string {
    return core.getInput('message')
  }

  get author(): Author {
    return {
      name: core.getInput('author_name'),
      email: core.getInput('author_email')
    }
  }
}

export class EnvOptions {
  get valueFile(): string {
    return process.env.VALUE_FILE || ''
  }

  get propertyPath(): string {
    return process.env.VALUE_PATH || ''
  }

  get value(): string {
    return process.env.VALUE || ''
  }

  get branch(): string {
    return process.env.BRANCH || ''
  }

  get targetBranch(): string {
    return process.env.TARGET_BRANCH || ''
  }

  get token(): string {
    return process.env.TOKEN || ''
  }

  get createPR(): boolean {
    return process.env.CREATE_PR === 'true'
  }

  get message(): string {
    return process.env.MESSAGE || ''
  }

  get author(): Author {
    return {
      name: process.env.AUTHOR_NAME || '',
      email: process.env.AUTHOR_EMAIL || ''
    }
  }
}
