import YAML from 'js-yaml'
import fs from 'fs'
import path from 'path'
import jp from 'jsonpath'
import { Options } from './options'
import { formatGuesser, formatParser } from './parser'
import { Octokit } from '@octokit/rest'
import { Actions, EmptyActions } from './github-actions'
import {
  createBlobForFile,
  createNewCommit,
  createNewTree,
  currentCommit,
  repositoryInformation,
  updateBranch
} from './git-commands'
import {
  ChangedFile,
  Committer,
  Format,
  Method,
  ValueUpdates,
  ContentNode
} from './types'

const APPEND_ARRAY_EXPRESSION = '[(@.length)]'

export async function run(options: Options, actions: Actions): Promise<void> {
  if (options.updateFile === true) {
    actions.info(
      'updateFile is deprected, the updated content will be written to the file by default from now on'
    )
  }

  try {
    const files: ChangedFile[] = []

    for (const [file, values] of Object.entries(options.changes)) {
      const changedFile = processFile(file, values, options, actions)

      if (changedFile) {
        writeTo(changedFile.content, changedFile.absolutePath, actions)
        files.push(changedFile)
      }
    }

    actions.debug(`files: ${JSON.stringify(files)}`)

    if (options.commitChange === false || files.length === 0) {
      return
    }

    const octokit = new Octokit({
      auth: options.token,
      baseUrl: options.githubAPI
    })

    await gitProcessing(
      options.repository,
      options.branch,
      options.force,
      options.masterBranchName,
      files,
      options.message,
      octokit,
      actions,
      options.committer
    )

    if (options.createPR) {
      await createPullRequest(
        options.repository,
        options.branch,
        options.targetBranch,
        options.labels,
        options.title || `Merge: ${options.message}`,
        options.description,
        options.reviewers,
        options.teamReviewers,
        options.assignees,
        octokit,
        actions
      )
    }
  } catch (error) {
    const msg = (error as Error).toString()
    if (msg.includes('pull request already exists')) {
      actions.info('Pull Request already exists')
      return
    }

    actions.setFailed(`failed to create PR: ${msg}`)
  }
}

export async function runTest<T extends ContentNode>(
  options: Options
): Promise<(ChangedFile & { json: T })[]> {
  const files: ChangedFile[] = []

  for (const [file, values] of Object.entries(options.changes)) {
    const changedFile = processFile(file, values, options, new EmptyActions())
    if (changedFile) {
      files.push(changedFile)
    }
  }

  return files as (ChangedFile & { json: T })[]
}

export function replace<T extends ContentNode>(
  value: string | number | boolean | unknown[],
  jsonPath: string,
  content: ContentNode,
  method: Method
): T {
  const copy = JSON.parse(JSON.stringify(content))

  if (!jsonPath.startsWith('$')) {
    jsonPath = `$.${jsonPath}`
  }

  if (method === Method.Update && pathNotExists(copy, jsonPath)) {
    return content as T
  }

  if (method === Method.Create && !pathNotExists(copy, jsonPath)) {
    return content as T
  }

  if (
    [Method.CreateOrUpdate, Method.Create].includes(method) &&
    isAppendArrayNode(content, jsonPath)
  ) {
    jsonPath = jsonPath.replace(APPEND_ARRAY_EXPRESSION, '')
    const parent: unknown[] = jp.value(copy, jsonPath)

    parent.push(value)
    value = parent
  }

  jp.value(copy, jsonPath, value)

  return copy
}

export function writeTo(
  content: string,
  filePath: string,
  actions: Actions
): void {
  fs.writeFile(filePath, content, err => {
    if (!err) return

    actions.warning(err.message)
  })
}

export async function gitProcessing(
  repository: string,
  branch: string,
  force: boolean,
  masterBranchName: string,
  files: ChangedFile[],
  commitMessage: string,
  octokit: Octokit,
  actions: Actions,
  committer: Committer
): Promise<void> {
  const { owner, repo } = repositoryInformation(repository)
  const { commitSha, treeSha } = await currentCommit(
    octokit,
    owner,
    repo,
    branch,
    masterBranchName
  )

  actions.debug(JSON.stringify({ baseCommit: commitSha, baseTree: treeSha }))
  const debugFiles: { [file: string]: string } = {}

  for (const file of files) {
    file.sha = await createBlobForFile(octokit, owner, repo, file)
    debugFiles[file.relativePath] = file.sha
  }

  actions.debug(JSON.stringify(debugFiles))

  const newTreeSha = await createNewTree(octokit, owner, repo, files, treeSha)

  actions.debug(JSON.stringify({ createdTree: newTreeSha }))

  const newCommitSha = await createNewCommit(
    octokit,
    owner,
    repo,
    commitMessage,
    newTreeSha,
    commitSha,
    committer
  )

  actions.debug(JSON.stringify({ createdCommit: newCommitSha }))
  actions.setOutput('commit', newCommitSha)

  await updateBranch(octokit, owner, repo, branch, force, newCommitSha, actions)

  actions.debug(`Complete`)
}

