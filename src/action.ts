import YAML from 'js-yaml'
import fs from 'fs'
import path from 'path'
import {Options, Author} from './options'
import simpleGit, {SimpleGit} from 'simple-git'
import {Octokit} from './github-client'
import {Actions} from './github-actions'

const git: SimpleGit = simpleGit({
  baseDir: process.cwd(),
  binary: 'git',
  maxConcurrentProcesses: 6
})

export type YamlNode = {[key: string]: string | number | boolean | YamlNode}

export async function run<T extends YamlNode>(options: Options, actions: Actions): Promise<void> {
  const filePath = path.join(process.cwd(), options.valueFile)

  try {
    const yamlContent: T = parseFile<T>(filePath)

    actions.debug(`Parsed JSON: ${JSON.stringify(yamlContent)}`)

    const result = replace<T>(options.value, options.propertyPath, yamlContent)

    const newYamlContent = convert(result)

    actions.debug(`Generated updated YAML
    
    ${newYamlContent}
    `)

    writeTo(newYamlContent, filePath)

    actions.debug(`Local File ${filePath} was updated`)
  } catch (error) {
    actions.setFailed(error.toString())
    return
  }

  try {
    await gitProcessing(options.branch, options.valueFile, options.message, options.author, actions)

    if (options.createPR) {
      await createPullRequest(options.branch, options.targetBranch, options.token, options.message, actions)
    }
  } catch (error) {
    actions.setFailed(error.toString())
  }
}

export async function runTest<T extends YamlNode>(options: Options): Promise<T> {
  const filePath = path.join(process.cwd(), options.valueFile)

  const yamlContent: T = parseFile<T>(filePath)

  return replace<T>(options.value, options.propertyPath, yamlContent)
}

export function parseFile<T extends YamlNode>(filePath: string): T {
  if (!fs.existsSync(filePath)) {
    throw new Error(`could not parse file with path: ${filePath}`)
  }

  const result: T = YAML.safeLoad(fs.readFileSync(filePath, 'utf8')) as T

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
  return YAML.safeDump(yamlContent)
}

export function writeTo(yamlString: string, filePath: string): void {
  fs.writeFileSync(filePath, yamlString)
}

export async function gitProcessing(branch: string, filePath: string, commitMessage: string, author: Author, actions: Actions): Promise<void> {
  await git.addConfig('user.email', author.email).addConfig('user.name', author.name)

  await git.fetch(['--tags', '--force'])

  await git.checkout(branch, undefined).catch(() => git.checkoutLocalBranch(branch))

  actions.debug(`Branch checkout: ${actions}`)

  await git
    .fetch()
    .pull('origin', branch, {'--no-rebase': null})
    .catch(() => {})

  actions.debug(`Pulled last changes`)

  await git.add(filePath)

  const summery = await git.commit(commitMessage)

  actions.debug(`Commited: ${summery.commit}`)

  actions.setOutput('commit', JSON.stringify(summery))

  const pushed = await git.push('origin', branch, {'--set-upstream': null})

  actions.debug(`Pushed branch to origin: ${pushed.branch}`)

  actions.setOutput('push', JSON.stringify(pushed))
}

export async function createPullRequest(branch: string, targetBranch: string, token: string, commitMessage: string, actions: Actions): Promise<void> {
  const octokit = new Octokit({auth: token})

  const {owner, repo} = await getRemoteDetail()

  const response = await octokit.pulls.create({
    owner,
    repo,
    title: `Merge: ${commitMessage}`,
    head: branch,
    base: targetBranch
  })

  actions.debug(`Create PR: #${response.data.id}`)

  actions.setOutput('pull_request', JSON.stringify(response.data))

  octokit.issues.addLabels({
    owner,
    repo,
    issue_number: response.data.number,
    labels: ['yaml-update']
  })

  actions.debug(`Add Label: "yaml-update"`)
}

interface RepositoryInformation {
  owner: string
  repo: string
}

export async function getRemoteDetail(): Promise<RepositoryInformation> {
  const config = (await git.listConfig()).all

  const remoteUrl: string = (config['remote.origin.url'] as string) || ''

  const httpsUrlPattern = /^https:\/\/.*@?github.com\/(.+\/.+)$/i
  const sshUrlPattern = /^git@github.com:(.+\/.+).git$/i

  const httpsMatch = remoteUrl.match(httpsUrlPattern)
  if (httpsMatch) {
    const [owner, repo] = httpsMatch[1].split('/')

    return {owner, repo}
  }

  const sshMatch = remoteUrl.match(sshUrlPattern)
  if (sshMatch) {
    const [owner, repo] = sshMatch[1].split('/')

    return {owner, repo}
  }

  throw new Error(`The format of '${remoteUrl}' is not a valid GitHub repository URL`)
}
