import {Octokit} from '@octokit/rest'

export type ChangedFile = {
  absolutePath: string
  relativePath: string
  content: string
  sha?: string
}

export type GitCreateTreeParamsTree = {
  path?: string
  mode?: '100644' | '100755' | '040000' | '160000' | '120000'
  type?: 'blob' | 'tree' | 'commit'
  sha?: string | null
  content?: string
}

export type RepositoryInformation = {
  owner: string
  repo: string
}

export const currentCommit = async (
  octo: Octokit,
  org: string,
  repo: string,
  branch: string,
  masterBranchName: string
): Promise<{commitSha: string; treeSha: string}> => {
  let commitSha = ''
  try {
    const {data: refData} = await octo.git.getRef({
      owner: org,
      repo,
      ref: `heads/${branch}`
    })

    if (!refData.object?.sha) {
      throw Error(`Failed to get current ref from heads/${branch}`)
    }

    commitSha = refData.object?.sha
  } catch (error) {
    const {data: refData} = await octo.git.getRef({
      owner: org,
      repo,
      ref: `heads/${masterBranchName}`
    })

    if (!refData.object?.sha) {
      throw Error(`Failed to get current ref from heads/master`)
    }

    commitSha = refData.object?.sha
  }

  const {data: commitData} = await octo.git.getCommit({
    owner: org,
    repo,
    commit_sha: commitSha
  })

  if (!commitData.tree?.sha) {
    throw Error('Failed to get the commit')
  }

  return {
    commitSha,
    treeSha: commitData.tree?.sha
  }
}

export const createBlobForFile = async (octo: Octokit, org: string, repo: string, file: ChangedFile): Promise<string> => {
  const {data} = await octo.git.createBlob({
    owner: org,
    repo,
    content: file.content,
    encoding: 'utf-8'
  })

  if (!data?.sha) {
    throw Error('Failed to create file blob')
  }

  return data.sha
}

export const createNewTree = async (octo: Octokit, owner: string, repo: string, file: ChangedFile, parentTreeSha: string): Promise<string> => {
  const tree: GitCreateTreeParamsTree[] = [{path: file.relativePath, mode: `100644`, type: `blob`, sha: file.sha}]

  const {data} = await octo.git.createTree({owner, repo, tree, base_tree: parentTreeSha})

  return data.sha
}

export const createNewCommit = async (
  octo: Octokit,
  owner: string,
  repo: string,
  message: string,
  treeSha: string,
  commitSha: string
): Promise<string> => {
  const {data} = await octo.git.createCommit({
    owner,
    repo,
    message,
    tree: treeSha,
    parents: [commitSha]
  })

  if (!data?.sha) {
    throw Error('Failed to create commit')
  }

  return data.sha
}

export const updateBranch = async (octo: Octokit, owner: string, repo: string, branch: string, commitSha: string): Promise<void> => {
  try {
    await octo.git.updateRef({
      owner,
      repo,
      ref: `heads/${branch}`,
      sha: commitSha
    })
  } catch (e) {
    await octo.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branch}`,
      sha: commitSha
    })
  }
}

export function repositoryInformation(repository: string): RepositoryInformation {
  const [owner, repo] = repository.split('/')

  return {owner, repo}
}
