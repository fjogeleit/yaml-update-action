import * as core from '@actions/core'
import * as process from 'process'
import {convertValue, parseChanges} from './helper'
import {Committer, Changes, Method, Format} from './types'

export interface Options {
  valueFile: string
  propertyPath: string
  value: string
  token: string
  commitChange: boolean
  updateFile: boolean
  branch: string
  masterBranchName: string
  message: string
  title: string
  description: string
  labels: string[]
  reviewers: string[]
  teamReviewers: string[]
  assignees: string[]
  targetBranch: string
  repository: string
  githubAPI: string
  createPR: boolean
  workDir: string
  committer: Committer
  changes: Changes
  format: Format
  method: Method
  noCompatMode: boolean
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
    return core.getBooleanInput('commitChange')
  }

  get updateFile(): boolean {
    return core.getBooleanInput('updateFile')
  }

  get targetBranch(): string {
    return core.getInput('targetBranch')
  }

  get repository(): string {
    return core.getInput('repository')
  }

  get githubAPI(): string {
    return core.getInput('githubAPI')
  }

  get createPR(): boolean {
    return core.getBooleanInput('createPR')
  }

  get noCompatMode(): boolean {
    return core.getBooleanInput('noCompatMode')
  }

  get token(): string {
    return core.getInput('token')
  }

  get message(): string {
    return core.getInput('message')
  }

  get title(): string {
    return core.getInput('title')
  }

  get description(): string {
    return core.getInput('description')
  }

  get labels(): string[] {
    if (!core.getInput('labels')) return []

    return core
      .getInput('labels')
      .split(',')
      .map(label => label.trim())
      .filter(label => !!label)
  }

  get reviewers(): string[] {
    if (!core.getInput('reviewers')) return []

    return core
      .getInput('reviewers')
      .split(',')
      .map(value => value.trim())
      .filter(value => !!value)
  }

  get teamReviewers(): string[] {
    if (!core.getInput('teamReviewers')) return []

    return core
      .getInput('teamReviewers')
      .split(',')
      .map(value => value.trim())
      .filter(value => !!value)
  }

  get assignees(): string[] {
    if (!core.getInput('assignees')) return []

    return core
      .getInput('assignees')
      .split(',')
      .map(value => value.trim())
      .filter(value => !!value)
  }

  get workDir(): string {
    return core.getInput('workDir')
  }

  get masterBranchName(): string {
    return core.getInput('masterBranchName')
  }

  get committer(): Committer {
    return {
      name: core.getInput('commitUserName'),
      email: core.getInput('commitUserEmail')
    }
  }

  get changes(): Changes {
    let changes: Changes = {}
    if (this.valueFile && this.propertyPath) {
      let value: string | number | boolean = this.value

      try {
        value = convertValue(value)
      } catch {
        core.warning(`exception while trying to convert value '${this.value}'`)
      }

      changes[this.valueFile] = {
        [this.propertyPath]: value
      }
    }

    changes = parseChanges(changes, this.valueFile, core.getInput('changes'))
    if (Object.keys(changes).length === 0) {
      core.setFailed('No changes to update detected')
    }

    return changes
  }

  get method(): Method {
    const method = (core.getInput('method') || '').toLowerCase() as Method

    if ([Method.CreateOrUpdate, Method.Create, Method.Update].includes(method)) {
      return method
    }

    return Method.CreateOrUpdate
  }

  get format(): Format {
    const format = (core.getInput('format') || '').toLowerCase() as Format

    if ([Format.YAML, Format.JSON, Format.UNKNOWN].includes(format)) {
      return format
    }

    return Format.UNKNOWN
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

  get masterBranchName(): string {
    return process.env.MASTER_BRANCH_NAME || ''
  }

  get commitChange(): boolean {
    return process.env.COMMIT_CHANGE === 'true'
  }

  get updateFile(): boolean {
    return process.env.UPDATE_FILE === 'true'
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

  get noCompatMode(): boolean {
    return process.env.NO_COMPAT_MODE === 'true'
  }

  get message(): string {
    return process.env.MESSAGE || ''
  }

  get title(): string {
    return process.env.TITLE || ''
  }

  get description(): string {
    return process.env.DESCRIPTION || ''
  }

  get labels(): string[] {
    return (process.env.LABELS || '')
      .split(',')
      .map(label => label.trim())
      .filter(label => !!label)
  }

  get reviewers(): string[] {
    return (process.env.REVIEWERS || '')
      .split(',')
      .map(label => label.trim())
      .filter(label => !!label)
  }

  get teamReviewers(): string[] {
    return (process.env.TEAM_REVIEWERS || '')
      .split(',')
      .map(label => label.trim())
      .filter(label => !!label)
  }

  get assignees(): string[] {
    return (process.env.ASSIGNEES || '')
      .split(',')
      .map(label => label.trim())
      .filter(label => !!label)
  }

  get repository(): string {
    return process.env.REPOSITORY || ''
  }

  get githubAPI(): string {
    return process.env.GITHUB_API || 'https://api.github.com'
  }

  get workDir(): string {
    return process.env.WORK_DIR || '.'
  }

  get committer(): Committer {
    return {
      name: process.env.COMMIT_USER_NAME || '',
      email: process.env.COMMIT_USER_EMAIL || ''
    }
  }

  get changes(): Changes {
    const changes: Changes = {}
    if (this.valueFile && this.propertyPath) {
      let value: string | number | boolean = this.value

      try {
        value = convertValue(value)
      } catch {
        core.warning(`exception while trying to convert value '${this.value}'`)
      }

      changes[this.valueFile] = {
        [this.propertyPath]: value
      }
    }

    return parseChanges(changes, this.valueFile, process.env.CHANGES || '')
  }

  get method(): Method {
    const method = (process.env.METHOD || '').toLowerCase() as Method

    if ([Method.CreateOrUpdate, Method.Create, Method.Update].includes(method)) {
      return process.env.METHOD as Method
    }

    return Method.CreateOrUpdate
  }

  get format(): Format {
    const format = (process.env.FORMAT || '').toLowerCase() as Format

    if ([Format.YAML, Format.JSON, Format.UNKNOWN].includes(format)) {
      return format
    }

    return Format.UNKNOWN
  }
}