export async function createPullRequest(
  repository: string,
  branch: string,
  targetBranch: string,
  labels: string[],
  title: string,
  description: string,
  reviewers: string[],
  teamReviewers: string[],
  assignees: string[],
  octokit: Octokit,
  actions: Actions
): Promise<void> {
  const { owner, repo } = repositoryInformation(repository)

  const response = await octokit.pulls.create({
    owner,
    repo,
    title,
    head: branch,
    base: targetBranch,
    body: description
  })

  actions.debug(`Create PR: #${response.data.id}`)

  actions.setOutput('pull_request', JSON.stringify(response.data))

  octokit.issues.addLabels({
    owner,
    repo,
    issue_number: response.data.number,
    labels
  })

  if (assignees.length) {
    octokit.issues.addAssignees({
      owner,
      repo,
      issue_number: response.data.number,
      assignees
    })

    actions.debug(`Add Assignees: ${assignees.join(', ')}`)
  }

  if (reviewers.length || teamReviewers.length) {
    octokit.pulls.requestReviewers({
      owner,
      repo,
      pull_number: response.data.number,
      reviewers,
      team_reviewers: teamReviewers
    })

    actions.debug(
      `Add Reviewers: ${[...reviewers, ...teamReviewers].join(', ')}`
    )
  }

  actions.debug(`Add Label: ${labels.join(', ')}`)
}

export const convertValue = (value: string): string | number | boolean => {
  if (!value.startsWith('!!')) {
    return value
  }

  const result = YAML.load(`- ${value}`) as [string | number | boolean]

  return result[0]
}

export function processFile(
  file: string,
  values: ValueUpdates,
  options: Options,
  actions: Actions
): ChangedFile | null {
  const filePath = path.join(process.cwd(), options.workDir, file)

  actions.debug(
    `FilePath: ${filePath}, Parameter: ${JSON.stringify({ cwd: process.cwd(), workDir: options.workDir, valueFile: file })}`
  )

  const format = determineFinalFormat(filePath, options.format, actions) as
    | Format.JSON
    | Format.YAML

  const parser = formatParser[format]

  let contentNode = parser.convert(filePath)
  let contentString = parser.dump(contentNode, {
    noCompatMode: options.noCompatMode,
    quotingType: options.quotingType
  })

  const initContent = contentString

  actions.debug(`Parsed JSON: ${JSON.stringify(contentNode)}`)

  for (const [propertyPath, value] of Object.entries(values)) {
    contentNode = replace(value, propertyPath, contentNode, options.method)
    contentString = parser.dump(contentNode, {
      noCompatMode: options.noCompatMode,
      quotingType: options.quotingType
    })
  }

  actions.debug(`Generated updated ${format.toUpperCase()}
    
  ${contentString}
  `)

  // if nothing changed, do not commit, do not create PR's, skip the rest of the workflow
  if (initContent === contentString) {
    actions.debug(`Nothing changed, skipping rest of the workflow.`)
    return null
  }

  return {
    relativePath: file,
    absolutePath: filePath,
    content: contentString,
    json: contentNode
  }
}

const pathNotExists = (content: ContentNode, jsonPath: string): boolean => {
  return (
    jp.paths(content, jsonPath) && jp.value(content, jsonPath) === undefined
  )
}

const isAppendArrayNode = (content: ContentNode, jsonPath: string): boolean => {
  if (!pathNotExists(content, jsonPath)) {
    return false
  }

  if (!jsonPath.endsWith(APPEND_ARRAY_EXPRESSION)) {
    return false
  }

  jsonPath = jsonPath.replace(APPEND_ARRAY_EXPRESSION, '')

  const parent = jp.value(
    content,
    jsonPath.replace(APPEND_ARRAY_EXPRESSION, '')
  )

  return Array.isArray(parent)
}

const determineFinalFormat = (
  filePath: string,
  format: Format,
  action: Actions
): Format => {
  // try to guess format from file extension, if not provided
  if (format !== Format.UNKNOWN) {
    action.debug(`use ${format.toUpperCase()} format from configuration`)
    return format
  }

  format = formatGuesser(filePath)
  if (format !== Format.UNKNOWN) {
    action.debug(
      `use ${format.toUpperCase()} format, guessed from extension: ${filePath}`
    )
    return format
  }

  // use YAML as default if no extension matches
  action.debug(`use ${Format.YAML.toUpperCase()} format, as fallback`)
  return Format.YAML
}
