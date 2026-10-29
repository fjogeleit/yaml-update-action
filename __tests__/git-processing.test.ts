import { Octokit } from '@octokit/rest'
import { gitProcessing } from '../src/action'
import { EmptyActions } from '../src/github-actions'
import { ChangedFile } from '../src/types'

type Commit = { sha: string; files: string[] }

type FakeRepo = {
  history: Commit[]
  // Paths changed by commits that land on the branch while we try to update it
  concurrentChanges: string[][]
  updateRefCalls: string[]
  createRefCalls: number
}

class RecordingActions extends EmptyActions {
  outputs: { [name: string]: string } = {}

  setOutput(name: string, output: string): void {
    this.outputs[name] = output
  }
}

const head = (repo: FakeRepo): string =>
  repo.history[repo.history.length - 1].sha

// Lands commits on the branch, e.g. between the checkout and the action reading the branch
const land = (repo: FakeRepo, changes: string[][]): void => {
  for (const files of changes) {
    repo.history.push({ sha: `c${repo.history.length}`, files })
  }
}

const httpError = (status: number, message: string): Error =>
  Object.assign(new Error(message), { status })

const fakeOctokit = (repo: FakeRepo, ourFiles: string[]): Octokit => {
  let commits = 0

  return {
    git: {
      getRef: async () => ({ data: { object: { sha: head(repo) } } }),
      getCommit: async ({ commit_sha }: { commit_sha: string }) => ({
        data: { tree: { sha: `tree-${commit_sha}` } }
      }),
      createBlob: async () => ({ data: { sha: 'blob' } }),
      createTree: async ({ base_tree }: { base_tree: string }) => ({
        data: { sha: `new-${base_tree}` }
      }),
      createCommit: async () => ({ data: { sha: `commit-${++commits}` } }),
      updateRef: async ({ sha }: { sha: string }) => {
        repo.updateRefCalls.push(sha)

        const concurrent = repo.concurrentChanges.shift()
        if (concurrent) {
          land(repo, [concurrent])
          throw httpError(422, 'Update is not a fast forward')
        }

        repo.history.push({ sha, files: ourFiles })
        return { data: {} }
      },
      createRef: async () => {
        repo.createRefCalls++
        return { data: {} }
      }
    },
    repos: {
      compareCommits: async ({ base }: { base: string }) => {
        const index = repo.history.findIndex(commit => commit.sha === base)
        if (index < 0) {
          throw httpError(404, 'Not Found')
        }

        return {
          data: {
            files: repo.history
              .slice(index + 1)
              .flatMap(commit => commit.files)
              .map(filename => ({ filename }))
          }
        }
      }
    }
  } as unknown as Octokit
}

const OUR_FILE = 'apps/a/values.yaml'

const files = (): ChangedFile[] => [
  {
    absolutePath: `/work/${OUR_FILE}`,
    relativePath: OUR_FILE,
    content: 'version: v2',
    json: {}
  }
]

const newRepo = (concurrentChanges: string[][] = []): FakeRepo => ({
  history: [{ sha: 'checkout', files: [] }],
  concurrentChanges,
  updateRefCalls: [],
  createRefCalls: 0
})

const run = async (
  repo: FakeRepo,
  actions: RecordingActions,
  {
    retries = 3,
    localCommit = 'checkout',
    octokit = undefined as Octokit | undefined
  } = {}
): Promise<void> =>
  gitProcessing(
    'owner/repo',
    'main',
    false,
    'master',
    files(),
    'update',
    octokit || fakeOctokit(repo, [OUR_FILE]),
    actions,
    { name: 'bot', email: 'bot@example.com' },
    localCommit,
    retries,
    async () => {}
  )

test('commits without retrying when the branch did not move', async () => {
  const repo = newRepo()
  const actions = new RecordingActions()

  await run(repo, actions)

  expect(repo.updateRefCalls).toEqual(['commit-1'])
  expect(actions.outputs.commit).toBe('commit-1')
})

test('rebuilds the commit on the new head when the branch moved', async () => {
  const repo = newRepo([['apps/b/values.yaml']])
  const actions = new RecordingActions()

  await run(repo, actions)

  expect(repo.updateRefCalls).toEqual(['commit-1', 'commit-2'])
  expect(actions.outputs.commit).toBe('commit-2')
  expect(repo.createRefCalls).toBe(0)
})

test('commits on top of unrelated changes made after the checkout', async () => {
  const repo = newRepo()
  land(repo, [['apps/b/values.yaml']])
  const actions = new RecordingActions()

  await run(repo, actions)

  expect(repo.updateRefCalls).toEqual(['commit-1'])
  expect(actions.outputs.commit).toBe('commit-1')
})

