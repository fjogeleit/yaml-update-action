import YAML from 'js-yaml'
import fs from 'fs'
import path from 'path'
import jp from 'jsonpath'
import {Options} from './options'
import {Octokit} from '@octokit/rest'
import {Actions} from './github-actions'
import {ChangedFile, createBlobForFile, createNewCommit, createNewTree, currentCommit, repositoryInformation, updateBranch} from './git-commands'
import {Committer} from './committer'

export type YamlNode = {[key: string]: string | number | boolean | YamlNode | YamlNode[]}

export async function run(options: Options, actions: Actions): Promise<void> {
  const filePath = path.join(process.cwd(), options.workDir, options.valueFile)
  let value: string | number | boolean = options.value

  try {
    value = convertValue(options.value)
  } catch {
    actions.warning(`exception while trying to convert value '${value}'`)
  }

  actions.debug(`FilePath: ${filePath}, Parameter: ${JSON.stringify({cwd: process.cwd(), workDir: options.workDir, valueFile: options.valueFile})}`)

  try {
    const yamlContent: YamlNode = parseFile(filePath)

    actions.debug(`Parsed JSON: ${JSON.stringify(yamlContent)}`)

    const result = replace(value, options.propertyPath, yamlContent)

    const newYamlContent = convert(result)

    actions.debug(`Generated updated YAML
    
${newYamlContent}
`)
    // if nothing changed, do not commit, do not create PR's, skip the rest of the workflow
    if (yamlContent === result) {
      actions.debug(`Nothing changed, skipping rest of the workflow.`)
      return
    }

    if (options.updateFile === true) {
      writeTo(newYamlContent, filePath, actions)
    }

    if (options.commitChange === false) {
      return
    }

    const octokit = new Octokit({auth: options.token, baseUrl: options.githubAPI})

    const file: ChangedFile = {
      relativePath: options.valueFile,
      absolutePath: filePath,
      content: newYamlContent
    }

    await gitProcessing(options.repository, options.branch, options.masterBranchName, file, options.message, octokit, actions, options.committer)

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
    actions.setFailed((error as Error).toString())
    return
  }
}

export async function runTest<T extends YamlNode>(options: Options): Promise<{json: T; yaml: string}> {
  const filePath = path.join(process.cwd(), options.workDir, options.valueFile)

  const value = convertValue(options.value)
  const yamlContent: T = parseFile<T>(filePath)

  const json = replace<T>(value, options.propertyPath, yamlContent)
  const yaml = convert(json)

  return {json, yaml}
}

export function parseFile<T extends YamlNode>(filePath: string): T {
  if (!fs.existsSync(filePath)) {
    throw new Error(`could not parse file with path: ${filePath}`)
  }

  const result: T = YAML.load(fs.readFileSync(filePath, 'utf8')) as T

  if (typeof result !== 'object') {
    throw new Error(`could not parse content as YAML`)
  }

  return result
}

export function replace<T extends YamlNode>(value: string | number | boolean, jsonPath: string, content: YamlNode): T {
  const copy = JSON.parse(JSON.stringify(content))

  if (!jsonPath.startsWith('$')) {
    jsonPath = `$.${jsonPath}`
  }

  jp.value(copy, jsonPath, value)

  return copy
}

export function convert(yamlContent: YamlNode): string {
  return YAML.dump(yamlContent, {lineWidth: -1})
}

export function writeTo(yamlString: string, filePath: string, actions: Actions): void {
  fs.writeFile(filePath, yamlString, err => {
    if (!err) return

    actions.warning(err.message)
  })
}

export async function gitProcessing(
  repository: string,
  branch: string,
  masterBranchName: string,
  file: ChangedFile,
  commitMessage: string,
  octokit: Octokit,
  actions: Actions,
  committer: Committer
): Promise<void> {
  const {owner, repo} = repositoryInformation(repository)
  const {commitSha, treeSha} = await currentCommit(octokit, owner, repo, branch, masterBranchName)

  actions.debug(JSON.stringify({baseCommit: commitSha, baseTree: treeSha}))

  file.sha = await createBlobForFile(octokit, owner, repo, file)

  actions.debug(JSON.stringify({fileBlob: file.sha}))

  const newTreeSha = await createNewTree(octokit, owner, repo, file, treeSha)

  actions.debug(JSON.stringify({createdTree: newTreeSha}))

  const newCommitSha = await createNewCommit(octokit, owner, repo, commitMessage, newTreeSha, commitSha, committer)

  actions.debug(JSON.stringify({createdCommit: newCommitSha}))
  actions.setOutput('commit', newCommitSha)

  await updateBranch(octokit, owner, repo, branch, newCommitSha)

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
  const {owner, repo} = repositoryInformation(repository)

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

    actions.debug(`Add Reviewers: ${[...reviewers, ...teamReviewers].join(', ')}`)
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
