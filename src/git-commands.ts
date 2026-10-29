import { Octokit } from '@octokit/rest'
import { Actions } from './github-actions'
import { Committer, ChangedFile } from './types'

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
): Promise<{ commitSha: string; treeSha: string }> => {
  let commitSha = ''
  try {
    const { data: refData } = await octo.git.getRef({
      owner: org,
      repo,
      ref: `heads/${branch}`
    })

    if (!refData.object?.sha) {
      throw Error(`Failed to get current ref from heads/${branch}`)
    }

    commitSha = refData.object?.sha
  } catch (error) {
    const { data: refData } = await octo.git.getRef({
      owner: org,
      repo,
      ref: `heads/${masterBranchName}`
    })

    if (!refData.object?.sha) {
      throw Error(`Failed to get current ref from heads/master`)
    }

    commitSha = refData.object?.sha
  }

  const { data: commitData } = await octo.git.getCommit({
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

export const createBlobForFile = async (
  octo: Octokit,
  org: string,
  repo: string,
  file: ChangedFile
): Promise<string> => {
  const { data } = await octo.git.createBlob({
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

export const createNewTree = async (
  octo: Octokit,
  owner: string,
  repo: string,
  files: ChangedFile[],
  parentTreeSha: string
): Promise<string> => {
  const tree: GitCreateTreeParamsTree[] = []

  for (const file of files) {
    tree.push({
      path: file.relativePath,
      mode: `100644`,
      type: `blob`,
      sha: file.sha
    })
  }

  const { data } = await octo.git.createTree({
    owner,
    repo,
    tree,
    base_tree: parentTreeSha
  })

  return data.sha
}

export const createNewCommit = async (
  octo: Octokit,
  owner: string,
  repo: string,
  message: string,
  treeSha: string,
  commitSha: string,
  author: Committer
): Promise<string> => {
  const { data } = await octo.git.createCommit({
    owner,
    repo,
    message,
    tree: treeSha,
    parents: [commitSha],
    author
  })

  if (!data?.sha) {
    throw Error('Failed to create commit')
  }

  return data.sha
}

export class NonFastForwardError extends Error {}

const isNonFastForward = (error: unknown): boolean => {
  const { status, message } = error as { status?: number; message?: string }

  return status === 422 && /not a fast forward/i.test(message || '')
}

// The compare API lists at most this many changed files
const COMPARE_FILES_LIMIT = 300

export const changedPaths = async (
  octo: Octokit,
  owner: string,
  repo: string,
  base: string,
  head: string
): Promise<{ paths: string[]; complete: boolean }> => {
  let files
  try {
    const { data } = await octo.repos.compareCommits({
      owner,
      repo,
      base,
      head
    })
    files = data.files || []
  } catch (error) {
    if ((error as { status?: number }).status === 404) {
      throw new Error(
        `commit ${base} of the local checkout was not found in ${owner}/${repo}. Either it was never pushed, or workDir is a checkout of a different repository`
      )
    }

    throw error
  }

  return {
    paths: files.flatMap(file =>
      file.previous_filename
        ? [file.filename, file.previous_filename]
        : [file.filename]
    ),
    complete: files.length < COMPARE_FILES_LIMIT
  }
}

export const updateBranch = async (
  octo: Octokit,
  owner: string,
  repo: string,
  branch: string,
  force: boolean,
  commitSha: string,
  actions: Actions
): Promise<void> => {
  try {
    await octo.git.updateRef({
      owner,
      repo,
      ref: `heads/${branch}`,
      sha: commitSha,
      force
    })
  } catch (error) {
    // The branch moved since we read it, creating it would fail as well
    if (!force && isNonFastForward(error)) {
      throw new NonFastForwardError(`update branch ${branch} failed (${error})`)
    }

    actions.info(
      `update branch ${branch} failed (${error}), fallback to create branch`
    )

    try {
      await octo.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${branch}`,
        sha: commitSha
      })
    } catch (e) {
      throw new Error(`failed to create branch: ${e}`)
    }
  }
}

export function repositoryInformation(
  repository: string
): RepositoryInformation {
  const [owner, repo] = repository.split('/')

  return { owner, repo }
}