test('fails after all retries when the branch keeps moving', async () => {
  const repo = newRepo([
    ['apps/b/values.yaml'],
    ['apps/c/values.yaml'],
    ['apps/d/values.yaml']
  ])
  const actions = new RecordingActions()

  await expect(run(repo, actions, { retries: 2 })).rejects.toThrow(
    'not a fast forward'
  )
  expect(repo.updateRefCalls).toHaveLength(3)
  expect(repo.createRefCalls).toBe(0)
  expect(actions.outputs.commit).toBeUndefined()
})

test('does not retry when retries is 0', async () => {
  const repo = newRepo([['apps/b/values.yaml']])
  const actions = new RecordingActions()

  await expect(run(repo, actions, { retries: 0 })).rejects.toThrow(
    'not a fast forward'
  )
  expect(repo.updateRefCalls).toHaveLength(1)
  expect(actions.outputs.commit).toBeUndefined()
})

test('does not overwrite concurrent changes to the same file', async () => {
  const repo = newRepo([[OUR_FILE]])
  const actions = new RecordingActions()

  await expect(run(repo, actions)).rejects.toThrow(
    `changes to ${OUR_FILE} since checkout`
  )
  expect(repo.updateRefCalls).toHaveLength(1)
  expect(actions.outputs.commit).toBeUndefined()
})

test('does not overwrite a change made between the checkout and the first read', async () => {
  const repo = newRepo()
  land(repo, [[OUR_FILE]])
  const actions = new RecordingActions()

  await expect(run(repo, actions)).rejects.toThrow(
    `changes to ${OUR_FILE} since checkout`
  )
  expect(repo.updateRefCalls).toHaveLength(0)
})

test('does not overwrite a change made before the first read when retrying', async () => {
  // checkout at C0, C1 changes our file before we read the branch,
  // C2 changes another file while we update it
  const repo = newRepo([['apps/b/values.yaml']])
  land(repo, [[OUR_FILE]])
  const actions = new RecordingActions()

  await expect(run(repo, actions)).rejects.toThrow(
    `changes to ${OUR_FILE} since checkout`
  )
  expect(repo.updateRefCalls).toHaveLength(0)
  expect(actions.outputs.commit).toBeUndefined()
})

test('fails closed when the compare result may be truncated', async () => {
  const repo = newRepo()
  land(repo, [Array.from({ length: 300 }, (_, i) => `other/${i}.yaml`)])
  const actions = new RecordingActions()

  await expect(run(repo, actions)).rejects.toThrow('too many changes')
  expect(repo.updateRefCalls).toHaveLength(0)
})

test('fails when the local commit is not known to the repository', async () => {
  const repo = newRepo()
  land(repo, [['apps/b/values.yaml']])
  const actions = new RecordingActions()

  await expect(run(repo, actions, { localCommit: 'unpushed' })).rejects.toThrow(
    'commit unpushed of the local checkout was not found'
  )
  expect(repo.updateRefCalls).toHaveLength(0)
})

test('falls back to the first read branch head without a local checkout', async () => {
  const repo = newRepo([['apps/b/values.yaml']])
  land(repo, [['apps/c/values.yaml']])
  const actions = new RecordingActions()

  await run(repo, actions, { localCommit: '' })

  expect(repo.updateRefCalls).toEqual(['commit-1', 'commit-2'])
  expect(actions.outputs.commit).toBe('commit-2')
})

test('still creates the branch when it does not exist yet', async () => {
  const repo = newRepo()
  const octokit = fakeOctokit(repo, [OUR_FILE])
  octokit.git.updateRef = (async () => {
    throw httpError(422, 'Reference does not exist')
  }) as unknown as typeof octokit.git.updateRef
  const actions = new RecordingActions()

  await run(repo, actions, { octokit })

  expect(repo.createRefCalls).toBe(1)
  expect(actions.outputs.commit).toBe('commit-1')
})

test('fails without a commit output when creating the branch fails', async () => {
  const repo = newRepo()
  const octokit = fakeOctokit(repo, [OUR_FILE])
  octokit.git.updateRef = (async () => {
    throw httpError(422, 'Reference does not exist')
  }) as unknown as typeof octokit.git.updateRef
  octokit.git.createRef = (async () => {
    throw httpError(403, 'Resource not accessible by integration')
  }) as unknown as typeof octokit.git.createRef
  const actions = new RecordingActions()

  await expect(run(repo, actions, { octokit })).rejects.toThrow(
    'failed to create branch'
  )
  expect(actions.outputs.commit).toBeUndefined()
})
