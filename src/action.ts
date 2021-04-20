import YAML from 'js-yaml'
import fs from 'fs'
import path from 'path'
import {Options} from './options'
import {Octokit} from '@octokit/rest'
import {Actions} from './github-actions'
import {ChangedFile, repositoryInformation, currentCommit, createBlobForFile, createNewCommit, createNewTree, updateBranch} from './git-commands'

export type YamlNode = {[key: string]: string | number | boolean | YamlNode}

export async function run(options: Options, actions: Actions): Promise<void> {
  const filePath = path.join(process.cwd(), options.workDir, options.valueFile)

  actions.debug(`FilePath: ${filePath}, Parameter: ${JSON.stringify({cwd: process.cwd(), workDir: options.workDir, valueFile: options.valueFile})}`)

  try {
    const yamlContent: YamlNode = parseFile(filePath)

    actions.debug(`Parsed JSON: ${JSON.stringify(yamlContent)}`)

    const result = replace(options.value, options.propertyPath, yamlContent)

    const newYamlContent = convert(result)

    actions.debug(`Generated updated YAML
    
${newYamlContent}
`)

    if (options.updateFile === true) {
      writeTo(newYamlContent, filePath, actions)
    }

    if (options.commitChange === false) {
      return
    }

    const octokit = new Octokit({auth: options.token})

    const file: ChangedFile = {
      relativePath: options.valueFile,
      absolutePath: filePath,
      content: newYamlContent
    }

    await gitProcessing(options.repository, options.branch, file, options.message, octokit, actions)

    if (options.createPR) {
      await createPullRequest(
        options.repository,
        options.branch,
        options.targetBranch,
        options.labels,
        options.title || `Merge: ${options.message}`,
        octokit,
        actions
      )
    }
  } catch (error) {
    actions.setFailed(error)
    return
  }
}

export async function runTest<T extends YamlNode>(options: Options): Promise<{json: T; yaml: string}> {
  const filePath = path.join(process.cwd(), options.workDir, options.valueFile)

  const yamlContent: T = parseFile<T>(filePath)

  const json = replace<T>(options.value, options.propertyPath, yamlContent)
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

export function replace<T extends YamlNode>(value: string | number | boolean, valuePath: string, content: YamlNode): T {
  const contentCopy = JSON.parse(JSON.stringify(content))
  let scope: YamlNode = contentCopy
  let level = 0

  const yamlPath = valuePath.split('.')

  for (const key of yamlPath) {
    level++

    if (typeof scope[key] !== 'object' && level !== yamlPath.length) {
      throw new Error(`invalid property path - ${key} is not an object`)
    }

    if (false === scope.hasOwnProperty(key)) {
      scope[key] = {}
    }

    if (level !== yamlPath.length) {
      scope = scope[key] as YamlNode
    }

    if (level === yamlPath.length) {
      scope[key] = value
    }
  }

  return contentCopy
}

export function convert(yamlContent: YamlNode): string {
  return YAML.dump(yamlContent)
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
  file: ChangedFile,
  commitMessage: string,
  octokit: Octokit,
  actions: Actions
): Promise<void> {
  const {owner, repo} = repositoryInformation(repository)
  const {commitSha, treeSha} = await currentCommit(octokit, owner, repo, branch)

  actions.debug(JSON.stringify({baseCommit: commitSha, baseTree: treeSha}))

  file.sha = await createBlobForFile(octokit, owner, repo, file)

  actions.debug(JSON.stringify({fileBlob: file.sha}))

  const newTreeSha = await createNewTree(octokit, owner, repo, file, treeSha)

  actions.debug(JSON.stringify({createdTree: newTreeSha}))

  const newCommitSha = await createNewCommit(octokit, owner, repo, commitMessage, newTreeSha, commitSha)

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
  octokit: Octokit,
  actions: Actions
): Promise<void> {
  const {owner, repo} = repositoryInformation(repository)

  const response = await octokit.pulls.create({
    owner,
    repo,
    title,
    head: branch,
    base: targetBranch
  })

  actions.debug(`Create PR: #${response.data.id}`)

  actions.setOutput('pull_request', JSON.stringify(response.data))

  octokit.issues.addLabels({
    owner,
    repo,
    issue_number: response.data.number,
    labels
  })

  actions.debug(`Add Label: ${labels.join(', ')}`)
}
