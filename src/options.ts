import * as core from '@actions/core'
import * as process from 'process'

export interface Options {
  valueFile: string
  propertyPath: string
  value: string | number | boolean
  token: string
  commitChange: boolean
  branch: string
  message: string
  targetBranch: string
  repository: string
  createPR: boolean
  workDir: string
}

export class GitHubOptions implements Options {
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

  get commitChange(): boolean {
    return core.getInput('commitChange') === 'true'
  }

  get targetBranch(): string {
    return core.getInput('targetBranch')
  }

  get repository(): string {
    return core.getInput('repository')
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

  get workDir(): string {
    return core.getInput('workDir')
  }
}

export class EnvOptions implements Options {
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

  get commitChange(): boolean {
    return process.env.COMMIT_CHANGE === 'true'
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

  get repository(): string {
    return process.env.REPOSITORY || ''
  }

  get workDir(): string {
    return process.env.WORK_DIR || '.'
  }
}
